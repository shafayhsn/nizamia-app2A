'use strict'
// Fail-closed reconciliation plan for the offline draft queue. Only the
// authenticated journal owner may persist these decisions. Applied drafts
// must be archived, never silently deleted or retried.
function reconcileSyncResults(drafts,results){
 if(!Array.isArray(drafts)||!Array.isArray(results)||drafts.length!==results.length||
    drafts.length>100)throw Error('Invalid synchronization reconciliation')
 const source=new Map()
 for(const draft of drafts){
  if(!draft||typeof draft.draftId!=='string'||source.has(draft.draftId))
   throw Error('Duplicate or invalid queued draft')
  source.set(draft.draftId,draft)
 }
 const seen=new Set()
 const actions=results.map(result=>{
  if(!result||!source.has(result.draftId)||seen.has(result.draftId))
   throw Error('Untrusted synchronization result')
  seen.add(result.draftId)
  const decision=result.decision
  if(decision==='applied'||decision==='already-applied')
   return Object.freeze({draftId:result.draftId,action:'archive-applied'})
  if(decision==='conflict')
   return Object.freeze({draftId:result.draftId,action:'mark-conflict',reason:result.reason||'cloud-conflict'})
  if(decision==='blocked')
   return Object.freeze({draftId:result.draftId,action:'retain-locked',reason:'authorization-denied'})
  if(decision==='error')
   return Object.freeze({draftId:result.draftId,action:'retain-retryable',reason:'server-error'})
  throw Error('Invalid synchronization decision')
 })
 return Object.freeze(actions)
}
module.exports={reconcileSyncResults}
