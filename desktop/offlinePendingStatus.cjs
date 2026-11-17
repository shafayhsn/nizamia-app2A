'use strict'
// Local-only inventory. No network request, no claim that data has been synced.
const fs=require('node:fs'),path=require('node:path')
const init=require('sql.js')
const DB='nizamia-app2a.sqlite'
async function readPendingStatus(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Absolute database directory required')
 const stat=fs.lstatSync(directory),file=path.join(directory,DB)
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid local database directory')
 const info=fs.lstatSync(file)
 if(!info.isFile()||info.isSymbolicLink()||info.size>1024*1024*1024)throw Error('Unsafe local database file')
 const wasm=require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)
 const SQL=await init({locateFile:()=>wasm})
 const db=new SQL.Database(fs.readFileSync(file))
 try{
  if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Local database integrity check failed')
  const tables=new Set((db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(x=>x[0]))
  const count=(name)=>tables.has(name)?db.exec('SELECT COUNT(*) FROM "'+name+'"')[0].values[0][0]:0
  const localRecords=count('standalone_records'),editedSnapshots=count('snapshot_edits')
  const draftStates={pending:0,conflict:0}
  if(tables.has('offline_draft_journal')){
   const result=db.exec("SELECT state,COUNT(*) FROM offline_draft_journal WHERE state IN ('pending','conflict') GROUP BY state")
   for(const [state,total] of result[0]?.values||[])draftStates[state]=total
  }
  const unsyncedDrafts=draftStates.pending+draftStates.conflict
  const grouped=[]
  if(tables.has('standalone_records')){
   const result=db.exec('SELECT table_name,COUNT(*) FROM standalone_records GROUP BY table_name ORDER BY table_name')
   for(const [table,rows] of result[0]?.values||[])grouped.push({table,rows})
  }
  return {localRecords,editedSnapshots,unsyncedDrafts,draftStates,totalUnsyncedLocalChanges:localRecords+editedSnapshots+unsyncedDrafts,byTable:grouped,syncConfigured:false,syncState:'not-connected',message:'Local changes and pending drafts are saved on this device; automatic cloud synchronization is not connected.'}
 }finally{db.close()}
}
module.exports={readPendingStatus}
