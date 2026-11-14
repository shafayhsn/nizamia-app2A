'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const initSqlJs=require('sql.js')
const {stageDraft,snapshotFingerprint,listDrafts,pendingSyncDrafts}=require('./offlineDraftJournal.cjs')
const {createOfflineSyncCoordinator}=require('./offlineSyncCoordinator.cjs')
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-sync-coordinator-'))
 try{
  const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm')})
  const db=new SQL.Database()
  db.run('CREATE TABLE snapshot_manifest (table_name TEXT, row_count INTEGER)')
  db.run('INSERT INTO snapshot_manifest VALUES (?,?)',['orders',1])
  db.run('CREATE TABLE snapshot_rows (table_name TEXT,row_index INTEGER,row_json TEXT)')
  db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',['orders',0,JSON.stringify({id:'o1',notes:'old',remarks:''})])
  const hash=snapshotFingerprint(db),file=path.join(dir,'nizamia-app2a.sqlite')
  fs.writeFileSync(file,Buffer.from(db.export()));db.close()
  const now=Date.now(),session={authenticated:true,identity:'worker1',verifiedIdentity:'worker1',permissions:['offline:draft:orders']}
  const grant={identity:'worker1',issuedAt:now-1000,expiresAt:now+60000,snapshotHash:hash,permissions:['offline:draft:orders']}
  const base={directory:dir,table:'orders',recordId:'o1',session,grant,now,authenticateEvidence:async()=>true}
  const first=await stageDraft({...base,changes:{notes:'updated'}})
  const second=await stageDraft({...base,changes:{remarks:'conflicting'}})
  let submitted=0
  const coordinator=createOfflineSyncCoordinator({
   getDirectory:()=>dir,getSession:async()=>session,getToken:async()=> 'valid-server-session-token',
   authenticateSession:async s=>s.identity==='worker1',
   client:{submit:async({drafts,identity,token})=>{
    submitted=drafts.length;assert.equal(identity,'worker1');assert.equal(token,'valid-server-session-token')
    return {results:drafts.map(d=>({draftId:d.draftId,decision:d.draftId===first.draftId?'applied':'conflict',reason:'cloud-field-changed'}))}
   }}
  })
  const result=await coordinator.synchronize()
  assert.deepEqual(result,{submitted:2,archived:1,conflicts:1,retained:0})
  assert.equal(submitted,2)
  assert.deepEqual(await pendingSyncDrafts({directory:dir,session,authenticateSession:async()=>true}),[])
  const listed=await listDrafts({directory:dir,session,authenticateSession:async()=>true})
  assert.equal(listed.length,1);assert.equal(listed[0].state,'conflict')
  const persisted=new SQL.Database(fs.readFileSync(file))
  assert.equal(persisted.exec('SELECT COUNT(*) FROM offline_sync_history')[0].values[0][0],1)
  assert.equal(persisted.exec('SELECT decision FROM offline_sync_history')[0].values[0][0],'applied')
  assert.equal(JSON.parse(persisted.exec('SELECT row_json FROM snapshot_rows')[0].values[0][0]).notes,'old')
  persisted.close()
  assert.equal((await coordinator.synchronize()).submitted,0)
  const denied=createOfflineSyncCoordinator({getDirectory:()=>dir,getSession:async()=>session,
   getToken:async()=>'',authenticateSession:async()=>false,client:{submit:async()=>{throw Error('unexpected')}}})
  await assert.rejects(()=>denied.synchronize(),/Authenticated/)
  process.stdout.write('Durable offline sync queue integration tests passed.\n')
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1})
