'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const initSqlJs=require('sql.js')
const {FORMS,normalizeForm}=require('./standaloneForms.cjs')
const {mutateLocalRecord}=require('./standaloneRecords.cjs')
const {systemReport}=require('./offlineSystemReports.cjs')
async function main(){
 assert.equal(Object.keys(FORMS).length,9)
 assert.equal(normalizeForm('orders',{job_number:'J01',buyer_name:'Buyer',total_qty:'120'}).total_qty,120)
 assert.throws(()=>normalizeForm('orders',{job_number:'',buyer_name:'Buyer'}),/required/)
 assert.throws(()=>normalizeForm('orders',{job_number:'J01',buyer_name:'Buyer',total_qty:'bad'}),/non-negative/)
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-form-report-'))
 try{
  const SQL=await initSqlJs({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm')})
  const db=new SQL.Database()
  db.run('CREATE TABLE snapshot_manifest (table_name TEXT,row_count INTEGER)')
  db.run('CREATE TABLE snapshot_rows (table_name TEXT,row_index INTEGER,row_json TEXT)')
  fs.writeFileSync(path.join(dir,'nizamia-app2a.sqlite'),Buffer.from(db.export()));db.close()
  await mutateLocalRecord(dir,{action:'create',table:'orders',fields:{job_number:'LOCAL1',buyer_name:'Buyer A',total_qty:'100',status:'open'}})
  await mutateLocalRecord(dir,{action:'create',table:'orders',fields:{job_number:'LOCAL2',buyer_name:'Buyer A',total_qty:50,status:'open'}})
  const current=new SQL.Database(fs.readFileSync(path.join(dir,'nizamia-app2a.sqlite')))
  const report=systemReport(current,'orders_by_buyer')
  assert.equal(report.totalRecords,2);assert.equal(report.localRecords,2)
  assert.equal(report.rows[0].quantity,150)
  current.close()
  process.stdout.write('Standalone business forms and live local operational reports passed.\\n')
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1})
