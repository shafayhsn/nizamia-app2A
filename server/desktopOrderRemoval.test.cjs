'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {queueOrderRemoval,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('order removal verifies the whole graph and restores the selection on conflict',async()=>{
 const ownerId='00000000-0000-4000-8000-000000000001'
 const db=new PGlite(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-order-removal-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema desktop_private; grant usage on schema desktop_private to service_role;
   create table users(id uuid primary key,role text,is_active bool,is_restricted bool);
   create table orders(id uuid primary key,description text);
   create table size_groups(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table order_queues(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table finishing(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table samples(id uuid primary key,order_id uuid references orders(id) on delete cascade,root_sample_id uuid,parent_sample_id uuid);
   create table bom_items(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table fitting(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table fitting_blocks(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table washing(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table embellishments(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table order_processes(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table work_orders(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table purchase_orders(id uuid primary key,order_id uuid references orders(id) on delete cascade);
   create table production_daily_entries(id uuid primary key,order_id uuid);
   create table shipping_booking_lines(id uuid primary key,order_id uuid,queue_id uuid);
   create table shipment_lines(id uuid primary key,order_id uuid,queue_id uuid);
   create table production_batch_orders(id uuid primary key,order_id uuid);
   create table packing_snapshots(id uuid primary key,order_id uuid);
   create table pp_meetings(id uuid primary key,order_id uuid);
   create table testing_requirements(id uuid primary key,order_id uuid);
   create table size_group_colors(id uuid primary key,size_group_id uuid references size_groups(id) on delete cascade);
   create table size_group_breakdown(id uuid primary key,size_group_id uuid references size_groups(id) on delete cascade);
   create table finishing_packs(id uuid primary key,finishing_id uuid references finishing(id) on delete cascade);
   create table finishing_color_packing(id uuid primary key,finishing_id uuid references finishing(id) on delete cascade);
   create table sample_comments(id uuid primary key,sample_id uuid references samples(id) on delete cascade,root_sample_id uuid);
   create table sample_logs(id uuid primary key,sample_id uuid references samples(id) on delete cascade,root_sample_id uuid);
   create table work_order_items(id uuid primary key,wo_id uuid references work_orders(id) on delete cascade);
   create table work_order_changelog(id uuid primary key,wo_id uuid references work_orders(id) on delete cascade);
   create table purchase_order_changelog(id uuid primary key,po_id uuid references purchase_orders(id) on delete cascade);
   create table purchase_order_items(id uuid primary key,po_id uuid references purchase_orders(id) on delete cascade,source_type text,source_id uuid);
   create table parcels(id uuid primary key,items jsonb);
   grant select,insert,update,delete on all tables in schema public to service_role;
   insert into users values('${ownerId}','admin',true,false);
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_order_removal.sql'),'utf8'))
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const {tables}=require('../desktop/orderRemoval.cjs')
  const pull=async()=>Object.fromEntries(await Promise.all(tables.map(async name=>
   [name,(await db.query('select to_jsonb(t) as row from '+name+' t')).rows.map(row=>row.row)])))
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const owner={ownerId,isCurrent:()=>true},key='fixture-order-removal-signer'
  const handle=createDesktopMutationHttp({key,db:{async rpc(name,args){
   assert.equal(name,'desktop_remove_orders')
   return {data:(await db.query('select desktop_remove_orders($1,$2,$3::uuid[],$4::jsonb) as outcome',
    [args.actor,args.operation,args.target_orders,JSON.stringify(args.expected)])).rows[0].outcome}
  }}})
  const send=operations=>handle({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,ownerId)},body:{operations}})
  const flush=async()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.equal(response[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return response
  }})
  const first='00000000-0000-4000-8000-000000000002',second='00000000-0000-4000-8000-000000000003'
  await db.query("insert into orders values($1,'First'),($2,'Second')",[first,second])
  await db.query("insert into size_groups values(gen_random_uuid(),$1)",[first])
  await db.query("insert into bom_items values(gen_random_uuid(),$1)",[first])
  await refresh()
  await queueOrderRemoval(directory,{...owner,orderIds:[first,second]})
  assert.equal((await listCombinedRecords(directory,'orders')).length,0)
  assert.equal((await flush()).archived,1)
  await refresh()
  assert.equal((await pull()).orders.length,0)
  assert.equal((await pull()).size_groups.length,0)
  await db.query("insert into orders values($1,'First'),($2,'Second')",[first,second])
  await refresh()
  await queueOrderRemoval(directory,{...owner,orderIds:[first,second]})
  await db.query("insert into production_daily_entries values(gen_random_uuid(),$1)",[second])
  const conflict=await submitPendingMutations(directory,{...owner,async submit(operations){
   return (await send(operations)).body.results
  }})
  assert.equal(conflict.conflicts,1)
  await refresh()
  assert.equal((await listCombinedRecords(directory,'orders')).length,2)
  assert.equal((await pull()).orders.length,2)
 }finally{
  await db.close()
  fs.rmSync(directory,{recursive:true,force:true})
 }
})
