'use strict'
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {operationalExceptions}=require('./offlineOperationalExceptions.cjs')
const {reportExport}=require('./offlineSystemReportExport.cjs')
async function main(){
 const SQL=await initSqlJs(),db=new SQL.Database()
 try{
  db.run('CREATE TABLE snapshot_manifest(table_name TEXT,row_count INTEGER)')
  db.run('CREATE TABLE snapshot_rows(table_name TEXT,row_index INTEGER,row_json TEXT)')
  const data={
   orders:[{id:'o1',po_number:'PO-1',quantity:100},{id:'o2',quantity:80}],
   bom_items:[{order_id:'o1',required_quantity:150,material:'Denim'}],
   purchase_orders:[{order_id:'o1',quantity:100,status:'Pending'}],
   finishing_packs:[{order_id:'o1',packed_quantity:70}],
   shipments:[{order_id:'o1',shipped_quantity:50,status:'Booked'}],
   samples:[{order_id:'o1',status:'Pending'},{order_id:'o1',status:'Approved'}],
   approvals:[{order_id:'o1',approval_status:'Rejected'}]
  }
  for(const [table,rows] of Object.entries(data)){
   db.run('INSERT INTO snapshot_manifest VALUES (?,?)',[table,rows.length])
   rows.forEach((row,i)=>db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',[table,i,JSON.stringify(row)]))
  }
  const purchasing=operationalExceptions(db,'purchasing_requirements')
  assert.equal(purchasing.rows[0].firstQuantity,150)
  assert.equal(purchasing.rows[0].secondQuantity,100)
  assert.equal(purchasing.rows[0].gap,null)
  const shipping=operationalExceptions(db,'shipment_readiness')
  assert.equal(shipping.rows[0].gap,30)
  assert.equal(shipping.rows[1].gap,null)
  const approvals=operationalExceptions(db,'pending_approvals')
  assert.equal(approvals.rows[0].gap,2)
  assert.equal(approvals.rows[1].gap,0)
  assert.equal(reportExport(db,'shipment_readiness','xlsx').rows[0].gap,30)
  assert.equal(reportExport(db,'pending_approvals','csv').rows[0].gap,2)
  assert.throws(()=>operationalExceptions(db,'invalid'),/Unknown/)
  db.run('DELETE FROM snapshot_manifest WHERE table_name IN (?,?)',['samples','approvals'])
  assert.equal(operationalExceptions(db,'pending_approvals').available,false)
  process.stdout.write('Operational exceptions, source gaps, shipment readiness and approval tests passed.\n')
 }finally{db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
