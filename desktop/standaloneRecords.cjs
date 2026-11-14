'use strict'
// Standalone local-only business records. Never mutates imported cloud snapshot
// rows and never implies these records have been synchronized.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const initSqlJs=require('sql.js')
const TABLES=new Set(['orders','tasks','buyers','suppliers','purchase_orders','samples','parcels','shipments','production_daily_entries'])
const DB_NAME='nizamia-app2a.sqlite'
const queues=new Map()
function validateTable(table){if(!TABLES.has(table))throw Error('Unsupported standalone record table')}
function validateFields(fields){
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Invalid record fields')
 const keys=Object.keys(fields)
 if(!keys.length||keys.length>50)throw Error('Record requires 1–50 fields')
 for(const key of keys){
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(key)||['id','_local_only','_local_updated_at'].includes(key)||
     /password|secret|token|credential|api_key|private_key/i.test(key))throw Error('Unsupported record field')
  const value=fields[key]
  if(value!==null&&typeof value!=='string'&&typeof value!=='number'&&typeof value!=='boolean')throw Error('Scalar record fields required')
  if(typeof value==='string'&&value.length>4000)throw Error('Record field too long')
  if(typeof value==='number'&&!Number.isFinite(value))throw Error('Invalid number')
 }
 if(Buffer.byteLength(JSON.stringify(fields),'utf8')>32768)throw Error('Record exceeds size limit')
 return fields
}
function assertFile(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Absolute database directory required')
 const dir=fs.lstatSync(directory),file=path.join(directory,DB_NAME)
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Invalid database directory')
 const stat=fs.lstatSync(file)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>50*1024*1024)throw Error('Unsafe database file')
 return file
}
let engine
async function sql(){if(!engine)engine=initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)});return engine}
function schema(db){db.run("CREATE TABLE IF NOT EXISTS standalone_records (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, fields_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")}
function read(db,table){
 validateTable(table)
 if(!db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='standalone_records'").length)return []
 const stmt=db.prepare('SELECT id,fields_json,updated_at FROM standalone_records WHERE table_name=? ORDER BY created_at DESC')
 const rows=[]
 try{stmt.bind([table]);while(stmt.step()){const [id,json,updatedAt]=stmt.get();rows.push({id,...JSON.parse(json),_local_only:true,_local_updated_at:updatedAt})}}finally{stmt.free()}
 return rows
}
async function listLocalRecords(directory,table){
 const file=assertFile(directory),SQL=await sql(),db=new SQL.Database(fs.readFileSync(file))
 try{if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure');return read(db,table)}finally{db.close()}
}
function serialize(directory,task){
 const key=path.resolve(directory),prior=queues.get(key)||Promise.resolve()
 const next=prior.catch(()=>{}).then(task),settled=next.catch(()=>{})
 queues.set(key,settled)
 settled.finally(()=>{if(queues.get(key)===settled)queues.delete(key)})
 return next
}
async function mutateLocalRecord(directory,{action,table,id,fields}){
 return serialize(directory,async()=>{
  validateTable(table)
  if(!['create','update','delete'].includes(action))throw Error('Unsupported local record operation')
  if(action!=='delete')validateFields(fields)
  if(action!=='create'&&(typeof id!=='string'||!/^local-[a-f0-9-]{36}$/.test(id)))throw Error('Only standalone records may be changed')
  const file=assertFile(directory),original=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const SQL=await sql(),db=new SQL.Database(fs.readFileSync(file))
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0]!=='ok')throw Error('Database integrity failure')
   schema(db)
   const stamp=new Date().toISOString()
   if(action==='create'){
    id='local-'+crypto.randomUUID()
    db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',[id,table,JSON.stringify(fields),stamp,stamp])
   }else{
    const existing=db.exec('SELECT 1 FROM standalone_records WHERE id=? AND table_name=?',[id,table])
    if(!existing.length)throw Error('Standalone record not found')
    if(action==='delete')db.run('DELETE FROM standalone_records WHERE id=? AND table_name=?',[id,table])
    else db.run('UPDATE standalone_records SET fields_json=?,updated_at=? WHERE id=? AND table_name=?',[JSON.stringify(fields),stamp,id,table])
   }
   if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==original)throw Error('Database changed during edit')
   const temp=file+'.'+crypto.randomUUID()+'.tmp'
   try{fs.writeFileSync(temp,Buffer.from(db.export()),{flag:'wx',mode:0o600});fs.renameSync(temp,file)}finally{try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
   return {id,table,action,localOnly:true}
  }finally{db.close()}
 })
}
module.exports={TABLES,validateFields,listLocalRecords,mutateLocalRecord}
