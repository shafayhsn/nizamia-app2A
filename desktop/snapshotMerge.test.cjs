'use strict'
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {mergeSnapshotRows}=require('./snapshotMerge.cjs')
async function main(){
 const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm')})
 const db=new SQL.Database()
 try{
  db.run('CREATE TABLE standalone_records(id TEXT PRIMARY KEY,table_name TEXT,fields_json TEXT,created_at TEXT,updated_at TEXT)')
  db.run("INSERT INTO standalone_records VALUES ('local-1','production_daily_entries','{\"quantity\":1194}','now','now')")
  mergeSnapshotRows(db,{orders:[{id:'cloud-1',status:'Remote'},{id:'cloud-2',status:'New'}],buyers:[{id:'b1'}]})
  db.run('CREATE TABLE snapshot_edits(table_name TEXT,record_id TEXT,fields_json TEXT,updated_at TEXT)')
  db.run("INSERT INTO snapshot_edits VALUES ('orders','cloud-1','{\"status\":\"Local\"}','now')")
  db.run('CREATE TABLE offline_draft_journal(draft_id TEXT,state TEXT)')
  db.run("INSERT INTO offline_draft_journal VALUES ('draft-1','pending')")
  const unresolved=mergeSnapshotRows(db,{orders:[{id:'cloud-1',status:'Updated'},{id:'cloud-2',status:'Fresh'}]}).unresolved
  assert.deepEqual(unresolved,[{table:'orders',recordId:'cloud-1'}])
  assert.equal(JSON.parse(db.exec("SELECT row_json FROM snapshot_rows WHERE table_name='orders' AND row_index=1")[0].values[0][0]).status,'Fresh')
  assert.equal(JSON.parse(db.exec("SELECT row_json FROM snapshot_rows WHERE table_name='orders' AND row_index=0")[0].values[0][0]).status,'Remote')
  mergeSnapshotRows(db,{orders:[{id:'cloud-1',status:'Remote'}]})
  assert.equal(db.exec("SELECT COUNT(*) FROM snapshot_rows WHERE table_name='orders'")[0].values[0][0],1)
  assert.equal(JSON.parse(db.exec("SELECT row_json FROM snapshot_rows WHERE table_name='orders'")[0].values[0][0]).status,'Remote')
  assert.equal(db.exec('SELECT COUNT(*) FROM standalone_records')[0].values[0][0],1)
  assert.equal(db.exec("SELECT fields_json FROM snapshot_edits")[0].values[0][0],'{\"status\":\"Local\"}')
  assert.equal(db.exec("SELECT state FROM offline_draft_journal")[0].values[0][0],'pending')
  assert.equal(db.exec("SELECT COUNT(*) FROM snapshot_rows WHERE table_name='buyers'")[0].values[0][0],1)

  const older='2026-11-17T04:35:12Z', newer='2026-11-17T04:47:38Z'
  const notes=(status,at)=>'\n[[APP2A_SHIPPING_META:'+Buffer.from(JSON.stringify({
   display_status:status,...(at?{status_history:[{to:status,at}]}:{})
  })).toString('base64')+']]'
  const shipment={id:'shipment',notes:notes('In-Transit')}
  mergeSnapshotRows(db,{shipments:[shipment]})
  const edit={...shipment,notes:notes('Discharged',newer)}
  db.run('INSERT INTO snapshot_edits VALUES (?,?,?,?)',['shipments','shipment',JSON.stringify(edit),newer])
  const shipped={...shipment,notes:notes('Delivered',older),tracking_url:'fresh'}
  assert.deepEqual(mergeSnapshotRows(db,{shipments:[shipped]}).unresolved,[])
  const mergedShipment=JSON.parse(db.exec("SELECT fields_json FROM snapshot_edits WHERE table_name='shipments'")[0].values[0][0])
  assert.deepEqual(mergedShipment,{...edit,tracking_url:'fresh'})
  const newerShipment={...shipped,notes:notes('At destination','2026-11-17T05:00:00Z')}
  assert.deepEqual(mergeSnapshotRows(db,{shipments:[newerShipment]}).unresolved,[])
  assert.equal(db.exec("SELECT COUNT(*) FROM snapshot_edits WHERE table_name='shipments'")[0].values[0][0],0)
  assert.throws(()=>mergeSnapshotRows(db,{orders:[{id:'ok'},null]}),/Invalid snapshot row/)
  assert.equal(db.exec("SELECT COUNT(*) FROM snapshot_rows WHERE table_name='orders'")[0].values[0][0],1)
  assert.equal(db.exec('PRAGMA integrity_check')[0].values[0][0],'ok')
  console.log('Local snapshot merge tests passed; standalone records, overlays and drafts preserved')
 }finally{db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
