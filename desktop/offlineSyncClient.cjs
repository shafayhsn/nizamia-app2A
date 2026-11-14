'use strict'
// Trusted Electron main-process transport for an authenticated sync endpoint.
// Never expose bearer tokens or accept arbitrary URLs from renderer IPC.
const {operationId,validateDraft}=require('./offlineSyncPlanner.cjs')
function createOfflineSyncClient({endpoint,fetchImpl,maxResponseBytes=65536}){
 const url=new URL(endpoint)
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    !/^\/api\/offline-sync\/?$/.test(url.pathname))
  throw Error('Pinned HTTPS synchronization endpoint required')
 if(typeof fetchImpl!=='function'||!Number.isInteger(maxResponseBytes)||
    maxResponseBytes<1024||maxResponseBytes>1048576)throw Error('Invalid trusted sync transport')
 let busy=false
 async function submit({drafts,identity,token}){
  if(busy)throw Error('Synchronization request already in progress')
  if(!Array.isArray(drafts)||drafts.length<1||drafts.length>100||
     typeof identity!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(identity)||
     typeof token!=='string'||token.length<16||token.length>4096)
   throw Error('Invalid trusted synchronization request')
  const seen=new Set()
  const operations=drafts.map(draft=>{
   validateDraft(draft)
   const id=operationId(draft)
   if(seen.has(id))throw Error('Duplicate offline draft')
   seen.add(id)
   return {draft,operationId:id,identity}
  })
  busy=true
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000)
  try{
   const response=await fetchImpl(url.toString(),{
    method:'POST',redirect:'error',cache:'no-store',credentials:'omit',
    headers:{'content-type':'application/json','authorization':'Bearer '+token},
    body:JSON.stringify({operations}),signal:controller.signal
   })
   if(response.status!==200)throw Error('Server synchronization rejected')
   const size=Number(response.headers?.get?.('content-length')||0)
   if(!Number.isFinite(size)||size>maxResponseBytes)throw Error('Synchronization response too large')
   const raw=await response.text()
   if(Buffer.byteLength(raw,'utf8')>maxResponseBytes)throw Error('Synchronization response too large')
   const parsed=JSON.parse(raw)
   if(!parsed||!Array.isArray(parsed.results)||parsed.results.length!==drafts.length)
    throw Error('Malformed synchronization response')
   const expected=new Set(drafts.map(d=>d.draftId)),received=new Set()
   for(const result of parsed.results){
    if(!result||typeof result.draftId!=='string'||!expected.has(result.draftId)||
       received.has(result.draftId)||!['applied','already-applied','conflict','blocked','error'].includes(result.decision))
     throw Error('Untrusted synchronization response')
    received.add(result.draftId)
   }
   return Object.freeze({results:parsed.results.map(result=>Object.freeze({...result}))})
  }finally{clearTimeout(timeout);busy=false}
 }
 return Object.freeze({submit})
}
module.exports={createOfflineSyncClient}
