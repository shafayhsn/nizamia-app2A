'use strict'
// Server-side conditional apply engine. Adapter methods MUST execute inside a
// real database transaction with row locks / equivalent serializable semantics.
// This module does not connect to production or accept client-side authority.
const {validateDraft,operationId}=require('../desktop/offlineSyncPlanner.cjs')
const TABLES=new Set(['orders','production_daily_entries'])
function createOfflineSyncApply({authenticate,authorize,transaction}){
 if(typeof authenticate!=='function'||typeof authorize!=='function'||typeof transaction!=='function')
  throw Error('Trusted authentication, authorization and transactional storage required')
 return async function apply(request){
  if(!request||!Array.isArray(request.operations)||request.operations.length<1||request.operations.length>100)
   return {status:400,body:{error:'Invalid sync batch'}}
  let session
  try{session=await authenticate(request)}catch{return {status:401,body:{error:'Authentication required'}}}
  if(!session||session.authenticated!==true||typeof session.identity!=='string'||!session.identity)
   return {status:401,body:{error:'Authentication required'}}
  const seen=new Set(),validated=[]
  try{
   for(const item of request.operations){
    const draft=item?.draft
    validateDraft(draft)
    if(!TABLES.has(draft.table)||typeof item.operationId!=='string'||item.operationId!==operationId(draft)||
       typeof item.identity!=='string'||item.identity!==session.identity||seen.has(item.operationId))
     throw Error('Invalid sync operation')
    seen.add(item.operationId)
    validated.push({draft,operationId:item.operationId})
   }
  }catch{return {status:400,body:{error:'Invalid sync operation'}}}
  const results=[]
  for(const {draft,operationId:id} of validated){
   let permitted=false
   try{permitted=await authorize({session,identity:session.identity,table:draft.table,
    fields:Object.keys(draft.changes),recordId:draft.recordId,purpose:'offline-sync'})===true}catch{}
   if(!permitted){results.push({draftId:draft.draftId,decision:'blocked',reason:'unauthorized'});continue}
   try{
    // tx.once(id, fn) must atomically deduplicate idempotency keys and commit
    // the conditional record update. No check-then-write race is permitted.
    const outcome=await transaction(async tx=>{
     if(typeof tx.once!=='function'||typeof tx.readForUpdate!=='function'||typeof tx.updateConditional!=='function')
      throw Error('Atomic transaction adapter required')
     return tx.once(id,async()=>{
      const current=await tx.readForUpdate(draft.table,draft.recordId)
      if(!current||String(current.id)!==draft.recordId)
       return {decision:'conflict',reason:'record-missing'}
      for(const [field,before] of Object.entries(draft.before)){
       if((current[field]??null)!==before)
        return {decision:'conflict',reason:'cloud-field-changed',field}
      }
      const changed=await tx.updateConditional(draft.table,draft.recordId,draft.before,draft.changes)
      if(changed!==1)return {decision:'conflict',reason:'conditional-write-failed'}
      return {decision:'applied'}
     })
    })
    if(!outcome||!['applied','conflict','already-applied'].includes(outcome.decision))
     throw Error('Invalid transaction outcome')
    results.push({draftId:draft.draftId,...outcome})
   }catch{
    results.push({draftId:draft.draftId,decision:'error',reason:'transaction-failed'})
   }
  }
  return {status:200,body:{results}}
 }
}
module.exports={createOfflineSyncApply}
