'use strict'
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {systemReport,DEFINITIONS}=require('./offlineSystemReports.cjs')
async function main(){
 const SQL=await initSqlJs()
 const db=new SQL.Database()
 try{
  db.run('CREATE TABLE snapshot_manifest(table_name TEXT,row_count INTEGER)')
  db.run('CREATE TABLE snapshot_rows(table_name TEXT,row_index INTEGER,row_json TEXT)')
  for(const table of ['orders','production_daily_entries','purchase_orders','tasks']){
   db.run('INSERT INTO snapshot_manifest VALUES (?,0)',[table])
  }
  const data={
   orders:[{buyer:'Buyer A',status:'Open',quantity:100},{buyer:'Buyer A',status:'Closed',quantity:50},{buyer:'Buyer B',status:'Open',quantity:20}],
   production_daily_entries:[{department:'Cutting',production_date:'2026-11-10',quantity:100},{department:'Sewing',production_date:'2026-11-10',quantity:75}],
   purchase_orders:[{supplier:'Fabric Co',status:'Pending',quantity:500}],
   tasks:[{status:'Open',assignee:'Ali'},{status:'Done',assignee:'Sara'}]
  }
  for(const [table,rows] of Object.entries(data))rows.forEach((row,i)=>db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',[table,i,JSON.stringify(row)]))
  assert.equal(DEFINITIONS.length,14)
  const buyers=systemReport(db,'orders_by_buyer')
  assert.equal(buyers.totalRecords,3)
  assert.equal(buyers.rows.find(r=>r.group==='Buyer A').quantity,150)
  assert.equal(buyers.rows.find(r=>r.group==='Buyer A').records,2)
  assert.equal(systemReport(db,'production_by_department').rows.length,2)
  assert.equal(systemReport(db,'orders_by_style').available,false)
  assert.equal(systemReport(db,'shipping_by_status').available,false)
  assert.equal(systemReport(db,'sampling_by_status').available,false)
  assert.equal(systemReport(db,'parcels_by_courier').available,false)
  assert.equal(systemReport(db,'production_by_date').rows[0].quantity,175)
  assert.equal(systemReport(db,'tasks_by_status').quantityAvailable,false)
  assert.equal(systemReport(db,'purchasing_by_supplier').rows[0].group,'Fabric Co')
  assert.throws(()=>systemReport(db,'bad'),/Unknown/)
  db.run('DELETE FROM snapshot_manifest WHERE table_name = ?',['orders'])
  assert.equal(systemReport(db,'orders_by_buyer').available,false)
  process.stdout.write('Fourteen snapshot and offline OMS report definition tests passed.\n')
 } finally {db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
