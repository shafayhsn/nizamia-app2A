'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {migrateLocalFile,verifySqlite}=require('./offlineSchemaMigration.cjs');
const inventory={tableCount:1,columnCount:2,tables:[{table_name:'orders',columns:[{name:'id',type:'uuid'},{name:'notes',type:'text'}]}]};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-schema-'));
const file=path.join(dir,'db.sqlite');
const bytes=Buffer.concat([Buffer.from('SQLite format 3\0','binary'),Buffer.alloc(512)]);
const makeDb=()=>{let created=false;return {exec:s=>s.includes('sqlite_master')?(created?[{values:[['offline_orders']]}]:[]):s.includes('table_info')?(created?[{values:[[0,'id','TEXT'],[1,'notes','TEXT']]}]:[]):s==='PRAGMA integrity_check'?[{values:[['ok']]}]:[],run:s=>{if(s.startsWith('CREATE TABLE'))created=true},export:()=>bytes,close:()=>{}}};
try{
 assert.throws(()=>verifySqlite(Buffer.from('bad')),/Invalid/);
 fs.writeFileSync(file,bytes);
 const events=[];
 const result=migrateLocalFile({file,inventory,allowedTables:['orders'],openDatabase:()=>makeDb(),onProgress:x=>events.push(x)});
 assert.equal(result.status,'updated');assert.equal(result.applied,1);assert.equal(events.length,1);
 assert.deepEqual(fs.readFileSync(file),bytes);assert.deepEqual(fs.readFileSync(result.backup),bytes);
 assert.equal(fs.existsSync(file+'.schema-staging'),false);
 assert.throws(()=>migrateLocalFile({file,inventory,allowedTables:['users'],openDatabase:()=>makeDb()}),/allowlist/);
 assert.deepEqual(fs.readFileSync(file),bytes);
 const failDb={...makeDb(),run:s=>{if(s.startsWith('CREATE TABLE'))throw Error('simulated failure')}};
 assert.throws(()=>migrateLocalFile({file,inventory,allowedTables:['orders'],openDatabase:()=>failDb}),/simulated failure/);
 assert.deepEqual(fs.readFileSync(file),bytes);
 console.log('Local schema migration backup and failure tests passed');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
