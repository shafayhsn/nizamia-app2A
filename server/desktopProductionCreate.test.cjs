'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const initSqlJs=require('../desktop/node_modules/sql.js')
const os=require('node:os')
const {createLocalRecordBatch,mutateLocalRecord,mutateLocalRecordBatch,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('production entry and retry receipt commit together for a valid order variant',async()=>{
 const db=new PGlite()
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
 try{
  await db.exec(`
   create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create function auth.uid() returns uuid language sql as 'select null::uuid';
   create table users(id uuid primary key,role text,is_active boolean,is_restricted boolean);
   create table orders(id uuid primary key,job_number text,buyer_name text,style_number text,po_number text,store_name text,status text,updated_at timestamptz default now());
   create table size_groups(id uuid primary key,order_id uuid,group_name text);
   create table size_group_colors(id uuid primary key,size_group_id uuid,color_name text);
   insert into users values ('${id(1)}','admin',true,false),('${id(2)}','operator',true,false);
   insert into orders values ('${id(3)}','J1','Buyer','Style','PO','Store','Active');
   insert into size_groups values ('${id(4)}','${id(3)}','Sizes');
   insert into size_group_colors values ('${id(5)}','${id(4)}','Indigo');
   create table samples(id uuid primary key,root_sample_id uuid,sample_number text,version_label text,stage text);
   create table sample_comments(sample_id uuid,root_sample_id uuid,sam_number text,version_label text,comment_type text,
    comment_text text check (comment_text not like '% → Ready'),comment_date timestamptz,is_internal boolean);
   insert into samples values ('${id(8)}',null,'SAM-1','V1',null);
   grant insert on sample_comments to service_role;
   grant select,update on all tables in schema public to service_role;
  `)
  const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8')
  await db.exec(read('../migrations/20261020_production_daily_entries.sql'))
  await db.exec('grant insert,select on public.production_daily_entries to service_role')
  await db.exec(read('migrations/20261118_desktop_production_create.sql'))
  await db.exec(read('migrations/20261118_desktop_order_status.sql'))
  await db.exec(read('migrations/20261118_desktop_sample_stage.sql'))
  const payload={order_id:id(3),size_group_id:id(4),color_id:id(5),department:'Cutting',movement:'completed',production_date:'2026-11-18',quantity:15}
  const run=async(actor,operation,data)=>(await db.query('select desktop_create_production_entry($1,$2,$3::jsonb) as result',[actor,operation,JSON.stringify(data)])).rows[0].result
  await db.exec('set role anon')
  await assert.rejects(run(id(1),id(6),payload),/permission denied/)
  await db.exec('set role service_role')
  assert.equal(await run(id(2),id(6),payload),'unauthorized')
  assert.equal(await run(id(1),id(6),{...payload,created_by:id(2)}),'invalid')
  assert.equal(await run(id(1),id(6),{...payload,quantity:0}),'invalid')
  assert.equal(await run(id(1),id(6),{...payload,color_id:id(7)}),'conflict')
  const key='test-desktop-sync-key'
  const submit=createDesktopMutationHttp({key,db:{rpc:async(name,args)=>({data:name==='desktop_create_production_entry'
    ?await run(args.actor,args.operation,args.payload)
    :name==='desktop_update_sample_stage'
    ?(await db.query('select desktop_update_sample_stage($1,$2,$3,$4,$5) as result',
      [args.actor,args.operation,args.target_sample,args.previous_stage,args.new_stage])).rows[0].result
    :(await db.query('select desktop_update_order_status($1,$2,$3,$4,$5) as result',
      [args.actor,args.operation,args.target_order,args.previous_status,args.new_status])).rows[0].result})}})
  const SQLite=await initSqlJs()
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-production-sync-'))
  const offline=new SQLite.Database()
  try{
   offline.run('CREATE TABLE app_metadata (key TEXT PRIMARY KEY,value TEXT)')
   fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(offline.export()))
   const [local]=await createLocalRecordBatch(directory,{
    table:'production_daily_entries',rows:[{...payload,job_number:'stale'}],ownerId:id(1)
   })
   const invoke=operations=>submit({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,id(1))},body:{operations}})
   assert.equal((await submit({method:'POST',headers:{},body:{operations:[]}})).status,401)
   const identity={ownerId:id(1),isCurrent:()=>true}
   let operationId
   await assert.rejects(submitPendingMutations(directory,{...identity,async submit(operations){
    operationId=operations[0].operationId
    assert.equal((await invoke(operations)).body.results[0].outcome,'applied')
    throw Error('response lost')
   }}),/response lost/)
   assert.equal((await listCombinedRecords(directory,'production_daily_entries'))[0].id,local.id)
   const retry=await submitPendingMutations(directory,{...identity,async submit(operations){
    assert.equal(operations[0].operationId,operationId)
    const {body}=await invoke(operations)
    assert.equal(body.results[0].outcome,'already-applied')
    return body.results
   }})
   assert.deepEqual(retry,{archived:1,conflicts:0,retained:0})
   const {rows}=await db.query('select id,quantity,job_number,created_by from public.production_daily_entries')
   assert.deepEqual(rows,[{id:operationId,quantity:15,job_number:'J1',created_by:id(1)}])
   await applyCloudSnapshot({directory,tables:{production_daily_entries:rows}})
   const combined=await listCombinedRecords(directory,'production_daily_entries')
   assert.equal(combined.length,1)
   assert.equal(combined[0].id,operationId)
   assert.equal(combined[0]._local_only,false)
   const cloudOrders=async()=>(await db.query('select id,status,updated_at::text from orders')).rows
   await applyCloudSnapshot({directory,tables:{orders:await cloudOrders()}})
   await mutateLocalRecordBatch(directory,{action:'update',table:'orders',ids:[id(3)],fields:{status:'Booked'},ownerId:id(1)})
   assert.equal((await listCombinedRecords(directory,'orders'))[0].status,'Booked')
   const orderUpload=await submitPendingMutations(directory,{...identity,async submit(operations){
    assert.deepEqual(operations[0].intent.expected,{status:'Active'})
    return (await invoke(operations)).body.results
   }})
   assert.equal(orderUpload.archived,1)
   await applyCloudSnapshot({directory,tables:{orders:await cloudOrders()}})
   assert.equal((await listCombinedRecords(directory,'orders'))[0]._local_edited,undefined)
   await mutateLocalRecordBatch(directory,{action:'update',table:'orders',ids:[id(3)],fields:{status:'Shipped'},ownerId:id(1)})
   await db.query('update orders set status=$1,updated_at=now() where id=$2',['Cancelled',id(3)])
   const conflict=await submitPendingMutations(directory,{...identity,async submit(operations){
    return (await invoke(operations)).body.results
   }})
   assert.equal(conflict.conflicts,1)
   assert.equal((await cloudOrders())[0].status,'Cancelled')
   assert.equal((await listCombinedRecords(directory,'orders'))[0].status,'Shipped')
   const cloudSamples=async()=>(await db.query('select * from samples')).rows
   await applyCloudSnapshot({directory,tables:{samples:await cloudSamples()}})
   const saveStage=stage=>mutateLocalRecord(directory,{
    action:'update',table:'samples',id:id(8),fields:{stage},ownerId:id(1),sampleStage:true
   })
   await saveStage('Pattern')
   const send=async operations=>(await invoke(operations)).body.results
   const sampleUpload=await submitPendingMutations(directory,{...identity,async submit(operations){
    const reply=await send(operations)
    assert.equal(reply[0].outcome,'applied')
    assert.equal((await send(operations))[0].outcome,'already-applied')
    return reply
   }})
   assert.equal(sampleUpload.archived,1)
   assert.deepEqual((await db.query('select comment_text from sample_comments')).rows,[{comment_text:'Not Started → Pattern'}])
   await applyCloudSnapshot({directory,tables:{samples:await cloudSamples()}})
   await saveStage('Ready')
   const failedStage=await submitPendingMutations(directory,{...identity,submit:send})
   assert.equal(failedStage.retained,1)
   assert.equal((await cloudSamples())[0].stage,'Pattern')
   assert.equal((await listCombinedRecords(directory,'samples'))[0].stage,'Ready')


  }finally{
   offline.close()
   fs.rmSync(directory,{recursive:true,force:true})
  }
 }finally{await db.close()}
})
