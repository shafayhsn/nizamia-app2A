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
  db.run('DELETE FROM snapshot_manifest WHERE table_name = ?',['production_daily_entries'])
  assert.equal(productionBalance(db).available,false)
  process.stdout.write('Independent stage balances, overproduction, missing data and export tests passed.\n')
 }finally{db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
