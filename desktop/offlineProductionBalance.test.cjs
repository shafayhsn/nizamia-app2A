'use strict'
const assert=require('node:assert/strict')
const initSqlJs=require('sql.js')
const {productionBalance}=require('./offlineProductionBalance.cjs')
const {reportExport}=require('./offlineSystemReportExport.cjs')
async function main(){
 const SQL=await initSqlJs(),db=new SQL.Database()
 try{
  db.run('CREATE TABLE snapshot_manifest(table_name TEXT,row_count INTEGER)')
  db.run('CREATE TABLE snapshot_rows(table_name TEXT,row_index INTEGER,row_json TEXT)')
  const fixtures={
   orders:[{id:'o1',po_number:'PO-01',quantity:100},{id:'o2',quantity:80}],
   production_daily_entries:[
    {order_id:'o1',department:'Cutting',quantity:100},
    {order_id:'o1',department:'Sewing',quantity:60},
    {order_id:'o1',department:'Sewing',quantity:10},
    {order_id:'o1',department:'Washing',quantity:45},
    {order_id:'o1',department:'Packing',quantity:30},
    {order_id:'o2',department:'Cutting',quantity:90},
    {order_id:'missing',department:'Sewing',quantity:100},
    {order_id:'o2',department:'Other',quantity:2},
    {order_id:'o2',department:'Finishing'}
   ]
  }
  for(const [table,rows] of Object.entries(fixtures)){
   db.run('INSERT INTO snapshot_manifest VALUES (?,?)',[table,rows.length])
   rows.forEach((row,i)=>db.run('INSERT INTO snapshot_rows VALUES (?,?,?)',[table,i,JSON.stringify(row)]))
  }
  const report=productionBalance(db)
  assert.equal(report.available,true)
  assert.equal(report.rows[0].cutting,100)
  assert.equal(report.rows[0].sewing,70)
  assert.equal(report.rows[0].sewingBalance,30)
  assert.equal(report.rows[0].washing,45)
  assert.equal(report.rows[0].packingBalance,70)
  assert.equal(report.rows[0].finishing,null)
  assert.equal(report.rows[1].cuttingBalance,-10)
  assert.equal(report.issues.unlinked,1)
  assert.equal(report.issues.unknownStage,1)
  assert.equal(report.issues.missingQuantity,1)
  const exportData=reportExport(db,'production_stage_balance','xlsx')
  assert.equal(exportData.rows[0].sewingBalance,30)
  assert.ok(exportData.columns.includes('packingBalance'))
  db.run("CREATE TABLE standalone_records (id TEXT PRIMARY KEY,table_name TEXT,fields_json TEXT,created_at TEXT,updated_at TEXT)")
  const localOrder={job_number:'LOCAL-01',buyer_name:'Buyer',total_qty:120}
  db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',['local-111','orders',JSON.stringify(localOrder),'2026-11-14','2026-11-14'])
  db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',['local-222','production_daily_entries',JSON.stringify({order_id:'local-111',department:'Cutting',quantity:90}),'2026-11-14','2026-11-14'])
  db.run('INSERT INTO standalone_records VALUES (?,?,?,?,?)',['local-333','production_daily_entries',JSON.stringify({order_id:'local-111',department:'Sewing',quantity:50}),'2026-11-14','2026-11-14'])
  const withLocal=productionBalance(db)
  const localRow=withLocal.rows.find(row=>row.orderId==='local-111')
  assert.equal(localRow.orderedQuantity,120)
  assert.equal(localRow.cutting,90)
  assert.equal(localRow.cuttingBalance,30)
  assert.equal(localRow.sewingBalance,70)
  assert.equal(localRow.packing,null)
  assert.equal(withLocal.localRecords,3)
  const exportedLocal=reportExport(db,'production_stage_balance','csv')
  assert.ok(exportedLocal.rows.some(row=>row.orderId==='local-111'))
  db.run('DELETE FROM snapshot_manifest WHERE table_name = ?',['production_daily_entries'])
  db.run("DELETE FROM standalone_records WHERE table_name='production_daily_entries'")
  assert.equal(productionBalance(db).available,false)
  process.stdout.write('Independent stage balances, overproduction, missing data and export tests passed.\n')
 }finally{db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
