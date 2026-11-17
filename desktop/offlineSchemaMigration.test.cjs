'use strict'
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const init=require('sql.js');
const {migrateLocalFile,verifySqlite}=require('./offlineSchemaMigration.cjs');
(async()=>{
 const SQL=await init({locateFile:f=>require.resolve('sql.js/dist/'+f)});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-schema-safety-'));
 const file=path.join(dir,'db.sqlite');
 const inventory={tableCount:1,columnCount:2,tables:[{table_name:'orders',columns:[{name:'id',type:'uuid'},{name:'notes',type:'text'}]}]};
 const open=bytes=>new SQL.Database(bytes);
 try{
  assert.throws(()=>verifySqlite(Buffer.from('bad')),/Invalid/);
  const db=new SQL.Database();
  db.run('CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT)');
  db.run("INSERT INTO app_metadata VALUES ('checkpoint','keep')");
  const original=Buffer.from(db.export());db.close();
  fs.writeFileSync(file,original);
  const events=[];
  const result=migrateLocalFile({file,inventory,allowedTables:['orders'],openDatabase:open,onProgress:x=>events.push(x)});
  assert.equal(result.status,'updated');
  assert.equal(result.applied,1);
  assert.equal(events.length,1);
  assert.deepEqual(fs.readFileSync(result.backup),original);
  assert.equal(fs.existsSync(file+'.schema-staging'),false);
  const migrated=fs.readFileSync(file);
  const checked=open(migrated);
  assert.equal(checked.exec("SELECT value FROM app_metadata WHERE key='checkpoint'")[0].values[0][0],'keep');
  assert.equal(checked.exec('PRAGMA integrity_check')[0].values[0][0],'ok');
  checked.close();
  assert.throws(()=>migrateLocalFile({file,inventory,allowedTables:['users'],openDatabase:open}),/allowlist/);
  assert.deepEqual(fs.readFileSync(file),migrated);
  fs.writeFileSync(file,original);
  const failOpen=bytes=>{
   const instance=open(bytes);
   const run=instance.run.bind(instance);
   instance.run=(sql,...args)=>{if(sql.startsWith('CREATE TABLE "offline_orders"'))throw Error('simulated failure');return run(sql,...args)};
   return instance;
  };
  assert.throws(()=>migrateLocalFile({file,inventory,allowedTables:['orders'],openDatabase:failOpen}),/simulated failure/);
  assert.deepEqual(fs.readFileSync(file),original);
  fs.writeFileSync(file+'.schema-staging',Buffer.from('incomplete'));
  assert.throws(()=>migrateLocalFile({file,inventory,allowedTables:['orders'],openDatabase:open}),/Unresolved schema staging/);
  assert.deepEqual(fs.readFileSync(file),original);
  console.log('Real SQLite backup, export verification, failure and staging tests passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
