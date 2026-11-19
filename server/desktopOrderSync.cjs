'use strict'
const {createOfflineSyncApply}=require('./offlineSyncApply.cjs')
const {createOfflineSyncHttpHandler}=require('./offlineSyncHttpHandler.cjs')
const {verifyDesktopSyncToken}=require('./desktopSyncToken.cjs')
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

function createDesktopOrderSync({db,key,actorDb=()=>db}){
 async function authenticate({headers}){
  const header=headers?.authorization
  if(typeof header!=='string'||!header.startsWith('Bearer '))return null
  const claim=verifyDesktopSyncToken(key,header.slice(7))
  if(!claim||!uuid.test(claim.userId))return null
  return {authenticated:true,identity:claim.userId}
 }
 const apply=createOfflineSyncApply({
  authenticate,
  authorize:async({table,fields,recordId})=>table==='orders'&&fields.length===1&&fields[0]==='notes'&&uuid.test(recordId),
  async applyOperation({identity,draft,operationId}){
   if(Object.keys(draft.before).length!==1)return {decision:'conflict',reason:'invalid-base-fields'}
   const {data,error}=await actorDb(identity).rpc('desktop_apply_order_note',{
    actor:identity,operation:operationId,order_id:draft.recordId,
    previous_note:draft.before.notes,new_note:draft.changes.notes
   })
   if(error)throw Error('Order note synchronization unavailable')
   if(data==='unauthorized')return {decision:'blocked',reason:'unauthorized'}
   if(data==='conflict')return {decision:'conflict',reason:'cloud-note-changed-or-record-missing'}
   return {decision:data}
  }
 })
 return createOfflineSyncHttpHandler({apply})
}
module.exports={createDesktopOrderSync}
