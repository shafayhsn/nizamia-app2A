'use strict'
const {isOrderDetailsPatch,isOrderJobPatch}=require('../desktop/orderDetailsMutation.cjs')
const {verifyDesktopSyncToken}=require('./desktopSyncToken.cjs')
const {isShipmentStatusChange}=require('../desktop/shipmentStatusMutation.cjs')
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
const productionFields=['order_id','size_group_id','color_id','department','movement','production_date','production_at','quantity']

function createDesktopMutationHttp({db,key}){
 return async function handle({method,headers,body}){
  const header=headers?.authorization
  const claim=typeof header==='string'&&header.startsWith('Bearer ')&&verifyDesktopSyncToken(key,header.slice(7))
  if(!claim||!uuid.test(claim.userId))return {status:401,body:{error:'Desktop sync session required'}}
  if(method!=='POST')return {status:405,body:{error:'Method not allowed'}}
  if(typeof body==='string'){
   if(Buffer.byteLength(body)>128*1024)return {status:413,body:{error:'Sync batch is too large'}}
   try{body=JSON.parse(body)}catch{return {status:400,body:{error:'Invalid sync batch'}}}
  }
  const operations=body?.operations
  if(!Array.isArray(operations)||!operations.length||operations.length>20||
     Buffer.byteLength(JSON.stringify(operations))>128*1024||
     new Set(operations.map(entry=>entry?.operationId)).size!==operations.length||
     operations.some(entry=>!uuid.test(entry?.operationId||'')))
   return {status:400,body:{error:'Invalid sync batch'}}
  const results=[]
  for(const {operationId,intent} of operations){
   let rpc,args
   if(intent?.operation==='create'&&intent.table==='production_daily_entries'&&
      intent.fields&&typeof intent.fields==='object'&&!Array.isArray(intent.fields)){
    rpc='desktop_create_production_entry'
    args={payload:Object.fromEntries(productionFields.filter(key=>Object.hasOwn(intent.fields,key)).map(key=>[key,intent.fields[key]]))}
   }else if(intent?.operation==='update'&&intent.table==='orders'&&uuid.test(intent.id||'')&&
      Object.keys(intent.changes||{}).join()==='status'&&Object.keys(intent.expected||{}).join()==='status'&&
      typeof intent.changes.status==='string'&&(intent.expected.status===null||typeof intent.expected.status==='string')){
    rpc='desktop_update_order_status'
    args={target_order:intent.id,previous_status:intent.expected.status,new_status:intent.changes.status}
   }else if(intent?.operation==='update'&&intent.table==='orders'&&uuid.test(intent.id||'')&&
      isOrderJobPatch(intent.changes)&&isOrderJobPatch(intent.expected)){
    rpc='desktop_update_order_job'
    args={target_order:intent.id,previous_fields:intent.expected,new_fields:intent.changes}
   }else if(intent?.operation==='update'&&intent.table==='orders'&&uuid.test(intent.id||'')&&
      isOrderDetailsPatch(intent.changes)&&isOrderDetailsPatch(intent.expected)&&
      Object.keys(intent.changes).sort().join()===Object.keys(intent.expected).sort().join()){
    rpc='desktop_update_order_details'
    args={target_order:intent.id,previous_fields:intent.expected,new_fields:intent.changes}
   }else if(intent?.operation==='update'&&intent.table==='purchase_orders'&&uuid.test(intent.id||'')&&
      Object.keys(intent.changes||{}).join()==='status'&&Object.keys(intent.expected||{}).join()==='status'&&
      ['draft','approved'].includes(intent.changes.status)&&(intent.expected.status===null||typeof intent.expected.status==='string')){
    rpc='desktop_update_purchase_approval'
    args={target_purchase_order:intent.id,previous_status:intent.expected.status,new_status:intent.changes.status}
   }else if(intent?.operation==='update'&&intent.table==='samples'&&uuid.test(intent.id||'')&&
      Object.keys(intent.changes||{}).join()==='stage'&&Object.keys(intent.expected||{}).join()==='stage'&&
      typeof intent.changes.stage==='string'&&(intent.expected.stage===null||typeof intent.expected.stage==='string')){
    rpc='desktop_update_sample_stage'
    args={target_sample:intent.id,previous_stage:intent.expected.stage,new_stage:intent.changes.stage}
   }else if(intent?.operation==='update'&&intent.table==='shipments'&&uuid.test(intent.id||'')&&
      Object.keys(intent.changes||{}).join()==='notes'&&Object.keys(intent.expected||{}).join()==='notes'&&
      isShipmentStatusChange(intent.expected.notes,intent.changes.notes)){
    rpc='desktop_update_shipment_status'
    args={target_shipment:intent.id,previous_notes:intent.expected.notes,next_notes:intent.changes.notes}
   }else if(intent?.operation==='update'&&intent.table==='parcels'&&/^[a-z0-9_-]{1,128}$/i.test(intent.id||'')&&
      ['Dispatched','Delivered'].includes(intent.changes?.status)&&
      typeof intent.expected?.status==='string'&&Object.hasOwn(intent.expected,'updated_at')){
    rpc='desktop_transition_parcel'
    args={target_parcel:intent.id,payload:{
     status:intent.changes.status,expected_status:intent.expected.status,
     expected_updated_at:intent.expected.updated_at,
     ...(intent.changes.status==='Delivered'?{
      delivery_date:intent.changes.delivery_date,received_by:intent.changes.received_by
     }:{})
    }}
   }else if(intent?.operation==='update'&&['purchase_orders','work_orders'].includes(intent.table)&&
      uuid.test(intent.id||'')&&typeof intent.expected?.updated_at==='string'&&Array.isArray(intent.expected.lines)&&
      Array.isArray(intent.document?.lines)&&intent.document.lines.length===intent.document.lineIds?.length&&
      Array.isArray(intent.document.lineIds)&&intent.document.lineIds.every(id=>uuid.test(id))){
    rpc='desktop_edit_purchasing_document'
    args={kind:intent.table,target:intent.id,header:intent.changes,expected:intent.expected,
     lines:intent.document.lines.map((line,index)=>({...line,id:intent.document.lineIds[index]}))}
   }else if(intent?.operation==='create'&&['purchase_orders','work_orders'].includes(intent.table)&&
      intent.fields&&typeof intent.fields==='object'&&Array.isArray(intent.document?.lines)){
    rpc='desktop_create_purchasing_document'
    args={kind:intent.table,header:intent.fields,lines:intent.document.lines}
   }else if(intent?.table==='suppliers'&&intent.operation==='create'&&intent.fields){
    rpc='desktop_save_supplier'
    args={target_supplier:null,patch:intent.fields,expected:null}
   }else if(intent?.table==='suppliers'&&intent.operation==='update'&&uuid.test(intent.id||'')&&intent.changes&&intent.expected){
    rpc='desktop_save_supplier'
    args={target_supplier:intent.id,patch:intent.changes,expected:intent.expected}
   }else if(intent?.operation==='update'&&intent.table==='orders'&&uuid.test(intent.id||'')&&
      Object.keys(intent.changes||{}).join()==='step_bom'&&intent.changes.step_bom===true&&
      Array.isArray(intent.expected?.lines)&&Array.isArray(intent.document?.lines)&&
      Array.isArray(intent.document.lineIds)&&intent.document.lines.length===intent.document.lineIds.length&&
      intent.document.lineIds.every(id=>uuid.test(id))){
    rpc='desktop_save_bom'
    args={target_order:intent.id,expected:intent.expected,
     lines:intent.document.lines.map((line,index)=>({...line,id:intent.document.lineIds[index]}))}
   }else if(intent?.operation==='update'&&intent.table==='orders'&&uuid.test(intent.id||'')&&
      intent.changes?.po_matrix?.p_order_id===intent.id&&Array.isArray(intent.changes.po_matrix.p_groups)&&
      intent.expected&&typeof intent.expected==='object'){
    rpc='desktop_save_po_matrix'
    args={target_order:intent.id,payload:intent.changes.po_matrix,expected:intent.expected}
   }else if(intent?.operation==='create'&&intent.table==='jobs'&&uuid.test(intent.fields?.buyer_id||'')&&
      Array.isArray(intent.fields.orders)&&intent.fields.orders.length>0&&intent.fields.orders.length<=500){
    rpc='desktop_create_and_assign_job'
    args={target_buyer:intent.fields.buyer_id,expected_orders:intent.fields.orders}
   }else if(intent?.operation==='create'&&intent.table==='parcels'&&intent.fields&&
      Array.isArray(intent.fields.items)&&Array.isArray(intent.fields.custom_items)){
    rpc='desktop_create_parcel'
    args={payload:intent.fields}
   }else{
    results.push({operationId,outcome:'unsupported'})
    continue
   }
   try{
    const {data,error}=await db.rpc(rpc,{actor:claim.userId,operation:operationId,...args})
    const outcome=typeof data==='object'&&data!==null?data.outcome:data
    const resourceId=rpc==='desktop_create_parcel'&&typeof data?.resourceId==='string'&&
     /^[a-z0-9_-]{1,128}$/i.test(data.resourceId)?data.resourceId:null
    const accepted=['applied','already-applied'].includes(outcome)
    const valid=!error&&['applied','already-applied','conflict','unauthorized','invalid'].includes(outcome)&&
     (rpc!=='desktop_create_parcel'||!accepted||resourceId)
    results.push({operationId,outcome:valid?outcome:'retry',...(valid&&accepted&&resourceId?{resourceId}:{})})
   }catch{results.push({operationId,outcome:'retry'})}
  }
  return {status:200,body:{results}}
 }
}
module.exports={createDesktopMutationHttp}
