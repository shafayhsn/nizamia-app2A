'use strict'

const direct=["size_groups", "order_queues", "finishing", "samples", "bom_items", "fitting", "fitting_blocks", "washing", "embellishments", "order_processes", "work_orders", "purchase_orders"]
const children=[["size_group_colors", "size_group_id", "size_groups"], ["size_group_breakdown", "size_group_id", "size_groups"], ["finishing_packs", "finishing_id", "finishing"], ["finishing_color_packing", "finishing_id", "finishing"], ["sample_comments", "sample_id", "samples"], ["sample_logs", "sample_id", "samples"], ["work_order_items", "wo_id", "work_orders"], ["work_order_changelog", "wo_id", "work_orders"], ["purchase_order_changelog", "po_id", "purchase_orders"]]
const protectedTables=["production_daily_entries", "shipping_booking_lines", "shipment_lines", "production_batch_orders", "pp_meetings", "testing_requirements"]
const tables=['orders',...direct,...children.map(([table])=>table),'purchase_order_items',...protectedTables,'parcels']

function collect(read,ids){
 const selected=new Set(ids), result={}
 result.orders=read('orders').filter(row=>selected.has(row.id))
 for(const table of direct)result[table]=read(table).filter(row=>selected.has(row.order_id))
 const idSet=table=>new Set(result[table].map(row=>row.id))
 for(const [table,field,parent] of children){
  const parentIds=idSet(parent)
  result[table]=read(table).filter(row=>parentIds.has(row[field]))
 }
 const purchaseIds=idSet('purchase_orders'), queueIds=idSet('order_queues'),sampleIds=idSet('samples')
 result.purchase_order_items=read('purchase_order_items').filter(row=>
  purchaseIds.has(row.po_id)||(row.source_type==='queue'&&queueIds.has(row.source_id)))
 const protectedRecords=protectedTables.some(table=>read(table).some(row=>selected.has(row.order_id)))||
  read('shipment_lines').some(row=>queueIds.has(row.queue_id))||
  read('shipping_booking_lines').some(row=>queueIds.has(row.queue_id))||
  read('parcels').some(row=>Array.isArray(row.items)&&row.items.some(item=>sampleIds.has(item?.sampleId)))||
  read('samples').some(row=>!selected.has(row.order_id)&&(sampleIds.has(row.root_sample_id)||sampleIds.has(row.parent_sample_id)))||
  ['sample_comments','sample_logs'].some(table=>read(table).some(row=>sampleIds.has(row.root_sample_id)&&!sampleIds.has(row.sample_id)))
 return {rows:result,protectedRecords}
}

module.exports={collect,tables}
