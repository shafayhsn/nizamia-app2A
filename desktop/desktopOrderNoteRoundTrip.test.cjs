'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {PGlite}=require('@electric-sql/pglite')
const initSqlJs=require('sql.js')
const {createDesktopOrderSync}=require('../server/desktopOrderSync.cjs')
const {issueDesktopSyncToken}=require('../server/desktopSyncToken.cjs')
const {stageOrderNote,listDrafts}=require('./offlineDraftJournal.cjs')
const {applyCloudSnapshot}=require('./applyCloudSnapshot.cjs')
const {createOfflineSyncClient}=require('./offlineSyncClient.cjs')
const {createOfflineSyncCoordinator}=require('./offlineSyncCoordinator.cjs')

test('SQLite and PostgreSQL preserve edits across lost responses, retries and concurrent changes',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-order-roundtrip-'))
 const file=path.join(directory,'nizamia-app2a.sqlite')
 const db=new PGlite()
 t.after(async()=>{await db.close();fs.rmSync(directory,{recursive:true,force:true})})
 const id='ce26cc69-47fe-4dfd-bc5b-7b91cba60b6a'
 const actor='e9f91602-3635-41ce-888a-e699bad377e0'
 await db.exec(`create role anon; create role authenticated; create role service_role;
  create table users(id uuid primary key, role text, is_active boolean, is_restricted boolean);
  create table orders(id uuid primary key, notes text);
  grant select,update on users,orders to service_role;
  insert into users values ('${actor}','admin',true,false);
  insert into orders values ('${id}','original');`)
 await db.exec(fs.readFileSync(path.join(__dirname,'../server/migrations/20261114_offline_sync_operations.sql'),'utf8'))
 const query='select public.desktop_apply_order_note($1,$2,$3,$4,$5) as outcome'
 await db.exec('set role anon')
 await assert.rejects(db.query(query,[actor,'a'.repeat(64),id,'original','denied']),/permission denied/)
 await db.exec('set role service_role')

 const SQL=await initSqlJs()
 const local=new SQL.Database()
 local.run('create table app_metadata (key text primary key,value text)')
 fs.writeFileSync(file,Buffer.from(local.export()))
 local.close()
 const cloudRows=async()=>(await db.query('select * from orders')).rows
 const pull=async()=>applyCloudSnapshot({directory,tables:{orders:await cloudRows()}})
 const note=()=>{
  const local=new SQL.Database(fs.readFileSync(file))
  try{return JSON.parse(local.exec("select row_json from snapshot_rows where table_name='orders'")[0].values[0][0]).notes}
  finally{local.close()}
 }
 await pull()
 assert.equal(note(),'original')

 const key='s'.repeat(64)
 const session={authenticated:true,identity:actor}
 const authenticateSession=async candidate=>candidate===session
 const stage=async(notes,expectedNotes)=>stageOrderNote({directory,recordId:id,notes,expectedNotes,session,authenticateSession})
 const handle=createDesktopOrderSync({key,db:{async rpc(name,args){
  assert.equal(name,'desktop_apply_order_note')
  const result=await db.query(query,[args.actor,args.operation,args.order_id,args.previous_note,args.new_note])
  return {data:result.rows[0].outcome}
 }}})
 let loseResponse=true
 const client=createOfflineSyncClient({endpoint:'https://example.test/api/offline-sync',async fetchImpl(_url,options){
  const response=await handle({method:options.method,headers:options.headers,rawBody:options.body})
  if(loseResponse)throw Error('Connection lost after commit')
  return new Response(JSON.stringify(response.body),{status:response.status})
 }})
 const coordinator=createOfflineSyncCoordinator({
  client,getDirectory:()=>directory,getSession:()=>session,getToken:()=>issueDesktopSyncToken(key,actor),
  authenticateSession,orderNotesOnly:true
 })
 await stage('offline note','original')
 await assert.rejects(coordinator.synchronize(),/Connection lost/)
 assert.equal((await cloudRows())[0].notes,'offline note')
 assert.equal((await listDrafts({directory,session,authenticateSession})).length,1)
 loseResponse=false
 assert.equal((await coordinator.synchronize()).archived,1)
 assert.equal(note(),'offline note')
 assert.equal((await db.query('select count(*)::int as count from desktop_private.order_note_operations')).rows[0].count,1)

 await stage('second offline note','offline note')
 await db.query('update orders set notes=$1 where id=$2',['concurrent edit',id])
 await pull()
 assert.equal(note(),'concurrent edit')
 assert.equal((await coordinator.synchronize()).conflicts,1)
 const [draft]=await listDrafts({directory,session,authenticateSession,includeChanges:true})
 assert.equal(draft.state,'conflict')
 assert.equal(draft.changes.notes,'second offline note')
 assert.equal((await cloudRows())[0].notes,'concurrent edit')
})
