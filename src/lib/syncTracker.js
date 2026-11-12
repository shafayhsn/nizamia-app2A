// Tracks Supabase REST mutations performed by this browser session.
const listeners = new Set()
let pending = 0, failed = false, lastSaved = null, lastFailure = null
export const syncSnapshot = () => ({pending,failed,lastSaved,lastFailure})
export const subscribeSync = fn => {listeners.add(fn);return ()=>listeners.delete(fn)}
const emit = () => listeners.forEach(fn=>fn(syncSnapshot()))
export function resetSyncError(){failed=false;lastFailure=null;emit()}

function safeRequestInfo(input,method){
  try {
    const url=new URL(typeof input==='string'?input:input?.url||String(input))
    const parts=url.pathname.split('/').filter(Boolean)
    const rest=parts.indexOf('rest')
    const area=rest>=0&&parts[rest+1]==='v1'?parts[rest+2]||'Unknown table':parts.includes('storage')?'Storage':parts.includes('functions')?'Edge Function':'Database'
    const action={POST:'Create / upsert',PATCH:'Update',PUT:'Replace',DELETE:'Delete'}[method]||method
    return {area,action}
  }catch{return {area:'Unknown data area',action:method}}
}
function recordFailure(input,method,status,message){
  const {area,action}=safeRequestInfo(input,method)
  lastFailure={area,action,status:status||null,message:String(message||'Database request failed').slice(0,300),time:new Date().toISOString()}
  failed=true
}
export async function trackedFetch(input,init={}) {
 const method=String(init?.method||'GET').toUpperCase()
 const isWrite=['POST','PATCH','PUT','DELETE'].includes(method)&&!String(typeof input==='string'?input:input?.url||input).includes('/auth/v1/')
 if(isWrite){pending++;emit()}
 try {
   const response=await fetch(input,init)
   if(isWrite){
     if(!response.ok){
       let detail=''
       try {
         const body=await response.clone().json()
         detail=body?.message||body?.error_description||body?.error||body?.details||''
       }catch{}
       recordFailure(input,method,response.status,detail||response.statusText||'Database rejected the request')
     }else lastSaved=new Date().toISOString()
   }
   return response
 }catch(err){
   if(isWrite)recordFailure(input,method,null,err?.message||'Network request failed')
   throw err
 }finally{if(isWrite){pending=Math.max(0,pending-1);emit()}}
}
