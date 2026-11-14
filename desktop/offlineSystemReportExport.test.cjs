'use strict'
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {reportExport,reportRows}=require('./offlineSystemReportExport.cjs')
async function main(){
 const SQL=await initSqlJs(),db=new SQL.Database()
 try{
  db.run('CREATE TABLE snapshot_manifest(table_name TEXT,row_count INTEGER)')
  db.run('CREATE TABLE snapshot_rows(table_name TEXT,row_index INTEGER,row_json TEXT)')
  for(const [table,rows] of Object.entries({
   orders:[{id:'o1',buyer:'Buyer A',quantity:200,status:'Open'}],
   production_daily_entries:[{order_id:'o1',department:'Cutting',quantity:75}],
   purchase_orders:[{order_id:'o1',supplier:'Vendor',status:'Pending',quantity:100}],
   tasks:[{status:'Open',assignee:'Operator'}],
   shipments:[{order_id:'o1',status:'Booked'}]
  })){
   db.run('INSERT INTO snapshot_manifest VALUES (?,?)',[table,rows.length])
   rows.forEach((row,i)=>db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',[table,i,JSON.stringify(row)]))
  }
  const simple=reportExport(db,'orders_by_buyer','xlsx')
  assert.equal(simple.rows[0].group,'Buyer A')
  assert.equal(simple.rows[0].quantity,200)
  const linked=reportExport(db,'order_production_progress','csv')
  assert.equal(linked.rows[0].progress_percent,37.5)
  assert.equal(linked.rows[0].order_number,'o1')
  assert.equal(linked.rows[0].linked_quantity,75)
  assert.equal(reportExport(db,'order_purchasing_status','xlsx').rows[0].linked_records,1)
  assert.equal(reportExport(db,'order_shipping_status','xlsx').rows[0].linked_records,1)
  assert.throws(()=>reportExport(db,'orders_by_buyer','pdf'),/Unsupported/)
  assert.throws(()=>reportRows({available:false,rows:[]}),/unavailable/)
  process.stdout.write('Calculated OMS Excel/CSV export data tests passed.\n')
 }finally{db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
