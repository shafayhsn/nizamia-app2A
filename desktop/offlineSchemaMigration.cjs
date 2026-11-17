'use strict'
// CP-20: isolated file-level SQLite migration runner. Not wired to startup.
// Caller must supply a reviewed allowlist and a trusted bundled schema manifest.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {planSchema,readLocalTables,applySchema}=require('./offlineSchemaAlignment.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function verifySqlite(bytes){if(bytes.length<100||bytes.subarray(0,16).toString('binary')!=='SQLite format 3\0')throw Error('Invalid SQLite database');}
function migrateLocalFile({file,inventory,allowedTables,openDatabase,onProgress=()=>{},fsImpl=fs}){
 if(typeof file!=='string'||!path.isAbsolute(file)||typeof openDatabase!=='function')throw Error('Trusted local file and SQLite opener required');
 const original=fsImpl.readFileSync(file);verifySqlite(original);
 const db=openDatabase(original);
 let plan,updated;
 try{
  plan=planSchema({inventory,allowedTables,localTables:readLocalTables(db)});
  if(!plan.canApply)return {status:'review-required',counts:plan.counts,issues:plan.operations.filter(x=>x.kind==='manual-review')};
  if(!plan.operations.length)return {status:'unchanged',counts:plan.counts};
  applySchema(db,plan,{onProgress});
  updated=Buffer.from(db.export());verifySqlite(updated);
 }finally{db.close()}
 const backup=file+'.schema-backup-'+sha(original).slice(0,16);
 const staging=file+'.schema-staging';
 if(fsImpl.existsSync(staging))throw Error('Unresolved schema staging file; manual recovery required');
 if(fsImpl.existsSync(backup)){
  if(sha(fsImpl.readFileSync(backup))!==sha(original))throw Error('Backup name collision with different contents');
 }else{
  fsImpl.writeFileSync(backup,original,{flag:'wx',mode:0o600});
 }
 if(sha(fsImpl.readFileSync(backup))!==sha(original))throw Error('Pre-migration backup verification failed');
 // Never overwrite original until a complete and verified staged file exists.
 try{
  fsImpl.writeFileSync(staging,updated,{flag:'wx',mode:0o600});
  if(sha(fsImpl.readFileSync(staging))!==sha(updated))throw Error('Staged migration verification failed');
  fsImpl.renameSync(staging,file);
 }catch(error){
  try{if(fsImpl.existsSync(staging))fsImpl.unlinkSync(staging)}catch{}
  throw error;
 }
 return {status:'updated',counts:plan.counts,applied:plan.operations.length,backup,sha256:sha(updated)};
}
module.exports={migrateLocalFile,verifySqlite};
