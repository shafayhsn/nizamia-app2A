'use strict'
// Trusted main-process orchestrator: authenticated queue -> HTTPS server ->
// durable journal reconciliation. Never call from renderer with token or grants.
const {pendingSyncDrafts,commitSyncResults}=require('./offlineDraftJournal.cjs')
function createOfflineSyncCoordinator({client,getDirectory,getSession,getToken,authenticateSession}){
 if(!client||typeof client.submit!=='function'||typeof getDirectory!=='function'||
    typeof getSession!=='function'||typeof getToken!=='function'||typeof authenticateSession!=='function')
  throw Error('Trusted sync dependencies required')
 let busy=false
 async function synchronize(){
  if(busy)throw Error('Synchronization already in progress')
  busy=true
  try{
   const session=await getSession()
   if(!session?.authenticated||!session.identity||await authenticateSession(session)!==true)
    throw Error('Authenticated offline session required')
   const directory=getDirectory()
   const drafts=await pendingSyncDrafts({directory,session,authenticateSession})
   if(!drafts.length)return {submitted:0,archived:0,conflicts:0,retained:0}
   const token=await getToken(session)
   if(typeof token!=='string'||token.length<16)throw Error('Trusted online session required')
   if(await authenticateSession(session)!==true)throw Error('Offline session expired')
   const response=await client.submit({drafts,identity:session.identity,token})
   if(await authenticateSession(session)!==true)throw Error('Offline session expired after sync')
   const summary=await commitSyncResults({directory,session,authenticateSession,results:response.results})
   return {submitted:drafts.length,...summary}
  }finally{busy=false}
 }
 return Object.freeze({synchronize})
}
module.exports={createOfflineSyncCoordinator}
