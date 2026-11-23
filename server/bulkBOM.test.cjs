const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

test('Bulk BOM scopes to one buyer, adds without replacing, and requires a fresh review for overrides', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE FUNCTION public.team_can_access(text,text) RETURNS boolean LANGUAGE sql
        AS $$SELECT coalesce(current_setting('test.allow',true),'')='yes'$$;
      CREATE TABLE buyers(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id uuid, style_number text,
        po_number text, store_name text,total_qty numeric,step_bom boolean DEFAULT false);
      CREATE TABLE library_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, category text,
        colour text, composition text, weight text, width_inches numeric, description text, unit text,
        packing_form text, default_wastage numeric);
      CREATE TABLE size_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, group_name text, sizes text[]);
      CREATE TABLE size_group_colors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), size_group_id uuid, color_name text);
      CREATE TABLE size_group_breakdown(size_group_id uuid, color_id uuid, size text, qty integer);
      CREATE TABLE finishing_packs(order_id uuid);
      CREATE TABLE bom_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, library_item_id uuid,
        category text,name text, detail text,specification text, unit text, usage_rule text, usage_data jsonb, base_qty numeric,
        final_qty numeric,wastage numeric,sort_order integer, use_cutting_qty boolean, notes text);
    `)
    await db.exec(readFileSync(join(__dirname,'migrations/20261121_bulk_bom.sql'),'utf8'))
    const one = async (sql, args) => (await db.query(sql,args)).rows[0]
    const firstBuyer = (await one('INSERT INTO buyers DEFAULT VALUES RETURNING id')).id
    const secondBuyer = (await one('INSERT INTO buyers DEFAULT VALUES RETURNING id')).id
    const { id: first } = await one("INSERT INTO orders(buyer_id,style_number,po_number,total_qty) VALUES ($1,'S','A',100) RETURNING id",[firstBuyer])
    await one("INSERT INTO orders(buyer_id,style_number,po_number,total_qty) VALUES ($1,'S','B',50),($2,'S','C',200),($1,'T','D',10)",[firstBuyer,secondBuyer])
    const { id: tag } = await one("INSERT INTO library_items(name,category,unit,description,default_wastage) VALUES ('Hangtag','Packing Trim','pcs','White',5) RETURNING id")
    const { id: silica } = await one("INSERT INTO library_items(name,category,unit,default_wastage) VALUES ('Silica gel','Packing Trim','pcs',5) RETURNING id")
    const { id: line } = await one("INSERT INTO bom_items(order_id,library_item_id,name,category,unit,detail,usage_rule,base_qty,final_qty,wastage,notes) VALUES ($1,$2,'Hangtag','Packing Trim','pcs','Blue','Generic',1,105,5,'Keep') RETURNING id",[first,tag])
    const payload = { styles:['S','T'], materials:[tag,silica].map(id=>({id,usage:'Generic',shared:true,rate:'1',settings:{}})) }
    const { id } = await one("INSERT INTO bulk_bom_drafts(name,buyer_id,draft) VALUES ('Test',$1,$2) RETURNING id",[firstBuyer,JSON.stringify(payload)])
    const review = async (styles, expected=null, replaces=[]) => (await one('SELECT bulk_bom_review($1,$2,$3,$4) AS result',[id,styles,expected&&JSON.stringify(expected),replaces])).result
    await db.exec('SET ROLE anon')
    await assert.rejects(review(['S']),/requires Library access and Orders/)
    await db.exec("SET test.allow='yes'")
    await assert.rejects(review(['Unknown']),/Select styles/)
    const rows = await review(['S'])
    assert.deepEqual([...new Set(rows.map(row=>row.po))].sort(),['A','B'])
    assert.equal(rows.filter(row=>row.action==='Add').length,3)
    assert.equal(rows.find(row=>row.po==='A'&&row.after.library_item_id===tag).action,'Replace')
    await review(['S'],rows)
    await db.exec('RESET ROLE')
    assert.equal((await one('SELECT detail FROM bom_items WHERE id=$1',[line])).detail,'Blue')
    assert.equal((await one('SELECT count(*)::int AS n FROM bom_items')).n,4)
    const updated = await review(['S'])
    await one('UPDATE bom_items SET notes=$1 WHERE id=$2',['New note',line])
    await assert.rejects(review(['S'],updated,[line]),/changed/)
    await review(['S'],await review(['S']),[line])
    assert.deepEqual(await one('SELECT detail,notes FROM bom_items WHERE id=$1',[line]),{detail:'White',notes:'New note'})
    assert.equal((await review(['S'])).every(row=>row.action==='Unchanged'),true)
    await db.exec(readFileSync(join(__dirname,'migrations/20261121_bulk_bom_usage_parity.sql'),'utf8'))
    await db.exec(readFileSync(join(__dirname,'migrations/20261123_bulk_bom_size_overrides.sql'),'utf8'))
    const { buildBOMMatrix, calculateBOMFinalQty } = await import('../src/lib/bomUsage.js')
    const group = await one("INSERT INTO size_groups(order_id,group_name,sizes) VALUES ($1,'Kids',ARRAY['4','6']) RETURNING *",[first])
    const color = await one("INSERT INTO size_group_colors(size_group_id,color_name) VALUES ($1,'Indigo') RETURNING *",[group.id])
    const breakdown = (await db.query("INSERT INTO size_group_breakdown VALUES ($1,$2,'4',60),($1,$2,'6',40) RETURNING *",[group.id,color.id])).rows
    const poData = buildBOMMatrix([group], [color], breakdown)
    payload.materials[0].usage='By Size Group'
    await one('UPDATE bulk_bom_drafts SET draft=$1 WHERE id=$2',[JSON.stringify(payload),id])
    const grouped = await review(['S'])
    assert.equal(grouped.find(row=>row.po==='B'&&row.after.library_item_id===tag).action,'Blocked')
    const kids = grouped.find(row=>row.po==='A'&&row.after.library_item_id===tag)
    assert.deepEqual(JSON.parse(kids.after.usage_data),{Kids:{value:1,na:false}})
    assert.equal(kids.after.final_qty,105)

    // A saved pre-parity draft still accepts the old style-specific rates.
    payload.materials[0] = {id:tag,usage:'By Size Group',shared:false,settings:{S:{rates:{Kids:'2'}}}}
    await one('UPDATE bulk_bom_drafts SET draft=$1 WHERE id=$2',[JSON.stringify(payload),id])
    assert.equal((await review(['S'])).find(row=>row.po==='A'&&row.after.library_item_id===tag).after.final_qty,210)

    const cases = [
      ['Generic', {generic:{value:'1.25',na:false}}, 137.5],
      ['By Color', {Indigo:{value:'2',na:false}}, 220],
      ['By Size Group', {Kids:{value:'3',na:false}}, 330],
      ['By Individual Sizes', {4:{value:'2',na:false},6:{value:'',na:true}}, 132],
      ['Configure Own', {__matrix:[{sgName:'Kids',colorName:'Indigo',consumption:'4',na:false}]}, 440],
      ['Configure Own', {__matrix:[{sgName:'Kids',colorName:'Indigo',consumption:'4',overrides:[{size:'4',consumption:'2'}]}]}, 308],
      ['Configure Own', {__matrix:[{sgName:'Kids',colorName:'Indigo',na:true,overrides:[{size:'4',consumption:'2'}]}]}, 132],
      ['Configure Own', {__matrix:[{sgName:'Kids',colorName:'Indigo',consumption:'4',overrides:[{size:'4',na:true}]}]}, 176],
      ['By Batch', {__batches:[
        {name:'A',consumption:'2',cells:[{sgName:'Kids',colorName:'Indigo',size:'4'}]},
        {name:'B',consumption:'4',cells:[{sgName:'Kids',colorName:'Indigo',size:'6'}]},
      ]}, 308],
    ]
    await db.exec("UPDATE orders SET style_number='Other' WHERE po_number='B'")
    payload.styles = ['S']
    for (const [usage, usageData, quantity] of cases) {
      payload.materials = [{id:tag,usage,shared:false,settings:{S:{wastage:'10',usageData}}}]
      await one('UPDATE bulk_bom_drafts SET draft=$1 WHERE id=$2',[JSON.stringify(payload),id])
      const rows = await review(['S'])
      assert.equal(rows[0].action,'Replace',usage)
      assert.equal(rows[0].after.final_qty,quantity,usage)
      await review(['S'],rows,[line])
      const saved = await one('SELECT * FROM bom_items WHERE id=$1',[line])
      assert.equal(saved.usage_rule,usage)
      assert.deepEqual(JSON.parse(saved.usage_data),usageData)
      assert.equal(Number(saved.wastage),10)
      assert.equal(Number(saved.final_qty),quantity)
      assert.equal(Number(calculateBOMFinalQty(saved,{totalQty:100,poData})),quantity)
    }
    const before = await one('SELECT * FROM bom_items WHERE id=$1',[line])
    const late = await one("INSERT INTO library_items(name,category,unit) VALUES ('Late trim','Stitching Trim','pcs') RETURNING id")
    payload.materials.push({id:late.id,usage:'Generic',shared:true,rate:'1',settings:{}})
    await one('UPDATE bulk_bom_drafts SET draft=$1 WHERE id=$2',[JSON.stringify(payload),id])
    const lateReview = await review(['S'])
    assert.deepEqual(lateReview.map(row=>row.action),['Unchanged','Add'])
    await review(['S'],lateReview)
    assert.deepEqual(await one('SELECT * FROM bom_items WHERE id=$1',[line]),before)
    assert.equal((await one('SELECT count(*)::int AS n FROM bom_items WHERE order_id=$1',[first])).n,3)

    payload.materials[0].settings.S.usageData.__batches.pop()
    await one('UPDATE bulk_bom_drafts SET draft=$1 WHERE id=$2',[JSON.stringify(payload),id])
    assert.match((await review(['S']))[0].issue,/Kids \/ Indigo \/ 6/)

    await db.exec(readFileSync(join(__dirname,'migrations/20261123_bulk_bom_replacement.sql'),'utf8'))
    await db.exec(readFileSync(join(__dirname,'migrations/20261123_bulk_bom_consumption_totals.sql'),'utf8'))
    const totalsDraft = {styles:['S'], materials:[{id:tag,usage:'Generic',shared:true,rate:1,settings:{S:{sharedRate:'2',wastage:'5'}}}]}
    const totals = await one('SELECT * FROM bulk_bom_consumption_totals($1,$2)',[firstBuyer,JSON.stringify(totalsDraft)])
    assert.equal(Number(totals.qty),210)
    assert.equal(totals.issue,null)
    await db.exec(readFileSync(join(__dirname,'migrations/20261123_bulk_bom_exclude_trim.sql'),'utf8'))
    totalsDraft.styles.push('Other')
    totalsDraft.materials[0].settings.S.excluded = true
    const included = await db.query('SELECT style FROM bulk_bom_consumption_totals($1,$2)',[firstBuyer,JSON.stringify(totalsDraft)])
    assert.deepEqual(included.rows,[{style:'Other'}])
    const web = async (expected=null, removals=[]) => (await one(
      'SELECT bulk_bom_review_web($1,$2,$3,$4,$5) AS result',
      [id,['S'],expected && JSON.stringify(expected),[],removals])).result
    payload.materials = [payload.materials[1]]
    const saveDraft = () => one('UPDATE bulk_bom_drafts SET draft=$1 WHERE id=$2',[JSON.stringify(payload),id])
    await saveDraft()
    const keep = await web()
    assert.equal(keep.filter(r => r.action === 'Keep').length,2)
    await web(keep)
    payload.replaceStyles = ['S']
    await saveDraft()
    const replace = await web()
    const removals = replace.filter(r => r.action === 'Remove').map(r => r.before.id)
    assert.equal(removals.length,2)
    await assert.rejects(web(replace),/Confirm the reviewed removals/)
    await one('UPDATE bom_items SET notes=$1 WHERE id=$2',['Changed after review',line])
    await assert.rejects(web(replace,removals),/Refresh the review/)
    await web(await web(),removals)
    assert.deepEqual((await db.query('SELECT library_item_id FROM bom_items WHERE order_id=$1',[first])).rows,
      [{library_item_id:late.id}])
  } finally {
    await db.close()
  }
})
