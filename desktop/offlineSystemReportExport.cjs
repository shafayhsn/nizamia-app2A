'use strict'
// Convert calculated OMS reports to bounded, tabular, export-ready data.
const MAX_ROWS=20000
function reportRows(report) {
 if(!report||report.available!==true||!Array.isArray(report.rows)||report.rows.length>MAX_ROWS)
  throw Error('Operational report is unavailable or exceeds export limit')
 if(report.sourceTable)return report.rows.map(row=>({
  order_number:row.orderNumber,buyer:row.buyer,ordered_quantity:row.orderedQuantity,
  linked_records:row.linkedRecords,linked_quantity:row.linkedQuantity,
  progress_percent:row.progressPercent,statuses:Object.entries(row.statuses||{}).map(([k,v])=>k+': '+v).join('; ')
 }))
 return report.rows.map(row=>({
  group:row.group,records:row.records,
  quantity:report.quantityAvailable&&row.quantityRecords?row.quantity:null,
  quantity_record_count:report.quantityAvailable?row.quantityRecords:null
 }))
}
function reportExport(db,key,format) {
 if(!['csv','xlsx'].includes(format))throw Error('Unsupported report format')
 const {DEFINITIONS,systemReport}=require('./offlineSystemReports.cjs')
 const {REPORTS,crossModuleReport}=require('./offlineCrossModuleReports.cjs')
 const {SPECS,operationalExceptions}=require('./offlineOperationalExceptions.cjs')
 const report=Object.hasOwn(SPECS,key) ? operationalExceptions(db,key) : key==='production_stage_balance' ? require('./offlineProductionBalance.cjs').productionBalance(db) : REPORTS.some(d=>d.key===key)?crossModuleReport(db,key):systemReport(db,key)
 const rows=Object.hasOwn(SPECS,key) ? (report.available ? report.rows.map(r=>({order_number:r.orderNumber,buyer:r.buyer,order_quantity:r.orderQuantity,source_a:r.sourceA,source_a_records:r.firstRecords,source_a_quantity:r.firstQuantity,source_b:r.sourceB,source_b_records:r.secondRecords,source_b_quantity:r.secondQuantity,gap:r.gap,warning:r.warning,source_a_statuses:JSON.stringify(r.firstStatuses),source_b_statuses:JSON.stringify(r.secondStatuses)})):reportRows(report)) : key==='production_stage_balance' ? (report.available?report.rows.map(row=>({...row})):reportRows(report)) : reportRows(report)
 const columns=Object.hasOwn(SPECS,key) ? ['order_number','buyer','order_quantity','source_a','source_a_records','source_a_quantity','source_b','source_b_records','source_b_quantity','gap','warning','source_a_statuses','source_b_statuses'] : key==='production_stage_balance' ? ['orderId','orderNumber','buyer','orderedQuantity','cutting','cuttingBalance','sewing','sewingBalance','washing','washingBalance','finishing','finishingBalance','packing','packingBalance'] : report.sourceTable
  ? ['order_number','buyer','ordered_quantity','linked_records','linked_quantity','progress_percent','statuses']
  : ['group','records','quantity','quantity_record_count']
 return {key,title:report.title,rows,columns,source:report.sourceTable||report.table||report.sources?.join(', ')||'',
  provenance:report.localRecords ? 'Includes '+report.localRecords+' standalone offline records alongside available imported snapshot data; not synchronized to cloud' : 'Imported local snapshot; not live cloud data',generatedAt:new Date().toISOString()}
}
module.exports={reportRows,reportExport}
