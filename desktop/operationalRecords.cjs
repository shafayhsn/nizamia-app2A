'use strict'
const {randomUUID}=require('node:crypto')
const {isDeepStrictEqual:equal}=require('node:util')
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const configs={
 booking:['shipping_bookings','shipping_booking_lines','booking_id','booking_no','booking_date','booking_no booking_date etd eta notes status'],
 shipment:['shipments','shipment_lines','shipment_id','shipment_no','shipment_date','shipment_no shipment_date container_no booking_ref gate_pass_no delivery_challan_no gd_no hbl_hawb_no fi_no lc_no tracking_url etd eta notes status'],
}
const keyOf=(table,row)=>table==='production_batch_orders'?row.order_id:row.id
const source=line=>line.queue_id||line.order_id
const byId=(a,b)=>a.id.localeCompare(b.id)
const select=(row,fields)=>Object.fromEntries(fields.map(key=>[key,row[key]??null]))
function build(input,rows,stamp){
 const {kind,action,id}=input
 if(!['save','delete'].includes(action)||id&&!uuid.test(id)||action==='delete'&&!id)throw Error('Invalid operation.')
 const edits=[],dependencies=[],target=id||randomUUID()
 const write=(table,before,after)=>edits.push({table,id:keyOf(table,after||before),before:before||null,after:after||null})
 const find=(table,id)=>rows(table).find(row=>keyOf(table,row)===id)
 const result=(table,payload,expected,resultId=target)=>({table,payload,expected,target:resultId,edits,dependencies})
 if(kind==='batch'){
  const {orderIds,name,batchId}=input
  if(action!=='save'||!Array.isArray(orderIds)||!orderIds.length||orderIds.length>200||
    new Set(orderIds).size!==orderIds.length||orderIds.some(id=>!uuid.test(id)||!find('orders',id)))
   throw Error('Select synchronized orders.')
  if(name!=null&&(typeof name!=='string'||!name.trim()||name.trim().length>120||batchId)||
    batchId&&!find('production_batches',batchId))throw Error('Choose a valid production batch.')
  const batch=name?{id:target,name:name.trim()}:null
  const selected=batch?.id||batchId||null
  if(batch)write('production_batches',null,batch)
  if(batchId)dependencies.push(['production_batches',batchId])
  const orders=orderIds.map(order_id=>{
   const before=find('production_batch_orders',order_id),previous=before?.batch_id||null
   if(previous!==selected)write('production_batch_orders',before,selected?{order_id,batch_id:selected,assigned_at:stamp}:null)
   return {order_id,previous}
  })
  return result('production_batches',{batch,batchId:selected,orders},{})
 }
 if(kind==='settlement'){
  const {shipmentId,payment}=input
  if(action!=='save'||!find('shipments',shipmentId)||!payment||typeof payment!=='object'||Array.isArray(payment))
   throw Error('Choose a shipment and valid settlement.')
  const list=rows('payment_settlements').filter(row=>row.shipment_id===shipmentId)
  if(list.length>1)throw Error('Review duplicate settlements before saving.')
  const [before]=list
  const next={id:before?.id||target,shipment_id:shipmentId,payload:payment}
  write('payment_settlements',before,{...before,...next,updated_at:stamp})
  dependencies.push(['shipments',shipmentId])
  return result('payment_settlements',{payment:next},{payment:before?select(before,Object.keys(next)):null,updated_at:before?.updated_at||null},next.id)
 }
 const config=configs[kind]
 if(!config)throw Error('Unsupported production or shipping operation.')
 const [table,lineTable,parent,number,date,allowed]=config
 const fields=allowed.split(' ')
 const before=id?find(table,id):null
 if(id&&!before)throw Error('Refresh the synchronized document first.')
 if(before&&input.original&&Object.entries(input.original).some(([key,value])=>fields.includes(key)&&!equal(before[key]??null,value??null)))
  throw Error('This document changed. Reopen it before saving.')
 const prior=id?rows(lineTable).filter(line=>line[parent]===target).sort(byId):[]
 if(before&&input.originalLines){
  const brief=line=>select(line,['id','order_id','queue_id',kind==='booking'?'qty':'shipped_qty'])
  if(!equal(prior.map(brief),input.originalLines.map(brief).sort(byId)))throw Error('The document lines changed. Reopen it before saving.')
 }
 const allocations=rows('shipping_booking_shipments')
 const linked=allocations.filter(row=>kind==='booking'?prior.some(line=>row.booking_line_id===line.id):row.shipment_id===target).sort(byId)
 const payments=kind==='shipment'?rows('payment_settlements').filter(row=>row.shipment_id===target).sort(byId):[]
 const expected={header:null,lines:prior,allocations:linked}
 if(action==='delete'){
  if(kind==='booking'&&linked.length)throw Error('Resolve the related shipments before deleting this booking.')
  for(const line of prior)write(lineTable,line,null)
  if(kind==='shipment'){
   for(const row of linked)write('shipping_booking_shipments',row,null)
   for(const row of payments)write('payment_settlements',row,null)
  }
  write(table,before,null)
  return result(table,{}, {...expected,header:before,payments})
 }
 const proposed=input.header||{}
 const header=select(proposed,fields.filter(field=>Object.hasOwn(proposed,field)))
 for(const key of [date,'etd','eta'])if(header[key]==='')header[key]=null
 if(typeof header[number]!=='string'||!header[number].trim()||!/^\d{4}-\d{2}-\d{2}$/.test(header[date]||''))
  throw Error('Enter a document number and date.')
 header[number]=header[number].trim()
 if(rows(table).some(row=>row.id!==target&&String(row[number]).toLowerCase()===header[number].toLowerCase()))
  throw Error('This document number already exists.')
 const mode=kind==='booking'?'booking':input.mode
 if(kind==='shipment'&&(!['booked','manual','queued','historical'].includes(mode)||!['Open','Closed','Cancelled'].includes(header.status)))
  throw Error('Choose a shipment workflow and status.')
 if(mode==='booked'&&before||mode==='historical'&&prior.length)throw Error('Choose the workflow used to create this shipment.')
 const raw=input.lines||[]
 if(!Array.isArray(raw)||raw.length>300||Boolean(raw.length)===(mode==='historical'))throw Error('Choose valid document lines.')
 const lines=[],close=[],nextAllocations=[],seen=new Set()
 for(const line of raw){
  const order=find('orders',line.order_id),queue=line.queue_id&&find('order_queues',line.queue_id)
  const qty=Number(kind==='booking'?line.qty:line.shipped_qty),reference=mode==='booked'?line.booking_line_id:source(line)
  if(!order||line.queue_id&&queue?.order_id!==order.id||mode==='queued'&&!queue||seen.has(reference)||!Number.isFinite(qty)||qty<=0)
   throw Error('A selected line has an invalid order, queue or quantity.')
  seen.add(reference)
  const old=mode==='booked'?null:prior.find(row=>source(row)===reference)
  const next={id:old?.id||randomUUID(),[parent]:target,order_id:order.id,queue_id:queue?.id||null,
   [kind==='booking'?'qty':'shipped_qty']:qty}
  if(kind==='booking'){
   const allocated=linked.filter(row=>row.booking_line_id===next.id).reduce((total,row)=>total+Number(row.qty),0)
   const reserved=rows(lineTable).filter(row=>row.booking_id!==target&&source(row)===reference&&find(table,row.booking_id)?.status!=='Cancelled')
    .reduce((total,row)=>total+Number(row.qty),0)
   if(qty<allocated||header.status==='Cancelled'&&allocated||header.status!=='Cancelled'&&qty+reserved>Number(queue?.qty??order.total_qty))
    throw Error('Booking quantity exceeds the available balance.')
  }else{
   const shipped=rows(lineTable).filter(row=>row.shipment_id!==target&&(queue?row.queue_id===queue.id:row.order_id===order.id))
    .reduce((total,row)=>total+Number(row.shipped_qty),0)
   if(qty+shipped>Number(queue?.qty??order.total_qty)&&(mode!=='queued'||!line.close_queue||!String(line.close_reason||'').trim()))
    throw Error('Shipment quantity exceeds the available balance.')
   if(mode==='booked'){
    const booking=find('shipping_booking_lines',line.booking_line_id)
    const allocated=allocations.filter(row=>row.booking_line_id===line.booking_line_id).reduce((total,row)=>total+Number(row.qty),0)
    if(!booking||booking.order_id!==order.id||booking.queue_id!==next.queue_id||
      find('shipping_bookings',booking.booking_id)?.status==='Cancelled'||qty+allocated>Number(booking.qty))
     throw Error('Shipment quantity exceeds the booking balance.')
    dependencies.push(['shipping_bookings',booking.booking_id])
    const allocation={id:randomUUID(),shipment_id:target,booking_line_id:booking.id,qty}
    nextAllocations.push(allocation)
    write('shipping_booking_shipments',null,allocation)
   }
   if(mode==='queued'&&line.close_queue){
    close.push({id:queue.id,previous:queue.status,reason:String(line.close_reason||'')})
    if(queue.status!=='Completed')write('order_queues',queue,{...queue,status:'Completed'})
   }
  }
  lines.push(next)
  write(lineTable,old,{...old,...next})
 }
 for(const old of prior.filter(row=>!lines.some(next=>next.id===row.id))){
  if(kind==='booking'&&linked.some(row=>row.booking_line_id===old.id))throw Error('A removed booking line has recorded shipments.')
  write(lineTable,old,null)
 }
 let payment
 if(mode==='historical'&&input.payment){
  if(before||typeof input.payment!=='object'||Array.isArray(input.payment))throw Error('Use Payments to edit a saved settlement.')
  payment={id:randomUUID(),shipment_id:target,payload:input.payment}
  write('payment_settlements',null,{...payment,updated_at:stamp})
 }
 write(table,before,{...before,...header,id:target,created_at:before?.created_at||stamp})
 return result(table,{header,lines,mode,allocations:nextAllocations,close,...(payment?{payment}:{})},
  {...expected,header:before?select(before,Object.keys(header)):null})
}
module.exports={build,keyOf}
