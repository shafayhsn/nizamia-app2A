'use strict'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const initSqlJs=require('sql.js')
const {mergeSnapshotRows}=require('./snapshotMerge.cjs')
const DB='nizamia-app2a.sqlite'
let busy=false
async function applyCloudSnapshot({directory,tables}){
 if(busy)throw Error('Refresh already in progress')
 busy=true
 try{
  if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Invalid database directory')
  const file=path.join(directory,DB),stat=fs.lstatSync(file)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024*1024)throw Error('Unsafe local database')
  const original=fs.readFileSync(file),before=crypto.createHash('sha256').update(original).digest('hex')
  const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)})
  const db=new SQL.Database(original)
  let updated
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Local database integrity failure')
   // Standalone records are stored independently of snapshot_rows and are
   // preserved by mergeSnapshotRows. Local overlays are checked record-by-record
   // against their cloud base by the merge helper; changed bases fail closed.
   // Pending drafts depend on a whole-snapshot fingerprint and must not be
   // invalidated by a refresh until per-draft rebasing is implemented.
   const present=new Set((db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(r=>r[0]))
   const pendingDrafts=present.has('offline_draft_journal')
    ?(db.exec("SELECT COUNT(*) FROM offline_draft_journal WHERE state IN ('pending','conflict')")[0]?.values?.[0]?.[0]||0):0
   if(pendingDrafts)throw Error('Cloud refresh blocked: '+pendingDrafts+' pending/conflicted drafts require safe rebasing first. No data replaced.')
   updated=mergeSnapshotRows(db,tables)
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Merged database integrity failure')
   const bytes=Buffer.from(db.export())
   const current=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
   if(before!==current)throw Error('Local database changed during refresh; no data replaced')
   const suffix=crypto.randomUUID(),backup=file+'.before-cloud-'+suffix+'.sqlite',tmp=file+'.cloud-'+suffix+'.tmp'
   fs.writeFileSync(backup,original,{flag:'wx',mode:0o600})
   try{
    fs.writeFileSync(tmp,bytes,{flag:'wx',mode:0o600})
    fs.renameSync(tmp,file)
   }finally{try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
   return {...updated,backup}
  }finally{db.close()}
 }finally{busy=false}
}
module.exports={applyCloudSnapshot}
