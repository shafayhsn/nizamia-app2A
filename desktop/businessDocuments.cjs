'use strict'
const {randomUUID}=require('node:crypto')
const types=new Set(['costing','costingAssignment','proforma','meeting','trimPackage'])
const readableTables=new Set(['costing_sheets','proforma_invoices','bom_presets','bom_preset_items'])
function buildDocument(input,rows,stamp,owner){
 const {kind,action}=input
 const table={costing:'costing_sheets',costingAssignment:'costing_sheets',proforma:'proforma_invoices',meeting:'pp_meetings',trimPackage:'bom_presets'}[kind]
 const target=input.id||randomUUID(),before=rows(table).find(r=>r.id===target)||null
 if(input.id&&!before)throw Error('Refresh and reopen this document.')
 const edits=[],dependencies=[]
 const edit=(name,old,next,ignore=[])=>edits.push({table:name,id:(next||old).id,before:old,after:next,ignore})
 let expected={before},payload={}
 if(kind==='costing'){
  const d=input.document
  if(!['woven','knits'].includes(d?.type)||!d.customer?.trim()||before&&before.version!==input.expected_version)throw Error('Enter a customer and reopen the current costing version.')
  payload={document:d,buyer_id:input.buyer_id||null}
  edit(table,before,{...before,id:target,type:before?.type||d.type,style:d.style||'',customer:d.customer.trim(),buyer_id:payload.buyer_id,document:d,
   reference:before?.reference||'Pending sync',version:(before?.version||0)+1,updated_at:stamp},['reference'])
 }else if(kind==='costingAssignment'){
  const ids=input.ids,batch=input.batch_id||null
  if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length||batch&&!rows('costing_batches').some(r=>r.id===batch))throw Error('Choose valid costings and a batch.')
  expected={members:ids.map(id=>{
   const row=rows(table).find(r=>r.id===id)
   if(!row)throw Error('Refresh the selected costings.')
   edit(table,row,{...row,batch_id:batch})
   return {id,batch_id:row.batch_id??null}
  })}
  if(batch)dependencies.push(['costing_batches',batch])
  payload={batch_id:batch}
 }else if(kind==='proforma'){
  if(before&&before.revision!==input.revision)throw Error('Reopen the latest invoice revision.')
  const next={...before,id:target,revision:(before?.revision||0)+1,updated_by:owner,updated_at:stamp}
  if(input.status){
   if(!(before?.status==='draft'&&input.status==='issued'||before?.status==='issued'&&['accepted','cancelled'].includes(input.status)))throw Error('Invalid invoice transition.')
   if(input.status==='accepted'&&(!input.emailFrom?.trim()||!input.emailDate||!input.emailReference?.trim()))throw Error('Enter acceptance details.')
   Object.assign(next,{status:input.status},input.status==='accepted'?{acceptance_email_from:input.emailFrom,acceptance_email_date:input.emailDate,acceptance_email_reference:input.emailReference}:{})
   payload={status:input.status,emailFrom:input.emailFrom,emailDate:input.emailDate,emailReference:input.emailReference}
  }else{
   const snap=input.snapshot
   if(before&&before.status!=='draft'||!snap?.buyer?.id||!Array.isArray(snap.lines)||!snap.lines.length||snap.lines.length>500||!snap.form?.terms||!snap.form?.shipmentDate||!snap.form?.paymentTerms||
    snap.lines.some(l=>!Number.isFinite(Number(l.total_qty))||Number(l.total_qty)<=0||!Number.isFinite(Number(l.total_value_usd))||Number(l.total_value_usd)<0))throw Error('Check the draft invoice and its quantities and terms.')
   payload={snapshot:snap}
   Object.assign(next,{snapshot:snap,buyer_id:snap.buyer.id,status:'draft',pi_number:before?.pi_number||'Pending sync',created_by:before?.created_by||owner})
  }
  edit(table,before,next,before?[]:['pi_number','snapshot'])
 }else if(kind==='meeting'){
  if(action==='delete'){
   if(!before||before.status!=='Draft'||before.attachment_path||before.meeting_date||before.decision||before.fit_approved!=null||before.outstanding_actions?.trim()||
    Object.values(before.technical_checks||{}).some(Boolean)||Object.values(before.department_notes||{}).some(n=>Object.values(n||{}).some(v=>String(v||'').trim())))throw Error('Only an empty draft meeting can be removed.')
   edit(table,before,null)
  }else{
   if(before||!rows('orders').some(r=>r.id===input.orderId))throw Error('Select a synchronized order.')
   payload={order_id:input.orderId}
   edit(table,null,{id:target,order_id:input.orderId,ppm_number:'Pending sync',status:'Draft',created_by:owner,created_at:stamp,fit_approved:null},['ppm_number'])
  }
 }else{
  const prior=rows('bom_preset_items').filter(r=>r.preset_id===target).sort((a,b)=>a.id.localeCompare(b.id))
  expected.lines=prior
  if(action==='delete'){
   if(!before)throw Error('Choose a saved trim package.')
   for(const row of prior)edit('bom_preset_items',row,null)
   edit(table,before,null)
  }else{
   const {buyer_id,name,items}=input
   if(!name?.trim()||!rows('buyers').some(r=>r.id===buyer_id)||!Array.isArray(items)||!items.length||items.length>500||new Set(items).size!==items.length)throw Error('Choose a buyer, package name and trims.')
   const lines=items.map(id=>{
    if(!rows('library_items').some(r=>r.id===id&&['Packing Trim','Stitching Trim'].includes(r.category)))throw Error('Refresh the trim list.')
    dependencies.push(['library_items',id])
    return prior.find(r=>r.library_item_id===id)||{id:randomUUID(),preset_id:target,library_item_id:id}
   })
   edit(table,before,{...before,id:target,name:name.trim(),buyer_id})
   for(const r of prior)if(!lines.includes(r))edit('bom_preset_items',r,null)
   for(const r of lines)if(!prior.includes(r))edit('bom_preset_items',null,r)
   payload={name:name.trim(),buyer_id,lines:lines.map(({id,library_item_id})=>({id,library_item_id}))}
  }
 }
 return {table,target,edits,dependencies,expected,payload}
}
module.exports={types,readableTables,buildDocument}
