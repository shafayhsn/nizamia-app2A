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
 const report=REPORTS.some(d=>d.key===key)?crossModuleReport(db,key):systemReport(db,key)
 const rows=reportRows(report)
 const columns=report.sourceTable
  ? ['order_number','buyer','ordered_quantity','linked_records','linked_quantity','progress_percent','statuses']
  : ['group','records','quantity','quantity_record_count']
 return {key,title:report.title,rows,columns,source:report.sourceTable||report.table,
  provenance:'Imported local snapshot; not live cloud data',generatedAt:new Date().toISOString()}
}
module.exports={reportRows,reportExport}
