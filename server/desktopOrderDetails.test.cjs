'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {queueOrderImport,queueOrderGeneral,queueNewJob,mutateLocalRecordBatch,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('bulk order edits and job assignments sync with conflict protection',async()=>{
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
 const db=new PGlite(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-order-details-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema desktop_private; grant usage on schema desktop_private to service_role;
   create table users(id uuid primary key,role text,is_active bool,is_restricted bool);
   create table orders(id uuid primary key,ship_date date,po_date date,merchandiser_name text,
    store_name text,status text,updated_at timestamptz default now(),buyer_id uuid,job_id uuid,job_number text);
   create table buyers(id uuid primary key);
   insert into buyers values('${id(4)}');
   grant select,update on buyers to service_role;
   alter table orders add column buyer_name text;
   alter table orders add column agent_name text;
   alter table orders add column factory_ref text;
   alter table orders add column product_id text;
   alter table orders add column style_number text;
   alter table orders add column brand_name text;
   alter table orders add column description text;
   alter table orders add column po_number text;
   alter table orders add column ship_mode text;
   alter table orders add column incoterms text;
   alter table orders add column currency text;
   alter table orders add column port_of_loading text;
   alter table orders add column port_of_discharge text;
   alter table orders add column style_image_base64 text;
   alter table orders add column planned_date date;
   alter table orders add column in_store_date date;
   alter table orders add column notes text;
   alter table orders add column step_po_matrix boolean;
   alter table orders add column step_bom boolean;
   create table size_groups(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),group_name text,
    unit_price numeric,currency text,sizes text[],base_size text,sort_order integer);
   create table size_group_colors(id uuid primary key default gen_random_uuid(),size_group_id uuid references size_groups(id),
    color_name text,sort_order integer,ratio_override jsonb,ratio_locked bool);
   create table size_group_breakdown(id uuid primary key default gen_random_uuid(),size_group_id uuid references size_groups(id),
    color_id uuid references size_group_colors(id),size text,qty int);
   create table bom_items(id uuid primary key,order_id uuid references orders(id),library_item_id uuid,name text not null,
    category text,detail text,specification text,unit text,supplier_id uuid,usage_rule text,usage_data jsonb,final_qty numeric,
    base_qty numeric,wastage numeric,custom_usage jsonb,notes text,sort_order int,use_cutting_qty bool);
   grant select,insert,update on size_groups,size_group_colors,size_group_breakdown,bom_items to service_role;
   create table jobs(id uuid primary key,buyer_id uuid,job_number text unique);
   create table document_numbering(doc_type text primary key,label text,prefix text,pattern text,format text,seq_pad int,next_number int,current_number int,enabled bool,updated_at timestamptz);
   grant insert on jobs,document_numbering to service_role;
   grant select,update on document_numbering to service_role;
   grant insert on orders to service_role;
   grant select,update on users,orders,jobs to service_role;
   insert into users values('${id(1)}','admin',true,false);
   insert into orders(id,ship_date,store_name,status) values
    ('${id(2)}','2026-12-01','Original','Draft'),('${id(3)}','2026-12-01','Original','Draft'),('${id(8)}',null,null,'Draft');
   update orders set buyer_id='${id(4)}';
   insert into jobs values ('${id(5)}','${id(4)}','NZ-101'),('${id(6)}','${id(7)}','NZ-102');
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_order_details.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_order_job.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_job_create.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_order_general.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_order_create.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_order_duplicate.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_z_order_confirmation.sql'),'utf8'))
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_order_import.sql'),'utf8'))
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const pull=async()=>Object.fromEntries(await Promise.all(['buyers','orders','jobs','size_groups','size_group_colors','size_group_breakdown','bom_items'].map(async table=>
   [table,(await db.query('select to_jsonb(t) as row from '+table+' t')).rows.map(row=>row.row)])))
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const owner={ownerId:id(1),isCurrent:()=>true},key='fixture-order-details-signer'
  const handle=createDesktopMutationHttp({key,db:{async rpc(name,args){
   if(name==='desktop_create_and_assign_job')return {data:(await db.query(
    'select desktop_create_and_assign_job($1,$2,$3,$4::jsonb) as outcome',
    [args.actor,args.operation,args.target_buyer,JSON.stringify(args.expected_orders)])).rows[0].outcome}
   if(name==='desktop_import_orders')return {data:(await db.query(
    'select desktop_import_orders($1,$2,$3::jsonb) as outcome',
    [args.actor,args.operation,JSON.stringify(args.rows)])).rows[0].outcome}
   if(name==='desktop_duplicate_order')return {data:(await db.query(
    'select desktop_duplicate_order($1,$2,$3,$4::jsonb,$5::jsonb) as outcome',
    [args.actor,args.operation,args.target_order,JSON.stringify(args.header),JSON.stringify(args.copied)])).rows[0].outcome}
   if(name==='desktop_create_order')return {data:(await db.query(
    'select desktop_create_order($1,$2,$3,$4::jsonb) as outcome',
    [args.actor,args.operation,args.target_order,JSON.stringify(args.header)])).rows[0].outcome}
   assert.ok(['desktop_update_order_details','desktop_update_order_job','desktop_update_order_general'].includes(name))
   return {data:(await db.query('select '+name+'($1,$2,$3,$4::jsonb,$5::jsonb) as outcome',
    [args.actor,args.operation,args.target_order,JSON.stringify(args.previous_fields),JSON.stringify(args.new_fields)])).rows[0].outcome}
  }}})
  const send=operations=>handle({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,id(1))},body:{operations}})
  await refresh()
  await mutateLocalRecordBatch(directory,{...owner,action:'update',table:'orders',ids:[id(2),id(3)],
   fields:{ship_date:'2026-12-15',store_name:'New store',status:'Active'}})
  await db.query("update orders set store_name='Cloud store' where id=$1",[id(3)])
  await db.query("update orders set merchandiser_name='Cloud merchandiser' where id=$1",[id(2)])
  await refresh()
  const result=await submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.deepEqual(response.map(row=>row.outcome),['applied','conflict'])
   assert.equal((await send([operations[0]])).body.results[0].outcome,'already-applied')
   return response
  }})
  assert.equal(result.archived,1)
  assert.equal(result.conflicts,1)
  const cloud=(await pull()).orders
  assert.equal(cloud.find(row=>row.id===id(2)).merchandiser_name,'Cloud merchandiser')
  assert.equal(cloud.find(row=>row.id===id(2)).ship_date,'2026-12-15')
  assert.equal(cloud.find(row=>row.id===id(3)).status,'Draft')
  await refresh()
  const cached=await listCombinedRecords(directory,'orders')
  assert.equal(cached.find(row=>row.id===id(2)).merchandiser_name,'Cloud merchandiser')
  assert.equal(cached.find(row=>row.id===id(3)).store_name,'New store')
  const link=fields=>mutateLocalRecordBatch(directory,{...owner,action:'update',table:'orders',ids:[id(2)],fields})
  await assert.rejects(link({job_id:id(6),job_number:'NZ-102'}),/same buyer/)
  await link({job_id:id(5),job_number:'NZ-101'})
  assert.equal((await listCombinedRecords(directory,'orders')).find(row=>row.id===id(2)).job_number,'NZ-101')
  const flush=()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.equal(response[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return response
  }})
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.equal((await pull()).orders.find(row=>row.id===id(2)).job_id,id(5))
  await link({job_id:null,job_number:null})
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.equal((await pull()).orders.find(row=>row.id===id(2)).job_number,null)
  const queued=await queueNewJob(directory,{...owner,orderIds:[id(2),id(8)]})
  assert.match(queued.job_number,/^OFFLINE-/)
  const offlineOrders=await listCombinedRecords(directory,'orders')
  assert.equal(offlineOrders.filter(order=>order.job_id===queued.id).length,2)
  await assert.rejects(link({job_id:id(5),job_number:'NZ-101'}),/new job awaiting/)
  await refresh()
  assert.equal((await flush()).archived,1)
  await refresh()
  const synced=(await pull()).jobs.find(job=>job.job_number==='NZ-2601')
  assert.ok(synced)
  assert.ok(!(await listCombinedRecords(directory,'jobs')).some(job=>job.id===queued.id))
  assert.equal((await listCombinedRecords(directory,'orders')).filter(order=>order.job_id===synced.id).length,2)

  const conflictDraft=await queueNewJob(directory,{...owner,orderIds:[id(2),id(8)]})
  await db.query("update orders set job_number='NZ-101',job_id=$1 where id=$2",[id(5),id(8)])
  const rejected=await submitPendingMutations(directory,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(rejected.conflicts,1)
  const current=await pull()
  assert.equal(current.jobs.length,3)
  assert.equal(current.orders.find(order=>order.id===id(2)).job_id,synced.id)
  await refresh()
  assert.ok((await listCombinedRecords(directory,'jobs')).some(job=>job.id===conflictDraft.id))
  await db.query("insert into orders(id,style_number,description) values($1,'STYLE-QA','Before edit')",[id(9)])
  await refresh()
  const editInfo={...owner,orderId:id(9),fields:{description:'Updated locally',po_number:'PO-001',planned_date:'2026-12-20'}}
  await queueOrderGeneral(directory,editInfo)
  assert.equal((await queueOrderGeneral(directory,editInfo)).description,'Updated locally')
  assert.equal((await flush()).archived,1)
  await refresh()
  const edited=(await listCombinedRecords(directory,'orders')).find(row=>row.id===id(9))
  assert.equal(edited.po_number,'PO-001')
  assert.equal(edited.planned_date,'2026-12-20')
  assert.equal(edited._local_edited,undefined)
  const draftFields={buyer_id:id(4),style_number:'OFFLINE-STYLE',po_number:'PO-OFFLINE',status:'Draft'}
  const created=await queueOrderGeneral(directory,{...owner,fields:draftFields})
  assert.equal((await queueOrderGeneral(directory,{...owner,orderId:created.id,fields:draftFields})).id,created.id)
  assert.equal((await listCombinedRecords(directory,'orders')).find(row=>row.id===created.id)._local_only,true)
  assert.equal((await flush()).archived,1)
  await refresh()
  const syncedOrders=(await listCombinedRecords(directory,'orders')).filter(row=>row.id===created.id)
  assert.equal(syncedOrders.length,1)
  assert.equal(syncedOrders[0]._local_only,false)
  assert.equal(syncedOrders[0].po_number,'PO-OFFLINE')
  await db.query("insert into size_groups(id,order_id,group_name,sizes) values($1,$2,'Adults',array['M'])",[id(10),created.id])
  await db.query("insert into size_group_colors(id,size_group_id,color_name) values($1,$2,'Blue')",[id(11),id(10)])
  await db.query("insert into size_group_breakdown(id,size_group_id,color_id,size,qty) values($1,$2,$3,'M',4)",[id(12),id(10),id(11)])
  await db.query("insert into bom_items(id,order_id,name) values($1,$2,'Denim')",[id(13),created.id])
  await refresh()
  const duplicated=await queueOrderGeneral(directory,{...owner,cloneOrderId:created.id,fields:{buyer_id:id(4),style_number:'OFFLINE-STYLE (Copy)'}})
  const groups=await listCombinedRecords(directory,'size_groups')
  const provisional=groups.find(row=>row.order_id===duplicated.id)
  assert.ok(provisional._local_only)
  assert.equal((await flush()).archived,1)
  await refresh()
  const completed=(await pull())
  assert.equal(completed.size_group_colors.filter(row=>row.size_group_id===provisional.id).length,1)
  assert.equal(completed.size_group_breakdown.filter(row=>row.size_group_id===provisional.id).length,0)
  assert.equal(completed.bom_items.find(row=>row.order_id===duplicated.id).name,'Denim')
  assert.equal((await listCombinedRecords(directory,'size_groups')).filter(row=>row.id===provisional.id).length,1)
  const confirmation={...owner,orderId:created.id,fields:{status:'Confirmed'}}
  await assert.rejects(queueOrderGeneral(directory,confirmation),/before confirming/)
  await db.query("update orders set buyer_name='Fixture',step_po_matrix=true,step_bom=true where id=$1",[created.id])
  await refresh()
  await queueOrderGeneral(directory,confirmation)
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.equal((await pull()).orders.find(row=>row.id===created.id).status,'Confirmed')
  const csv=[{buyer_id:id(4),buyer_name:'Fixture',style_number:'CSV-1',in_store_date:'2027-01-02',notes:'CSV note'},
   {buyer_id:null,buyer_name:'Unmatched fixture',style_number:'CSV-2'}]
  assert.equal(await queueOrderImport(directory,{...owner,rows:csv}),2)
  assert.equal((await listCombinedRecords(directory,'orders')).filter(row=>row.style_number?.startsWith('CSV-')).length,2)
  assert.equal((await flush()).archived,1)
  await refresh()
  const imported=(await listCombinedRecords(directory,'orders')).filter(row=>row.style_number?.startsWith('CSV-'))
  assert.equal(imported.length,2)
  assert.ok(imported.every(row=>!row._local_only))
  assert.equal(imported.find(row=>row.style_number==='CSV-1').in_store_date,'2027-01-02')
  await queueOrderImport(directory,{...owner,rows:[
   {...csv[0],style_number:'CSV-ROLLBACK'}, {...csv[1],in_store_date:'invalid-date'},
  ]})
  const rejectedImport=await submitPendingMutations(directory,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(rejectedImport.conflicts,1)
  assert.ok(!(await pull()).orders.some(row=>row.style_number==='CSV-ROLLBACK'))
 }finally{
  await db.close()
  fs.rmSync(directory,{recursive:true,force:true})
 }
})
