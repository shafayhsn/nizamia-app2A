'use strict'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const initSqlJs=require('sql.js')
const {mergeSnapshotRows}=require('./snapshotMerge.cjs')
const {isDesktopOrderNote}=require('./offlineSyncPlanner.cjs')
const DB='nizamia-app2a.sqlite'
let busy=false,sqlite
function getSqlEngine(){
 const wasm=require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)
 return sqlite||=(initSqlJs({locateFile:()=>wasm}))
}
async function hasAdminCloudSnapshot(directory){
 const SQL=await getSqlEngine()
 const db=new SQL.Database(fs.readFileSync(path.join(directory,DB)))
 try{
  const tables=new Set((db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).flat())
  if(tables.has('app_metadata')&&db.exec("SELECT value FROM app_metadata WHERE key='cloud_snapshot_scope'")[0]?.values?.[0]?.[0]==='admin')return true
  // Old shared folders can predate the administrator snapshot marker.
  for(const table of ['snapshot_rows','standalone_records']){
   if(!tables.has(table))continue
   if(!db.exec('PRAGMA table_info('+table+')')[0]?.values.some(column=>column[1]==='table_name'))continue
   if(db.exec("SELECT 1 FROM "+table+" WHERE table_name IN ('purchase_orders','purchase_order_items','payment_settlements') LIMIT 1").length)return true
  }
  return false
 }finally{db.close()}
}
function storedCheckpoint(db){
 if(!db.exec("SELECT 1 FROM sqlite_master WHERE name='app_metadata'").length)return null
 const value=db.exec("SELECT value FROM app_metadata WHERE key='sync_checkpoint'")[0]?.values[0][0]
 return value?JSON.parse(value):null
}
async function readCheckpoint(directory){
 const SQL=await getSqlEngine(),db=new SQL.Database(fs.readFileSync(path.join(directory,DB)))
 try{return storedCheckpoint(db)}finally{db.close()}
}
async function applyCloudSnapshot({directory,tables,adminScope=false,delta,checkpoint}){
 if(busy)throw Error('Refresh already in progress')
 busy=true
 try{
  if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Invalid database directory')
  const file=path.join(directory,DB),stat=fs.lstatSync(file)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024*1024)throw Error('Unsafe local database')
  const original=fs.readFileSync(file),before=crypto.createHash('sha256').update(original).digest('hex')
  const SQL=await getSqlEngine()
  const db=new SQL.Database(original)
  let updated
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Local database integrity failure')
   // Standalone records are stored independently of snapshot_rows and are
   // preserved by mergeSnapshotRows. Local overlays are checked record-by-record
   // against their cloud base by the merge helper. Unresolved records retain their base.
   // Supported order-note drafts retain their exact expected value and stable
   // operation ID. Only the server can acknowledge or reject their upload.
   const journal=db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='offline_draft_journal'").length
   if(journal){
    const states="WHERE state IN ('pending','conflict')"
    const pending=db.exec('SELECT COUNT(*) FROM offline_draft_journal '+states)[0]?.values?.[0]?.[0]||0
    if(pending){
     const columns=db.exec('PRAGMA table_info(offline_draft_journal)')[0]?.values||[]
     const rows=columns.some(column=>column[1]==='draft_json')
      ?db.exec('SELECT draft_json FROM offline_draft_journal '+states)[0]?.values||[]:[]
     const supported=rows.length===pending&&rows.every(([json])=>{
      try{return isDesktopOrderNote(JSON.parse(json))}catch{return false}
     })
     if(!supported)throw Error('Cloud refresh blocked: pending/conflicted drafts require review. No data replaced.')
    }
   }
   if(delta){
    const prior=storedCheckpoint(db)
    if(!prior||prior.scope!==checkpoint.scope||prior.revision!==delta.after)throw Error('Local checkpoint changed')
    tables={}
    // Reconciliation can span parent and child tables. Build its input from local bytes.
    for(const [name] of db.exec('SELECT table_name FROM snapshot_manifest')[0]?.values||[]){
     tables[name]=(db.exec('SELECT row_json FROM snapshot_rows WHERE table_name=? ORDER BY row_index',[name])[0]?.values||[]).map(([v])=>JSON.parse(v))
    }
    for(const [table,part] of Object.entries(delta.changes)){
     if(!db.exec('SELECT 1 FROM snapshot_manifest WHERE table_name=?',[table]).length)throw Error('Missing baseline for '+table)
     const byId=new Map(tables[table].map(row=>[String(row[part.key]),row]))
     for(const id of part.removed)byId.delete(id)
     for(const row of part.records)byId.set(String(row[part.key]),row)
     tables[table]=[...byId.values()]
    }
   }
   updated=Object.keys(tables).length?mergeSnapshotRows(db,tables):{unresolved:[],updatedTables:0}
   db.run('CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)')
   if(checkpoint && !updated.unresolved?.length)db.run("INSERT OR REPLACE INTO app_metadata VALUES ('sync_checkpoint',?)",[JSON.stringify(checkpoint)])
   else db.run("DELETE FROM app_metadata WHERE key='sync_checkpoint'")
   if(adminScope){
    db.run('CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)')
    db.run("INSERT OR REPLACE INTO app_metadata VALUES ('cloud_snapshot_scope','admin')")
   }
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
module.exports={applyCloudSnapshot,hasAdminCloudSnapshot,readCheckpoint}
