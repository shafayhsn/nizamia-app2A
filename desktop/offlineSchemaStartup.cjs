'use strict'
// Offline migration preflight for an existing SQLite file. This module never
// contacts Supabase and never infers permission from the schema inventory.
const fs=require('node:fs');
const path=require('node:path');
const {migrateLocalFile}=require('./offlineSchemaMigration.cjs');
const {TABLES}=require('./standaloneRecords.cjs');
const inventory=require('./schema/public-schema-inventory.json');
const init=require('sql.js');
const PRIVATE=/password|secret|token|credential|api_key|private_key/i;
function reviewedTables(){
 const tables=inventory.tables.filter(t=>TABLES.has(t.table_name)&&t.columns.length>0&&t.columns.every(c=>!PRIVATE.test(c.name)));
 return tables.map(t=>t.table_name);
}
async function migrateReviewedLocalSchema(directory,{onProgress=()=>{}}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Absolute database directory required');
 const file=path.join(directory,'nizamia-app2a.sqlite');
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size>1024*1024*1024)throw Error('Unsafe local database file');
 const wasm=require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
 const SQL=await init({locateFile:()=>wasm});
 return migrateLocalFile({file,inventory,allowedTables:reviewedTables(),openDatabase:bytes=>new SQL.Database(bytes),onProgress});
}
module.exports={migrateReviewedLocalSchema,reviewedTables};
