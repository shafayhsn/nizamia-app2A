'use strict'
// CP-20: conservative, deterministic SQLite schema planning. No cloud access.
// Schema inventory is NOT an authorization grant: the caller must provide a
// reviewed allowlist of tables that may be stored on this device.
const IDENT=/^[a-z][a-z0-9_]*$/;
const PRIVATE=new Set(['users','permissions','roles','app_database_sync_status','notification_reads','app_task_reads']);
const q=s=>{if(!IDENT.test(s))throw Error('Invalid schema identifier');return '"'+s+'"'};
function affinity(type){
 if(['int2','int4','int8','bool'].includes(type))return 'INTEGER';
 if(['float4','float8','numeric','money'].includes(type))return 'REAL';
 if(['bytea'].includes(type))return 'BLOB';
 return 'TEXT'; // JSON, UUID and timestamps are encoded losslessly as text
}
function validateInventory(inventory){
 if(!inventory||!Array.isArray(inventory.tables)||inventory.tableCount!==inventory.tables.length)throw Error('Invalid schema inventory');
 const seen=new Set();let columns=0;
 for(const t of inventory.tables){
  if(!t||!IDENT.test(t.table_name)||seen.has(t.table_name)||!Array.isArray(t.columns))throw Error('Invalid or duplicate table');
  seen.add(t.table_name);const cols=new Set();
  for(const c of t.columns){if(!c||!IDENT.test(c.name)||cols.has(c.name)||typeof c.type!=='string'||!c.type)throw Error('Invalid or duplicate column');cols.add(c.name);columns++}
 }
 if(columns!==inventory.columnCount)throw Error('Schema inventory column count mismatch');
 return true;
}
function planSchema({inventory,allowedTables,localTables={}}){
 validateInventory(inventory);
 if(!Array.isArray(allowedTables)||!allowedTables.every(x=>typeof x==='string'&&IDENT.test(x)&&!PRIVATE.has(x)))throw Error('Reviewed business-table allowlist required');
 const permitted=new Set(allowedTables),available=new Set(inventory.tables.map(t=>t.table_name));
 if([...permitted].some(t=>!available.has(t)))throw Error('Allowlist contains unknown table');
 const operations=[],counts={checked:0,created:0,addedColumns:0,unchanged:0,manualReview:0,retiredCandidates:0};
 for(const table of inventory.tables){
  if(!permitted.has(table.table_name))continue;
  counts.checked++;
  const name='offline_'+table.table_name,existing=localTables[name];
  if(!existing){
   const cols=table.columns.map(c=>q(c.name)+' '+affinity(c.type)).join(', ');
   if(!cols)throw Error('Cannot create table without columns');
   operations.push({kind:'create',table:name,sql:'CREATE TABLE '+q(name)+' ('+cols+')'});
   counts.created++;continue;
  }
  if(!Array.isArray(existing))throw Error('Invalid local schema');
  const existingMap=new Map(existing.map(c=>[c.name,String(c.type).toUpperCase()]));
  let changed=false;
  for(const c of table.columns){
   if(!existingMap.has(c.name)){
    operations.push({kind:'add-column',table:name,column:c.name,sql:'ALTER TABLE '+q(name)+' ADD COLUMN '+q(c.name)+' '+affinity(c.type)});
    counts.addedColumns++;changed=true;
   }else if(existingMap.get(c.name)!==affinity(c.type)){
    operations.push({kind:'manual-review',table:name,column:c.name,reason:'Column type changed; migration needs explicit conversion'});
    counts.manualReview++;changed=true;
   }
  }
  for(const old of existingMap.keys())if(!table.columns.some(c=>c.name===old)){
   operations.push({kind:'manual-review',table:name,column:old,reason:'Column absent from online schema; retain local data'});
   counts.manualReview++;changed=true;
  }
  if(!changed)counts.unchanged++;
 }
 // Do not infer retired cloud tables from the offline_ prefix: existing draft
 // journals and other local-only modules use the same prefix. Retirements
 // require an explicit, reviewed migration manifest and are never auto-dropped.
 return {counts,operations,canApply:!operations.some(x=>x.kind==='manual-review')};
}
function readLocalTables(db){
 const result={};
 const names=db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'offline_%'");
 for(const [name] of names[0]?.values||[]){
  if(!IDENT.test(name)||!name.startsWith('offline_'))throw Error('Invalid local table name');
  const info=db.exec('PRAGMA table_info('+q(name)+')');
  result[name]=(info[0]?.values||[]).map(row=>({name:row[1],type:row[2]}));
 }
 return result;
}
function applySchema(db,plan,{onProgress=()=>{}}={}){
 if(!plan?.canApply||!Array.isArray(plan.operations))throw Error('Schema requires review; no changes applied');
 const executable=plan.operations.filter(op=>op.kind==='create'||op.kind==='add-column');
 db.run('BEGIN IMMEDIATE');
 try{
  for(let i=0;i<executable.length;i++){
   const op=executable[i];
   if(typeof op.sql!=='string'||!/^CREATE TABLE "offline_[a-z0-9_]+" \(|^ALTER TABLE "offline_[a-z0-9_]+" ADD COLUMN "/.test(op.sql))throw Error('Invalid migration statement');
   db.run(op.sql);
   onProgress({completed:i+1,total:executable.length,table:op.table,kind:op.kind});
  }
  const integrity=db.exec('PRAGMA integrity_check');
  if(integrity[0]?.values?.[0]?.[0]!=='ok')throw Error('SQLite integrity check failed');
  db.run('COMMIT');
 }catch(error){try{db.run('ROLLBACK')}catch{}throw error}
 return {applied:executable.length};
}
module.exports={validateInventory,planSchema,readLocalTables,applySchema,affinity};
