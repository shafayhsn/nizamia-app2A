'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {queueNewJob,mutateLocalRecordBatch,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
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
   create table jobs(id uuid primary key,buyer_id uuid,job_number text unique);
   create table document_numbering(doc_type text primary key,label text,prefix text,pattern text,format text,seq_pad int,next_number int,current_number int,enabled bool,updated_at timestamptz);
   grant insert on jobs,document_numbering to service_role;
   grant select,update on document_numbering to service_role;
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
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const pull=async()=>({orders:(await db.query('select to_jsonb(o) as row from orders o')).rows.map(row=>row.row),jobs:(await db.query('select to_jsonb(j) as row from jobs j')).rows.map(row=>row.row)})
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const owner={ownerId:id(1),isCurrent:()=>true},key='fixture-order-details-signer'
  const handle=createDesktopMutationHttp({key,db:{async rpc(name,args){
   if(name==='desktop_create_and_assign_job')return {data:(await db.query(
    'select desktop_create_and_assign_job($1,$2,$3,$4::jsonb) as outcome',
    [args.actor,args.operation,args.target_buyer,JSON.stringify(args.expected_orders)])).rows[0].outcome}
   assert.ok(['desktop_update_order_details','desktop_update_order_job'].includes(name))
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
 }finally{
  await db.close()
  fs.rmSync(directory,{recursive:true,force:true})
 }
})
