'use strict'
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {REPORTS,crossModuleReport}=require('./offlineCrossModuleReports.cjs')
async function main(){
 const SQL=await initSqlJs(),db=new SQL.Database()
 try {
  db.run('CREATE TABLE snapshot_manifest(table_name TEXT,row_count INTEGER)')
  db.run('CREATE TABLE snapshot_rows(table_name TEXT,row_index INTEGER,row_json TEXT)')
  const data={
   orders:[{id:'o1',po_number:'PO-101',buyer_name:'Buyer A',quantity:200},{id:'o2',po_number:'PO-102',quantity:100}],
   production_daily_entries:[{order_id:'o1',department:'Cutting',quantity:50},{order_id:'o1',department:'Sewing',quantity:25},{order_id:'missing',quantity:999}],
   purchase_orders:[{order_id:'o1',status:'Pending',quantity:100}],
   shipments:[{order_id:'o2',status:'Booked',quantity:50}]
  }
  for(const [table,rows] of Object.entries(data)){
   db.run('INSERT INTO snapshot_manifest VALUES (?,?)',[table,rows.length])
   rows.forEach((row,i)=>db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',[table,i,JSON.stringify(row)]))
  }
  assert.equal(REPORTS.length,3)
  const prod=crossModuleReport(db,'order_production_progress')
  assert.equal(prod.matched,2);assert.equal(prod.unmatched,1)
  assert.equal(prod.rows.find(r=>r.orderId==='o1').progressPercent,37.5)
  assert.equal(prod.rows.find(r=>r.orderId==='o2').progressPercent,null)
  assert.equal(crossModuleReport(db,'order_purchasing_status').rows[0].statuses.Pending,1)
  assert.equal(crossModuleReport(db,'order_shipping_status').rows[1].statuses.Booked,1)
  assert.throws(()=>crossModuleReport(db,'invalid'),/Unknown/)
  db.run('DELETE FROM snapshot_manifest WHERE table_name = ?',['shipments'])
  assert.equal(crossModuleReport(db,'order_shipping_status').available,false)
  process.stdout.write('Cross-module order reports passed: production, purchasing, shipping and missing-data guards.\n')
 } finally {db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
