'use strict'

const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {queueOrderSection,queueBom,queuePoMatrix,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('the desktop PO Matrix queues an atomic edit and preserves linked Washing IDs',async()=>{
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
 const db=new PGlite(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-po-matrix-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema desktop_private; grant usage on schema desktop_private to service_role;
   create table users(id uuid primary key,role text,is_active bool,is_restricted bool);
   create table orders(id uuid primary key,step_po_matrix boolean,total_qty integer,total_value_usd numeric,
    excess_cutting_pct numeric,queue_split_rule text,step_bom bool default false,step_washing bool,step_processes bool,step_embellishment bool,step_fitting bool,step_finishing bool,notes text);
   create table size_groups(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),group_name text,
    unit_price numeric,currency text,sizes text[],base_size text,sort_order integer);
   create table size_group_colors(id uuid primary key default gen_random_uuid(),size_group_id uuid references size_groups(id),
    color_name text,sort_order integer,ratio_override jsonb,ratio_locked bool);
   create table size_group_breakdown(id uuid primary key default gen_random_uuid(),size_group_id uuid references size_groups(id),
    color_id uuid references size_group_colors(id),size text,qty int);
   create table bom_items(id uuid primary key,order_id uuid references orders(id),library_item_id uuid,name text not null,
    category text,detail text,specification text,unit text,supplier_id uuid,usage_rule text,usage_data jsonb,final_qty numeric,
    base_qty numeric,wastage numeric,custom_usage jsonb,notes text,sort_order int,use_cutting_qty bool);
   create table washing(id uuid primary key,color_id uuid references size_group_colors(id),order_id uuid references orders(id),wash_type text);
   create table order_processes(id uuid primary key,order_id uuid references orders(id),process_name text,is_custom bool,sort_order integer);
   create table fitting_blocks(id uuid primary key,order_id uuid references orders(id),block_name text,spec_code text,usage_rule text,usage_data jsonb,dxf_filename text,dxf_base64 text,sort_order int);
   create table order_queues(id uuid primary key,order_id uuid,job_id uuid,size_group_id uuid,qty int,split_rule text,label text);
   create table purchase_order_items(id uuid primary key,source_id uuid,source_type text);
   create table finishing(id uuid primary key,order_id uuid,use_cutting_qty bool,total_qty int);
   create table finishing_packs(id uuid primary key,finishing_id uuid references finishing(id),order_id uuid,pack_name text,pack_type text,
    packing_basis text,config jsonb,inner_pack_type text,carton_style text,
    carton_l numeric,carton_w numeric,carton_h numeric,carton_weight_kg numeric,units_per_carton numeric,qty_assigned numeric,sort_order numeric,pieces_per_pack numeric,pieces_per_carton numeric,length_cm numeric,width_cm numeric,height_cm numeric,weight_kg numeric,assigned_qty numeric,total_cartons numeric,total_cbm numeric);
   create table embellishments(id uuid primary key,order_id uuid references orders(id),description text);
   grant select,insert,update,delete on all tables in schema public to service_role;
   insert into users values('${id(1)}','admin',true,false);
   insert into orders values('${id(2)}',true,1,2,0,'None');
   insert into size_groups values('${id(3)}','${id(2)}','Kids',2,'USD','{M}',null,0);
   insert into size_group_colors values('${id(4)}','${id(3)}','Blue',0,null,false);
   insert into size_group_breakdown values('${id(5)}','${id(3)}','${id(4)}','M',1);
   insert into washing values('${id(6)}','${id(4)}','${id(2)}','Fixture Wash');
  `)
  for(const migration of ['../supabase/migrations/20261017_po_matrix_preserve_linked_ids.sql','migrations/20261118_desktop_po_matrix.sql','migrations/20261118_desktop_bom.sql','migrations/20261118_desktop_order_sections.sql','migrations/20261118_desktop_z_order_fitting.sql','migrations/20261118_desktop_z_po_matrix_ids.sql','migrations/20261118_desktop_zz_order_queues.sql','migrations/20261118_desktop_finishing.sql'])
   await db.exec(fs.readFileSync(path.join(__dirname,migration),'utf8'))
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const tables=['orders','size_groups','size_group_colors','size_group_breakdown','washing','bom_items','order_processes','embellishments','fitting_blocks','order_queues','finishing','finishing_packs']
  const pull=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>
   [table,(await db.query('select to_jsonb(t) as row from '+table+' t')).rows.map(row=>row.row)])))
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const owner={ownerId:id(1),isCurrent:()=>true},key='fixture-po-matrix-signer'
  const handle=createDesktopMutationHttp({key,db:{async rpc(name,args){
   if(name==='desktop_save_finishing')return {data:(await db.query(
    'select desktop_save_finishing($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7::jsonb) as outcome',
    [args.actor,args.operation,args.target_order,JSON.stringify(args.header),args.enabled,JSON.stringify(args.expected),JSON.stringify(args.packs)])).rows[0].outcome}
   if(name==='desktop_save_order_section')return {data:(await db.query(
    'select desktop_save_order_section($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) as outcome',
    [args.actor,args.operation,args.target_order,args.section,JSON.stringify(args.patch),JSON.stringify(args.expected),JSON.stringify(args.lines)])).rows[0].outcome}
   if(name==='desktop_save_bom')return {data:(await db.query(
    'select desktop_save_bom($1,$2,$3,$4::jsonb,$5::jsonb) as outcome',
    [args.actor,args.operation,args.target_order,JSON.stringify(args.expected),JSON.stringify(args.lines)])).rows[0].outcome}
   assert.equal(name,'desktop_save_po_matrix')
   return {data:(await db.query('select desktop_save_po_matrix($1,$2,$3,$4::jsonb,$5::jsonb) as outcome',
    [args.actor,args.operation,args.target_order,JSON.stringify(args.payload),JSON.stringify(args.expected)])).rows[0].outcome}
  }}})
  const send=operations=>handle({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,id(1))},body:{operations}})
  const payload={p_order_id:id(2),p_total_qty:9,p_total_value_usd:12,p_excess_cutting_pct:5,p_queue_split_rule:'None',
   p_groups:[{id:id(3),group_name:'Kids',unit_price:2,currency:'USD',sizes:['M'],base_size:null,sort_order:0,
    colors:[{id:id(4),color_name:'Blue',sort_order:0,ratio_override:null,ratio_locked:false,quantities:[{size:'M',qty:6}]}]},
    {id:null,group_name:'Adults',unit_price:null,currency:'USD',sizes:['L'],base_size:null,sort_order:1,
     colors:[{id:null,color_name:'Black',sort_order:0,ratio_override:null,ratio_locked:false,quantities:[{size:'L',qty:3}]}]}]}
  await refresh()
  await assert.rejects(queuePoMatrix(directory,{...owner,payload:{...payload,p_groups:[],p_total_qty:0,p_total_value_usd:0}}),/linked to Washing/)
  await queuePoMatrix(directory,{...owner,payload})
  const black=(await listCombinedRecords(directory,'size_group_colors')).find(row=>row.color_name==='Black')
  await queueOrderSection(directory,{...owner,table:'washing',orderId:id(2),enabled:true,
   rows:[{order_id:id(2),color_id:id(4),wash_type:'Fixture Wash'},{order_id:id(2),color_id:black.id,wash_type:'New Colour Wash'}]})
  await queuePoMatrix(directory,{...owner,payload})
  const adults=(await listCombinedRecords(directory,'size_groups')).find(row=>row.group_name==='Adults')
  await queueOrderSection(directory,{...owner,table:'order_queues',orderId:id(2),enabled:true,rule:'None',
   rows:[{order_id:id(2),size_group_id:adults.id,qty:3,split_rule:'None',label:'Adults'}]})


  const entries=()=>listCombinedRecords(directory,'size_group_breakdown')
  assert.deepEqual((await entries()).map(row=>row.qty).sort(),[3,6])
  await refresh()
  assert.deepEqual((await entries()).map(row=>row.qty).sort(),[3,6])
  const result=await submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.equal(response[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return response
  }})
  assert.equal(result.archived,1)
  const washed=await submitPendingMutations(directory,{...owner,async submit(operations){
   assert.equal(operations.length,2)
   assert.deepEqual(operations.map(row=>row.intent.document.childTable),['washing','order_queues'])
   return (await send(operations)).body.results
  }})
  assert.equal(washed.archived,2)

  await refresh()
  assert.equal((await entries()).length,2)
  assert.ok((await entries()).every(row=>!row._local_only))
  const cloud=await pull()
  assert.ok(cloud.washing.some(row=>row.color_id===id(4)))
  assert.ok(cloud.washing.some(row=>row.color_id===black.id))
  assert.equal(cloud.orders[0].total_qty,9)
  assert.equal(cloud.order_queues[0].size_group_id,adults.id)
  const syncBom=async()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.equal(response[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return response
  }})
  const bomRows=[{order_id:id(2),name:'Denim',category:'Fabric',unit:'yards',usage_rule:'Generic',final_qty:9}]
  await queueBom(directory,{...owner,orderId:id(2),rows:bomRows})
  assert.equal((await listCombinedRecords(directory,'bom_items'))[0].name,'Denim')
  assert.equal((await syncBom()).archived,1)
  await refresh()
  assert.equal((await listCombinedRecords(directory,'bom_items'))[0]._local_only,false)
  assert.equal((await pull()).orders[0].step_bom,true)
  await queueBom(directory,{...owner,orderId:id(2),rows:[]})
  assert.equal((await syncBom()).archived,1)
  await refresh()
  assert.equal((await listCombinedRecords(directory,'bom_items')).length,0)
  await db.query("insert into fitting_blocks(id,order_id,block_name) values($1,$2,'Original block')",[id(7),id(2)])
  await refresh()
  await queueOrderSection(directory,{...owner,table:'washing',orderId:id(2),enabled:true,
   rows:[{order_id:id(2),color_id:id(4),wash_type:'Stone Wash'}]})
  await queueOrderSection(directory,{...owner,table:'embellishments',orderId:id(2),enabled:true,
   rows:[{order_id:id(2),description:'QA print'}]})
  await queueOrderSection(directory,{...owner,table:'order_processes',orderId:id(2),enabled:true,notes:'Offline process note',
   rows:[{order_id:id(2),process_name:'Stitching',is_custom:false,sort_order:0}]})
  await queueOrderSection(directory,{...owner,table:'fitting_blocks',orderId:id(2),enabled:true,
   rows:[{id:id(7),order_id:id(2),block_name:'Updated block',dxf_filename:'fixture.dxf'}]})
  const offline=(await listCombinedRecords(directory,'orders'))[0]
  assert.ok(offline.step_washing&&offline.step_embellishment&&offline.step_processes&&offline.step_fitting)
  assert.equal((await listCombinedRecords(directory,'fitting_blocks'))[0].block_name,'Updated block')
  const synced=await submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.deepEqual(response.map(row=>row.outcome),Array(4).fill('applied'))
   assert.deepEqual((await send(operations)).body.results.map(row=>row.outcome),Array(4).fill('already-applied'))
   return response
  }})
  assert.equal(synced.archived,4)
  await refresh()
  const sectionData=await pull()
  assert.equal(sectionData.washing[0].wash_type,'Stone Wash')
  assert.equal(sectionData.embellishments[0].description,'QA print')
  assert.equal(sectionData.orders[0].notes,'Offline process note')
  assert.equal(sectionData.order_processes[0].process_name,'Stitching')
  assert.equal(sectionData.fitting_blocks[0].id,id(7))
  assert.equal(sectionData.fitting_blocks[0].dxf_filename,'fixture.dxf')
  assert.equal((await listCombinedRecords(directory,'orders'))[0]._local_edited,undefined)
  await queueOrderSection(directory,{...owner,table:'finishing_packs',orderId:id(2),enabled:true,
   finishing:{use_cutting_qty:false,total_qty:9},rows:[{order_id:id(2),pack_name:'QA pack',assigned_qty:9}]})
  const pendingPack=(await listCombinedRecords(directory,'finishing_packs'))[0]
  assert.equal(pendingPack.finishing_id,(await listCombinedRecords(directory,'finishing'))[0].id)
  assert.equal((await syncBom()).archived,1)
  await refresh()
  const packed=await pull()
  assert.equal(packed.finishing_packs[0].assigned_qty,9)
  assert.equal(packed.finishing[0].id,pendingPack.finishing_id)
  assert.equal(packed.orders[0].step_finishing,true)
 }finally{
  await db.close()
  fs.rmSync(directory,{recursive:true,force:true})
 }
})
