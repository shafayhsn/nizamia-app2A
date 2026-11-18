'use strict'
// Main-process-only read-side orchestration. No local or cloud writes.
// The caller must provide an independently authenticated online bearer token.
const {createSnapshotDownloadClient}=require('./snapshotDownloadClient.cjs')
const SENSITIVE=/password|secret|token|api_key|private_key|session|credential|auth_hash/i
const EXCLUDED=new Set(['users','permissions','roles','app_database_sync_status','notification_reads','app_task_reads'])
function createCloudRefreshPlanner({origin,fetchImpl,getOnlineToken,authenticateOnlineSession}){
 if(typeof getOnlineToken!=='function'||typeof authenticateOnlineSession!=='function')
  throw Error('Trusted online authentication callbacks required')
 const client=createSnapshotDownloadClient({origin,fetchImpl})
 let busy=false
 async function plan(session){
  if(busy)throw Error('Cloud refresh already in progress')
  busy=true
  try{
   if(!session||await authenticateOnlineSession(session)!==true)throw Error('Verified online session required')
   const token=await getOnlineToken(session)
   if(typeof token!=='string'||token.length<16)throw Error('Online bearer token unavailable')
   const snapshot=await client.download({token})
   if(await authenticateOnlineSession(session)!==true)throw Error('Online session expired')
   const tables=Object.create(null)
   for(const [name,rows] of Object.entries(snapshot.tables)){
    if(EXCLUDED.has(name))continue
    tables[name]=rows.map(row=>{
     if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid cloud row')
     return Object.fromEntries(Object.entries(row).filter(([key])=>!SENSITIVE.test(key)))
    })
   }
   // Explicitly return a plan, not an instruction to write. The local writer
   // must separately verify the live DB fingerprint, conflicts and backup.
   return {tables,tableCount:Object.keys(tables).length,rowCount:Object.values(tables).reduce((n,rows)=>n+rows.length,0)}
  }finally{busy=false}
 }
 return Object.freeze({plan})
}
module.exports={createCloudRefreshPlanner}
