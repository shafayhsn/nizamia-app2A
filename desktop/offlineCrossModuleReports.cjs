'use strict'
// Cross-module operational reports calculated from a single imported OMS snapshot.
// These reports are observational, not sync instructions or write operations.
const REPORTS=Object.freeze([
 {key:'order_production_progress',title:'Order-wise production progress',source:'production_daily_entries'},
 {key:'order_purchasing_status',title:'Order-wise purchasing status',source:'purchase_orders'},
 {key:'order_shipping_status',title:'Order-wise shipping status',source:'shipments'}
])
const MAX_ROWS=100000
const ORDER_KEYS=['order_id','orderId','oms_order_id']
function read(db,table) {
 const exists=db.exec('SELECT 1 FROM snapshot_manifest WHERE table_name = ?',[table])
 if(!exists.length)return null
 const stmt=db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index')
 const rows=[]
 try {stmt.bind([table]);while(stmt.step()){if(rows.length>=MAX_ROWS)throw Error('Source exceeds report safety limit');rows.push(JSON.parse(stmt.get()[0]))}}
 finally{stmt.free()}
 return rows
}
function numeric(row,keys) {
 for(const key of keys){if(row[key]!=null && row[key]!==''){const n=Number(row[key]);if(Number.isFinite(n)&&n>=0)return n}}
 return null
}
function crossModuleReport(db,key) {
 const def=REPORTS.find(r=>r.key===key)
 if(!def)throw Error('Unknown cross-module report')
 const orders=read(db,'orders')
 if(!orders)return {key,title:def.title,available:false,reason:'Orders not included in imported snapshot',rows:[]}
 let sources=read(db,def.source)
 let sourceTable=def.source
 if(!sources && key==='order_shipping_status'){sources=read(db,'bookings');sourceTable='bookings'}
 if(!sources)return {key,title:def.title,available:false,reason:def.source+' not included in imported snapshot',rows:[]}
 const orderIndex=new Map()
 for(const order of orders){if(order.id!=null)orderIndex.set(String(order.id),order)}
 const grouped=new Map()
 let unmatched=0,matched=0
 for(const row of sources) {
  const id=ORDER_KEYS.map(k=>row[k]).find(v=>v!=null&&String(v).trim())
  if(id==null||!orderIndex.has(String(id))){unmatched++;continue}
  matched++
  const keyId=String(id)
  let group=grouped.get(keyId)
  if(!group){group={orderId:keyId,records:0,quantity:0,quantityRecords:0,statuses:{}};grouped.set(keyId,group)}
  group.records++
  const status=String(row.status??row.production_status??row.po_status??row.shipment_status??'Unspecified').slice(0,80)
  group.statuses[status]=(group.statuses[status]||0)+1
  const qty=numeric(row,key==='order_production_progress'
    ? ['quantity','produced_qty','production_qty','output_qty','qty','pieces']
    : ['quantity','total_quantity','shipped_quantity','qty'])
  if(qty!=null){group.quantity+=qty;group.quantityRecords++}
 }
 const rows=orders.filter(order=>order.id!=null).map(order=>{
  const id=String(order.id),group=grouped.get(id)
  const ordered=numeric(order,['quantity','total_quantity','order_quantity','qty'])
  const produced=group?.quantityRecords ? group.quantity : null
  const progress=key==='order_production_progress'&&ordered!=null&&ordered>0&&produced!=null
   ? Math.round(produced/ordered*10000)/100 : null
  return {orderId:id,orderNumber:String(order.po_number??order.order_number??order.job_number??order.id).slice(0,120),
   buyer:String(order.buyer_name??order.buyer??order.customer_name??'').slice(0,120),
   orderedQuantity:ordered,linkedRecords:group?.records||0,linkedQuantity:produced,
   progressPercent:progress,statuses:group?.statuses||{}}
 })
 return {key,title:def.title,available:true,sourceTable,matched,unmatched,
  note:'Progress compares available linked production quantities against ordered quantity; it is not a stage-adjusted completion metric. Unlinked records are excluded.',
  rows}
}
module.exports={REPORTS,crossModuleReport}
