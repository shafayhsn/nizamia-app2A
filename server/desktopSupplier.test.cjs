'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const sqlite=require('../desktop/node_modules/sql.js')
const {mutateLocalRecord,submitPendingMutations,listCombinedRecords}=require('../desktop/standaloneRecords.cjs')
const {applyCloudSnapshot}=require('../desktop/applyCloudSnapshot.cjs')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('offline supplier creation, edits and deactivation use the web record fields',async()=>{
 const ownerId='00000000-0000-4000-8000-000000000001'
 const db=new PGlite(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-supplier-'))
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema desktop_private; grant usage on schema desktop_private to service_role;
   create table users(id uuid primary key,role text,is_active bool,is_restricted bool);
   create table suppliers(id uuid primary key,name text not null,contact_person text,email text,phone text,address text,category text,
    lead_time_days int,notes text,process text,tags text[],is_active bool,updated_at timestamptz default now());
   grant select,update on users to service_role;
   grant select,insert,update on suppliers to service_role;
   insert into users values('${ownerId}','admin',true,false);
  `)
  await db.exec(fs.readFileSync(path.join(__dirname,'migrations/20261118_desktop_supplier.sql'),'utf8'))
  await db.exec('set role service_role')
  const SQL=await sqlite(),local=new SQL.Database()
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(local.export()))
  local.close()
  const pull=async()=>({suppliers:(await db.query('select to_jsonb(s) as row from suppliers s')).rows.map(row=>row.row)})
  const refresh=async()=>applyCloudSnapshot({directory,tables:await pull()})
  const owner={ownerId,isCurrent:()=>true},key='fixture-supplier-signer'
  const handle=createDesktopMutationHttp({key,db:{async rpc(name,args){
   assert.equal(name,'desktop_save_supplier')
   return {data:(await db.query('select desktop_save_supplier($1,$2,$3,$4::jsonb,$5::jsonb) as outcome',
    [args.actor,args.operation,args.target_supplier,JSON.stringify(args.patch),args.expected&&JSON.stringify(args.expected)])).rows[0].outcome}
  }}})
  const send=operations=>handle({method:'POST',headers:{authorization:'Bearer '+issueDesktopSyncToken(key,ownerId)},body:{operations}})
  const flush=async()=>submitPendingMutations(directory,{...owner,async submit(operations){
   const response=(await send(operations)).body.results
   assert.equal(response[0].outcome,'applied')
   assert.equal((await send(operations)).body.results[0].outcome,'already-applied')
   return response
  }})
  await refresh()
  const localRow=await mutateLocalRecord(directory,{...owner,table:'suppliers',action:'create',
   fields:{name:'Fixture supplier',category:'Trims',tags:['Zipper'],lead_time_days:'5'}})
  assert.equal((await listCombinedRecords(directory,'suppliers'))[0].lead_time_days,5)
  assert.equal((await flush()).archived,1)
  await refresh()
  const [supplier]=await listCombinedRecords(directory,'suppliers')
  assert.notEqual(supplier.id,localRow.id)
  assert.deepEqual(supplier.tags,['Zipper'])
  await mutateLocalRecord(directory,{...owner,table:'suppliers',id:supplier.id,action:'update',
   fields:{...supplier,tags:['Button'],is_active:false}})
  await db.query("update suppliers set notes='Cloud note' where id=$1",[supplier.id])
  assert.equal((await flush()).archived,1)
  await refresh()
  const [updated]=(await pull()).suppliers
  assert.deepEqual(updated.tags,['Button'])
  assert.equal(updated.is_active,false)
  assert.equal(updated.notes,'Cloud note')
 }finally{
  await db.close()
  fs.rmSync(directory,{recursive:true,force:true})
 }
})
