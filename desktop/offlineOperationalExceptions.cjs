'use strict'
// Order-level operational exceptions. All figures are sourced from imported OMS rows.
// A missing or ambiguous linkage is never treated as a confirmed balance.
const {read,numeric}=require('./offlineCrossModuleReports.cjs')
const ORDER_KEYS=['order_id','orderId','oms_order_id']
const MAX_ORDERS=20000
function linked(db,table,ids) {
 const rows=read(db,table)
 if(!rows)return null
 const groups=new Map(),unlinked=[]
 for(const row of rows){
  const id=ORDER_KEYS.map(k=>row[k]).find(v=>v!=null&&String(v).trim())
  if(id==null||!ids.has(String(id))){unlinked.push(row);continue}
  const key=String(id)
  if(!groups.has(key))groups.set(key,[])
  groups.get(key).push(row)
 }
 return {groups,unlinked:unlinked.length}
}
function summarize(rows,quantityKeys,statusKeys){
 if(!rows.length)return {records:0,quantity:null,quantityRecords:0,statuses:{}}
 let quantity=0,quantityRecords=0
 const statuses={}
 for(const row of rows){
  const q=numeric(row,quantityKeys)
  if(q!=null){quantity+=q;quantityRecords++}
  const value=statusKeys.map(k=>row[k]).find(v=>v!=null&&String(v).trim())
  const status=value==null?'Unspecified':String(value).slice(0,80)
  statuses[status]=(statuses[status]||0)+1
 }
 return {records:rows.length,quantity:quantityRecords?quantity:null,quantityRecords,statuses}
}
const SPECS=Object.freeze({
 purchasing_requirements:{title:'Order purchasing requirements and gaps',sources:['bom_items','purchase_orders'],qty:['required_quantity','required_qty','quantity','qty'],ordered:['quantity','total_quantity','ordered_quantity','qty']},
 shipment_readiness:{title:'Order shipment readiness',sources:['finishing_packs','shipments'],qty:['packed_quantity','packed_qty','quantity','qty'],ordered:['shipped_quantity','shipped_qty','quantity','qty']},
 pending_approvals:{title:'Order approval exceptions',sources:['samples','approvals'],qty:[],ordered:[]}
})
function operationalExceptions(db,key){
 const spec=SPECS[key]
 if(!spec)throw Error('Unknown operational exception report')
 const orders=read(db,'orders')
 if(!orders)return {key,title:spec.title,available:false,reason:'Orders source missing',rows:[]}
 if(orders.length>MAX_ORDERS)throw Error('Too many orders for operational report')
 const ids=new Set(orders.filter(o=>o.id!=null).map(o=>String(o.id)))
 const first=linked(db,spec.sources[0],ids),second=linked(db,spec.sources[1],ids)
 if(!first&&!second)return {key,title:spec.title,available:false,reason:'Neither required operational source is available',rows:[]}
 const rows=orders.filter(o=>o.id!=null).map(order=>{
  const id=String(order.id)
  const a=first?summarize(first.groups.get(id)||[],spec.qty,['status','approval_status','sample_status']):null
  const b=second?summarize(second.groups.get(id)||[],spec.ordered,['status','po_status','shipment_status','approval_status']):null
  const ordered=numeric(order,['quantity','total_quantity','order_quantity','qty'])
  let gap=null,warning=''
  if(key==='purchasing_requirements'){
   // BOM required quantities and PO quantities are only comparable when the same
   // unit is explicitly recorded; different fabrics/trims must not be aggregated.
   warning='BOM and purchase quantities may use different units/materials; compare by material before calculating shortages.'
  } else if(key==='shipment_readiness'){
   gap=ordered!=null&&a?.quantity!=null?ordered-a.quantity:null
   warning='Packing gap is indicative only. Confirm packed units, shipment allocations, QC and booking before dispatch.'
  } else {
   const pending=[...(a?Object.entries(a.statuses):[]),...(b?Object.entries(b.statuses):[])]
    .filter(([status])=>/pending|rejected|hold|await|not approved|open/i.test(status))
    .reduce((sum,[,count])=>sum+count,0)
   gap=pending
   warning='Pending count includes only explicit pending/rejected/hold statuses in linked source records.'
  }
  return {orderId:id,orderNumber:String(order.po_number??order.order_number??order.job_number??id),
   buyer:String(order.buyer_name??order.buyer??order.customer_name??''),
   orderQuantity:ordered,sourceA:spec.sources[0],sourceB:spec.sources[1],
   firstRecords:a?.records??null,firstQuantity:a?.quantity??null,
   secondRecords:b?.records??null,secondQuantity:b?.quantity??null,
   firstStatuses:a?.statuses??{},secondStatuses:b?.statuses??{},
   gap,warning}
 })
 return {key,title:spec.title,available:true,rows,
  sources:[first?spec.sources[0]:null,second?spec.sources[1]:null].filter(Boolean),
  unlinked:{[spec.sources[0]]:first?.unlinked??null,[spec.sources[1]]:second?.unlinked??null},
  note:rows[0]?.warning||'No linked order records'}
}
module.exports={SPECS,operationalExceptions,summarize}
