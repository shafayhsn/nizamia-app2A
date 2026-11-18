'use strict'
const fs=require('node:fs')
const path=require('node:path')
const crypto=require('node:crypto')
const initSqlJs=require('sql.js')
const filename='nizamia-app2a.sqlite'
const maxBytes=1024*1024*1024
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
let sqlEngine

function readDatabase(file){
 const stat=fs.lstatSync(file)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<100||stat.size>maxBytes)
  throw Error('SQLite database is missing or invalid')
 const bytes=fs.readFileSync(file)
 if(bytes.subarray(0,16).toString('binary')!=='SQLite format 3\0')
  throw Error('Local database has an invalid SQLite header')
 return bytes
}

async function verifyDatabase(bytes,{compatible=false,rejectPending=false}={}){
 if(!sqlEngine){
  const wasm=require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)
  sqlEngine=initSqlJs({locateFile:()=>wasm})
 }
 const SQL=await sqlEngine
 const db=new SQL.Database(Buffer.from(bytes))
 try{
  if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')
   throw Error('SQLite integrity check failed')
  const tables=new Set((db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(([name])=>name))
  if(compatible){
   if(!['app_metadata','snapshot_manifest','snapshot_rows'].every(name=>tables.has(name)))
    throw Error('This file is not an App-2A SQLite backup')
   if(db.exec("SELECT value FROM app_metadata WHERE key='schema_version'")[0]?.values?.[0]?.[0]!=='1')
    throw Error('Unsupported backup schema version')
  }
  if(rejectPending&&['standalone_records','snapshot_edits','offline_draft_journal'].some(name=>
   tables.has(name)&&db.exec('SELECT 1 FROM '+name+' LIMIT 1').length))
   throw Error('The active database contains local work. Restore the backup into a separate folder.')
 }finally{db.close()}
}

function writeVerifiedCopy(target,bytes){
 const sha256=digest(bytes)
 const descriptor=fs.openSync(target,'wx',0o600)
 try{
  fs.writeFileSync(descriptor,bytes)
  fs.fsyncSync(descriptor)
  if(digest(fs.readFileSync(target))!==sha256)throw Error('Database copy checksum verification failed')
  return {file:target,sha256,size:bytes.length}
 }catch(error){
  try{fs.unlinkSync(target)}catch{}
  throw error
 }finally{fs.closeSync(descriptor)}
}

async function backupDatabaseToFile({directory,destination}){
 if(!directory||!destination||!path.isAbsolute(destination))throw Error('Absolute database and destination paths are required')
 const live=fs.realpathSync(directory)
 const target=path.resolve(destination)
 const parent=fs.realpathSync(path.dirname(target))
 if(parent===live||parent.startsWith(live+path.sep))throw Error('Choose a backup location outside the live database folder')
 if(fs.existsSync(target))throw Error('Backup destination already exists. Choose a new filename.')
 const bytes=readDatabase(path.join(live,filename))
 await verifyDatabase(bytes)
 return writeVerifiedCopy(target,bytes)
}

async function restoreDatabaseFromFile({directory,source,separate=false}){
 const target=path.join(fs.realpathSync(directory),filename)
 if(fs.realpathSync(source)===target)throw Error('Cannot restore the currently active database')
 const bytes=readDatabase(source)
 await verifyDatabase(bytes,{compatible:true})
 if(separate)return writeVerifiedCopy(target,bytes)

 const before=readDatabase(target)
 await verifyDatabase(before,{rejectPending:true})
 const suffix=crypto.randomUUID()
 const safety=target+'.before-restore-'+suffix+'.sqlite'
 const temp=target+'.restore-'+suffix+'.tmp'
 if(digest(readDatabase(target))!==digest(before))throw Error('The active database changed during verification')
 writeVerifiedCopy(safety,before)
 writeVerifiedCopy(temp,bytes)
 try{fs.renameSync(temp,target)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
 return {file:target,safetyBackup:path.basename(safety),sha256:digest(bytes)}
}
module.exports={backupDatabaseToFile,restoreDatabaseFromFile}
