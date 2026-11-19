'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const init=require('../desktop/node_modules/sql.js')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {queueOperationalChange,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')
const {schema,tables,applyOperation}=require('./operationalQaFixture.cjs')
test('booking and shipment transactions preserve balances and reject concurrent changes',async()=>{
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
 const owner={ownerId:id(1),isCurrent:()=>true},secret='area5-fixture'
 const order=id(2),queue=id(3),db=new PGlite(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'nizamia-area5-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create table users(id uuid primary key,role text,is_active bool,is_restricted bool);
   create table orders(id uuid primary key,total_qty numeric);
   ${schema}
   insert into users values('${owner.ownerId}','admin',true,false);
   insert into orders values('${order}',100);
   insert into order_queues values('${queue}','${order}',100,'Active');
   grant select,insert,update,delete on all tables in schema public to service_role;
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_operational_records.sql'),'utf8'))
  await db.exec('set role service_role')
  const SQLite=await init(),local=new SQLite.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const pull=async()=>Object.fromEntries(await Promise.all(['orders','order_queues',...tables].map(async name=>[
   name,(await db.query('select to_jsonb(t) as row from '+name+' t')).rows.map(({row})=>row)
  ])))
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const read=name=>listCombinedRecords(directory,name)
  const change=input=>queueOperationalChange(directory,{...owner,input})
  const endpoint=createDesktopMutationHttp({key:secret,db:{async rpc(name,args){
   assert.equal(name,'desktop_save_operational_record')
   return applyOperation(db,args)
  }}})
  const send=operations=>endpoint({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(secret,owner.ownerId)},body:{operations}})
  const flush=()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const result=(await send(operations)).body.results
   assert.ok(result.every(r=>r.outcome!=='retry'),JSON.stringify(result))
   assert.deepEqual((await send(operations)).body.results.map(r=>r.outcome),result.map(r=>r.outcome==='applied'?'already-applied':r.outcome))
   return result
  }})
  await refresh()
  const batch=await change({kind:'batch',action:'save',name:'QA batch',orderIds:[order]})
  const bookingHeader={booking_no:'QA booking',booking_date:'2026-11-18',status:'Confirmed'}
  const booking=await change({kind:'booking',action:'save',header:bookingHeader,lines:[{order_id:order,queue_id:queue,qty:75}]})
  const [line]=await read('shipping_booking_lines')
  const shipmentHeader={shipment_no:'QA shipment',shipment_date:'2026-11-18',status:'Open'}
  const shipment=await change({kind:'shipment',action:'save',mode:'booked',header:shipmentHeader,
   lines:[{order_id:order,queue_id:queue,booking_line_id:line.id,shipped_qty:35}]})
  await change({kind:'settlement',action:'save',shipmentId:shipment.id,payment:{received_pkr:1200}})
  assert.equal((await read('production_batch_orders'))[0].batch_id,batch.id)
  assert.equal((await read('shipping_booking_shipments'))[0].qty,35)
  assert.equal((await pull()).shipments.length,0)
  assert.equal((await flush()).archived,2)
  assert.equal((await flush()).archived,1)
  assert.equal((await flush()).archived,1)
  await refresh()
  const cloud=await pull()
  assert.equal(cloud.shipping_booking_lines[0].qty-cloud.shipping_booking_shipments[0].qty,40)
  assert.equal(cloud.order_queues[0].qty-cloud.shipment_lines[0].shipped_qty,65)
  assert.equal((await read('payment_settlements'))[0].payload.received_pkr,1200)
  assert.equal((await read('shipping_bookings'))[0]._local_only,false)
  await assert.rejects(()=>change({kind:'booking',action:'delete',id:booking.id}),/related shipments/)
  await change({kind:'booking',action:'save',id:booking.id,header:{...bookingHeader,notes:'Local edit'},lines:[{order_id:order,queue_id:queue,qty:50}]})
  await db.query("update shipping_bookings set notes='New cloud notes' where id=$1",[booking.id])
  assert.equal((await flush()).conflicts,1)
  await refresh()
  assert.equal((await pull()).shipping_booking_lines[0].qty,75)
  assert.equal((await read('shipping_booking_lines'))[0].qty,50)
  await change({kind:'shipment',action:'delete',id:shipment.id})
  assert.equal((await flush()).archived,1)
  await refresh()
  for(const table of ['shipments','shipment_lines','shipping_booking_shipments','payment_settlements'])
   assert.equal((await read(table)).length,0)
  const past=await change({kind:'shipment',action:'save',mode:'historical',header:{...shipmentHeader,shipment_no:'QA past'},
   lines:[],payment:{received_pkr:800}})
  const queued=await change({kind:'shipment',action:'save',mode:'queued',header:{...shipmentHeader,shipment_no:'QA queue'},
   lines:[{order_id:order,queue_id:queue,shipped_qty:85,close_queue:true,close_reason:'Approved short shipment'}]})
  await change({kind:'batch',action:'save',orderIds:[order],batchId:null})
  assert.equal((await flush()).archived,3)
  await refresh()
  assert.equal((await read('payment_settlements'))[0].shipment_id,past.id)
  assert.equal((await read('production_batch_orders')).length,0)
  await change({kind:'shipment',action:'save',id:queued.id,mode:'queued',header:{...shipmentHeader,shipment_no:'QA queue',notes:'Revised'},
   lines:[{order_id:order,queue_id:queue,shipped_qty:80,close_queue:true,close_reason:'Approved correction'}]})
  await change({kind:'settlement',action:'save',shipmentId:past.id,payment:{received_pkr:850}})
  assert.equal((await flush()).archived,2)
  await refresh()
  assert.equal((await read('shipment_lines'))[0].shipped_qty,80)
  assert.equal((await read('payment_settlements'))[0].payload.received_pkr,850)
  await change({kind:'shipment',action:'save',mode:'manual',header:{...shipmentHeader,shipment_no:'QA manual'},lines:[{order_id:order,shipped_qty:20}]})
  await db.query("insert into shipment_lines values($1,$2,$3,null,10,now())",[id(91),queued.id,order])
  assert.equal((await flush()).conflicts,1)
  assert.equal((await pull()).shipments.length,2)
 }finally{await db.close();fs.rmSync(directory,{force:true,recursive:true})}
})
