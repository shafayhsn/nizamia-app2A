'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const initSqlJs=require('sql.js')
const {stageDraft,listDrafts,cancelDraft,commitSyncResults,listSyncHistory,snapshotFingerprint}=require('./offlineDraftJournal.cjs')
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-history-'))
 try{
  const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm')})
  const db=new SQL.Database()
  db.run('CREATE TABLE snapshot_manifest (table_name TEXT, row_count INTEGER)')
  db.run("INSERT INTO snapshot_manifest VALUES ('orders',1)")
  db.run('CREATE TABLE snapshot_rows (table_name TEXT,row_index INTEGER,row_json TEXT)')
  db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',['orders',0,JSON.stringify({id:'o1',notes:'old',remarks:'old'})])
  const hash=snapshotFingerprint(db)
  fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(db.export()));db.close()
  const now=Date.now(),session={authenticated:true,identity:'worker1',verifiedIdentity:'worker1',permissions:['offline:draft:orders']}
  const grant={identity:'worker1',permissions:['offline:draft:orders'],snapshotHash:hash,issuedAt:now-1000,expiresAt:now+60000}
  const auth=async()=>true
  const args={directory,table:'orders',recordId:'o1',session,grant,authenticateEvidence:async()=>true,now}
  const a=await stageDraft({...args,changes:{notes:'updated'}})
  const b=await stageDraft({...args,changes:{remarks:'updated'}})
  await commitSyncResults({directory,session,authenticateSession:auth,results:[
   {draftId:a.draftId,decision:'applied'},{draftId:b.draftId,decision:'conflict'}
  ]})
  const history=await listSyncHistory({directory,session,authenticateSession:auth})
  assert.equal(history.length,1);assert.equal(history[0].draftId,a.draftId)
  assert.equal((await listDrafts({directory,session,authenticateSession:auth}))[0].state,'conflict')
  assert.equal((await cancelDraft({directory,draftId:b.draftId,session,authenticateSession:auth})).cancelled,true)
  assert.equal((await listDrafts({directory,session,authenticateSession:auth})).length,0)
  assert.equal((await listSyncHistory({directory,session:{identity:'other'},authenticateSession:auth})).length,0)
  await assert.rejects(()=>listSyncHistory({directory,session,authenticateSession:async()=>false}),/Authenticated/)
  process.stdout.write('Offline sync history and conflict dismissal integration passed.\\n')
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1})
