'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const initSqlJs=require('sql.js')
const {stageDraft,commitSyncResults,rebaseConflict,listDrafts,snapshotFingerprint}=require('./offlineDraftJournal.cjs')
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-rebase-'))
 try{
  const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm')})
  const db=new SQL.Database()
  db.run('CREATE TABLE snapshot_manifest (table_name TEXT,row_count INTEGER)')
  db.run("INSERT INTO snapshot_manifest VALUES ('orders',1)")
  db.run('CREATE TABLE snapshot_rows (table_name TEXT,row_index INTEGER,row_json TEXT)')
  db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',['orders',0,JSON.stringify({id:'o1',notes:'original'})])
  const hash=snapshotFingerprint(db),file=path.join(directory,'nizamia-app2a.sqlite')
  fs.writeFileSync(file,Buffer.from(db.export()));db.close()
  const now=Date.now(),session={authenticated:true,identity:'operator1',verifiedIdentity:'operator1',permissions:['offline:draft:orders']}
  const grant={identity:'operator1',snapshotHash:hash,permissions:session.permissions,issuedAt:now-1000,expiresAt:now+60000}
  const auth=async()=>true
  const d=await stageDraft({directory,table:'orders',recordId:'o1',changes:{notes:'new'},session,grant,authenticateEvidence:auth,now})
  await commitSyncResults({directory,session,authenticateSession:auth,results:[{draftId:d.draftId,decision:'conflict'}]})
  await assert.rejects(()=>rebaseConflict({directory,draftId:d.draftId,session,grant,authenticateSession:auth,authenticateEvidence:auth,now}),/fresh cloud snapshot/)
  const other={...session,identity:'operator2',verifiedIdentity:'operator2'}
  await assert.rejects(()=>rebaseConflict({directory,draftId:d.draftId,session:other,grant,authenticateSession:auth,authenticateEvidence:auth,now}),/Owned conflict/)
  // Simulate a verified replacement of the snapshot tables, keeping the
  // local conflict journal; the snapshot hash must change before rebasing.
  const next=new SQL.Database(fs.readFileSync(file))
  next.run("UPDATE snapshot_rows SET row_json=? WHERE table_name='orders'",[JSON.stringify({id:'o1',notes:'cloud-new'})])
  const refreshed=snapshotFingerprint(next)
  fs.writeFileSync(file,Buffer.from(next.export()));next.close()
  const freshGrant={...grant,snapshotHash:refreshed}
  const retry=await rebaseConflict({directory,draftId:d.draftId,session,grant:freshGrant,authenticateSession:auth,authenticateEvidence:auth,now})
  assert.equal(retry.state,'pending')
  const drafts=await listDrafts({directory,session,authenticateSession:auth})
  assert.equal(drafts.length,1);assert.equal(drafts[0].draftId,retry.draftId)
  assert.notEqual(retry.draftId,d.draftId)
  process.stdout.write('Conflict rebase with refreshed snapshot and owner checks passed.\\n')
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1})
