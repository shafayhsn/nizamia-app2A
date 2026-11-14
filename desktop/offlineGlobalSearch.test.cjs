'use strict'
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {searchSnapshot}=require('./offlineGlobalSearch.cjs')
async function main(){
 const SQL=await initSqlJs()
 const db=new SQL.Database()
 try{
 db.run('CREATE TABLE snapshot_manifest(table_name TEXT,row_count INTEGER)')
 db.run('CREATE TABLE snapshot_rows(table_name TEXT,row_index INTEGER,row_json TEXT)')
 for(const table of ['orders','tasks','users','auth_tokens']) db.run('INSERT INTO snapshot_manifest VALUES (?,1)',[table])
 const rows=[
 ['orders',{id:1,po_number:'PO-42',buyer:'Nizamia',secret_token:'PO-42-hidden'}],
 ['tasks',{id:2,title:'Follow up PO-42',password:'PO-42-hidden'}],
 ['users',{id:3,name:'PO-42 private'}],
 ['auth_tokens',{id:4,token:'PO-42 private'}]]
 rows.forEach(([table,row],i)=>db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',[table,i,JSON.stringify(row)]))
 const found=searchSnapshot(db,'PO-42')
 assert.equal(found.total,2)
 assert.deepEqual(found.matches.map(x=>x.table),['orders','tasks'])
 assert.equal(found.matches[0].record.secret_token,undefined)
 assert.equal(found.matches[1].record.password,undefined)
 assert.equal(searchSnapshot(db,'PO-42',1).truncated,true)
 assert.equal(searchSnapshot(db,'hidden').total,0)
 db.run('CREATE TABLE standalone_records(id TEXT PRIMARY KEY,table_name TEXT,fields_json TEXT,created_at TEXT,updated_at TEXT)')
 db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',['local-1','orders',JSON.stringify({job_number:'LOCAL-55',buyer_name:'Factory',secret_token:'hidden'}),'now','now'])
 const local=searchSnapshot(db,'LOCAL-55')
 assert.equal(local.total,1)
 assert.equal(local.matches[0].record.job_number,'LOCAL-55')
 assert.equal(local.matches[0].record.secret_token,undefined)
 assert.equal(searchSnapshot(db,'hidden').total,0)
 assert.throws(()=>searchSnapshot(db,'a'),/2–120/)
 assert.throws(()=>searchSnapshot(db,'a'.repeat(121)),/2–120/)
 assert.throws(()=>searchSnapshot(db,'PO-42',201),/limit/)
 process.stdout.write('Cross-module offline search tests passed.\n')
 }finally{db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
