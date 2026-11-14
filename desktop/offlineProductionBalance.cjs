'use strict'
// Stage-aware production balance: each department is reported separately.
// Never add cutting + sewing + washing as if they were distinct finished garments.
const {read,numeric}=require('./offlineCrossModuleReports.cjs')
const {readLocalRows}=require('./standaloneRecords.cjs')
// Shared read() already combines imported and standalone records; never append them twice.
function combined(db,table){return read(db,table)}
const STAGES=['cutting','sewing','washing','finishing','packing']
const DEPT_KEYS=['department','dept','department_name','stage','process']
const ORDER_KEYS=['order_id','orderId','oms_order_id']
const QTY_KEYS=['quantity','produced_qty','production_qty','output_qty','qty','pieces']
function stageOf(row){
 const raw=DEPT_KEYS.map(k=>row[k]).find(v=>typeof v==='string'&&v.trim())
 if(!raw)return null
 const s=raw.toLowerCase()
 return STAGES.find(stage=>s.includes(stage))||null
}
function productionBalance(db){
 const orders=combined(db,'orders')
 if(!orders)return {available:false,reason:'Orders source missing',rows:[]}
 const sources=['production_daily_entries','production_entries']
 let data=null,source=null
 for(const table of sources){const found=combined(db,table);if(found){data=found;source=table;break}}
 if(!data)return {available:false,reason:'Production entries source missing',rows:[]}
 const orderIds=new Set(orders.filter(o=>o.id!=null).map(o=>String(o.id)))
 const totals=new Map(), issues={unlinked:0,unknownStage:0,missingQuantity:0}
 for(const row of data){
  const id=ORDER_KEYS.map(k=>row[k]).find(v=>v!=null&&String(v).trim())
  if(id==null||!orderIds.has(String(id))){issues.unlinked++;continue}
  const stage=stageOf(row)
  if(!stage){issues.unknownStage++;continue}
  const qty=numeric(row,QTY_KEYS)
  if(qty==null){issues.missingQuantity++;continue}
  const key=String(id)
  if(!totals.has(key))totals.set(key,{})
  const stages=totals.get(key)
  stages[stage]=(stages[stage]||0)+qty
 }
 const rows=orders.filter(o=>o.id!=null).map(order=>{
  const id=String(order.id),ordered=numeric(order,['quantity','total_quantity','total_qty','order_quantity','qty'])
  const stageTotals=totals.get(id)||{}
  const stageValues=Object.fromEntries(STAGES.map(stage=>[stage,stageTotals[stage]??null]))
  const balances=Object.fromEntries(STAGES.map(stage=>[stage,
    ordered==null||stageValues[stage]==null?null:ordered-stageValues[stage]]))
  return {orderId:id,orderNumber:String(order.po_number??order.order_number??order.job_number??id),
   buyer:String(order.buyer_name??order.buyer??order.customer_name??''),
   orderedQuantity:ordered,...stageValues,
   cuttingBalance:balances.cutting,sewingBalance:balances.sewing,washingBalance:balances.washing,
   finishingBalance:balances.finishing,packingBalance:balances.packing}
 })
 return {available:true,key:'production_stage_balance',title:'Order-wise department production balance',
  sourceTable:source,rows,issues,stages:STAGES,localRecords:readLocalRows(db,'orders').length+readLocalRows(db,'production_daily_entries').length,
  note:'Each stage is totaled independently. Negative balances flag output above ordered quantity. Missing stage quantities remain blank; stages are never added together.'}
}
module.exports={STAGES,stageOf,productionBalance}
