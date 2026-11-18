'use strict'

// The loop runs in Electron main. Its public status never contains bearer
// credentials or the contents of local edits.
function createDesktopSyncLoop({coordinator,isOnline,refresh,intervalMs=30000}){
 let session=null,timer=null,busy=false,refreshNeeded=false
 let status={state:'sign-in-required'}
 function stop(){
  clearTimeout(timer)
  timer=null
  session=null
  refreshNeeded=false
  status={state:'sign-in-required'}
 }
 function start(onlineSession){
  stop()
  session=onlineSession
  schedule(0)
 }
 function schedule(delay){
  if(!session||timer)return
  timer=setTimeout(()=>{
   timer=null
   void run()
  },delay)
  timer.unref?.()
 }
 async function run(){
  const current=session
  if(!current)return
  if(busy){schedule(intervalMs);return}
  if(!isOnline()){
   refreshNeeded=true
   status={state:'offline'}
   schedule(intervalMs)
   return
  }
  busy=true
  status={state:'checking'}
  try{
   const result=await coordinator.synchronize()
   if(current!==session)return
   status={state:result.conflicts?'conflict':result.retained?'pending':'ready',...result}
   if(result.archived)refreshNeeded=true
   if(refreshNeeded){
    const refreshed=await refresh(current)
    if(current===session)refreshNeeded=refreshed?.status==='busy'
   }
  }catch{
   if(current===session)status={state:'retrying'}
  }finally{
   busy=false
   schedule(intervalMs)
  }
 }
 return {start,stop,getStatus:()=>({...status})}
}
module.exports={createDesktopSyncLoop}
