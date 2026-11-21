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
      CREATE TABLE size_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, group_name text);
      CREATE TABLE size_group_breakdown(size_group_id uuid, qty integer);
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
    const { id: group } = await one("INSERT INTO size_groups(order_id,group_name) VALUES ($1,'Kids') RETURNING id",[first])
    await one('INSERT INTO size_group_breakdown VALUES ($1,100)',[group])
    payload.materials[0].usage='By Size Group'
    await one('UPDATE bulk_bom_drafts SET draft=$1 WHERE id=$2',[JSON.stringify(payload),id])
    const grouped = await review(['S'])
    assert.equal(grouped.find(row=>row.po==='B'&&row.after.library_item_id===tag).action,'Blocked')
    const kids = grouped.find(row=>row.po==='A'&&row.after.library_item_id===tag)
    assert.deepEqual(kids.after.usage_data,{Kids:1})
    assert.equal(kids.after.final_qty,105)
  } finally {
    await db.close()
  }
})
