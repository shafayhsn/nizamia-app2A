'use strict'
const {createHash}=require('node:crypto')
const {inspectPendingMutations,updateMutationIntent}=require('./offlineMutationPlan.cjs')
const {findQueuedRecords}=require('./offlineMutationOutbox.cjs')
const {rebaseShipmentStatus}=require('./shipmentStatusMutation.cjs')
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

function reviewLegacyMutations(db){
 const {mutations,blocked}=inspectPendingMutations(db)
 const queued=findQueuedRecords(db)
 const staged=[],linked=new Set(),skipped=[...blocked]
 const pending=mutations.filter(intent=>!queued.has(intent.table+':'+intent.id))
 for(const intent of pending){
  const {table,operation,id,fields,expected,changes,editedAt}=intent
  if(operation==='create'&&table==='production_daily_entries'&&
     [fields.order_id,fields.size_group_id,fields.color_id].every(value=>uuid.test(value||''))){
   staged.push(intent)
  }else if(operation==='update'&&uuid.test(id)&&table==='orders'&&Object.keys(changes).join()==='status'&&
           ['Active','Draft','Booked','Shipped','Cancelled'].includes(changes.status)){
   staged.push(intent)
  }else if(operation==='update'&&uuid.test(id)&&table==='shipments'&&Object.keys(changes).join()==='notes'){
   const notes=rebaseShipmentStatus(expected.notes,changes.notes)
   if(notes)staged.push(updateMutationIntent(table,id,{notes},expected,editedAt))
   else skipped.push({table,id,reason:'shipment-status-needs-review'})
  }else if(operation==='update'&&uuid.test(id)&&table==='samples'&&Object.keys(changes).join()==='stage'&&
           ['Not Started','Pattern','Cutting','Stitching','Washing','Finishing','Ready'].includes(changes.stage)){
   const history=pending.filter(item=>item.table==='sample_comments'&&item.operation==='create'&&
    item.fields.sample_id===id&&item.fields.comment_type==='Stage'&&item.fields.is_internal===true&&
    item.fields.comment_text===(expected.stage||'Not Started')+' → '+changes.stage)
   if(history.length!==1){skipped.push({table,id,reason:'sample-history-needs-review'});continue}
   linked.add(history[0].id)
   staged.push(updateMutationIntent(table,id,changes,expected,editedAt,{
    id:history[0].id,editedAt:history[0].editedAt
   }))
  }else if(table!=='sample_comments')skipped.push({table,id,reason:'upload-not-supported'})
 }
 for(const intent of pending)
  if(intent.table==='sample_comments'&&!linked.has(intent.id))
   skipped.push({table:intent.table,id:intent.id,reason:'upload-not-supported'})
 const approval=createHash('sha256').update(JSON.stringify(staged.map(intent=>intent.fingerprint))).digest('hex')
 return {staged,linked:linked.size,skipped,approval}
}

module.exports={reviewLegacyMutations}
