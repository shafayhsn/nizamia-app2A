'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const initSqlJs=require('../desktop/node_modules/sql.js')
const os=require('node:os')
const {createLocalRecordBatch,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
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
   create table orders(id uuid primary key,job_number text,buyer_name text,style_number text,po_number text,store_name text,status text);
   create table size_groups(id uuid primary key,order_id uuid,group_name text);
   create table size_group_colors(id uuid primary key,size_group_id uuid,color_name text);
   insert into users values ('${id(1)}','admin',true,false),('${id(2)}','operator',true,false);
   insert into orders values ('${id(3)}','J1','Buyer','Style','PO','Store','Active');
   insert into size_groups values ('${id(4)}','${id(3)}','Sizes');
   insert into size_group_colors values ('${id(5)}','${id(4)}','Indigo');
   grant select,update on all tables in schema public to service_role;
  `)
  const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8')
  await db.exec(read('../migrations/20261020_production_daily_entries.sql'))
  await db.exec('grant insert,select on public.production_daily_entries to service_role')
  await db.exec(read('migrations/20261118_desktop_production_create.sql'))
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
  const submit=createDesktopMutationHttp({key,db:{rpc:async(_name,args)=>({data:await run(args.actor,args.operation,args.payload)})}})
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
  }finally{
   offline.close()
   fs.rmSync(directory,{recursive:true,force:true})
  }
 }finally{await db.close()}
})
