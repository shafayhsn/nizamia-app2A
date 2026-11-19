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
const readCache=new Map()
let cacheBytes=0
let versionRequest=null
function clearReadCache(){readCache.clear();cacheBytes=0;versionRequest=null}
async function currentVersion(origin,headers){
 if(versionRequest)return versionRequest
 const proofHeaders=new Headers({'Content-Type':'application/json','Accept':'application/json'})
 for(const name of ['apikey','authorization','x-nzos-edit-proof'])if(headers.has(name))proofHeaders.set(name,headers.get(name))
 const pending=fetch(new URL('/rest/v1/rpc/nzos_read_versions',origin),{method:'POST',headers:proofHeaders,body:'{}',redirect:'error',cache:'no-store'})
   .then(async response=>response.ok?await response.json():null)
 versionRequest=pending
 try{return await pending}finally{if(versionRequest===pending)versionRequest=null}
}
let proofInFlight=null
let cachedProof=null
let generation=0
export function resetEditSession(){generation++;clearReadCache();cachedProof=null;proofInFlight=null}
async function sessionProof(){
  if(cachedProof && cachedProof.until>Date.now())return cachedProof.token
  if(proofInFlight)return proofInFlight
  const epoch=generation
  const pending=(async()=>{
    const response=await fetch('/api/oms',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'editSession'})})
    if(!response.ok)throw Error('Your session could not be verified. Sign in again and retry.')
    const {token}=await response.json()
    if(epoch!==generation||!token)throw Error('Your session changed. Retry after signing in.')
    cachedProof={token,until:Date.now()+30000}
    return token
  })()
  proofInFlight=pending
  try{return await pending}finally{if(proofInFlight===pending)proofInFlight=null}
}
export async function trackedFetch(input,init={}) {
 const method=String(init?.method||'GET').toUpperCase()
 const isSummary=String(input?.url||input).split('?')[0].endsWith('/rpc/nzos_dashboard_summary')
 const isWrite=!isSummary&&['POST','PATCH','PUT','DELETE'].includes(method)&&!String(typeof input==='string'?input:input?.url||input).includes('/auth/v1/')
 if(isWrite){pending++;emit()}
 try {
   const target=new URL(typeof input==='string'?input:input?.url||String(input),location.href)
   const database=import.meta.env.VITE_SUPABASE_URL
   let readKey=null,version=null
   const epoch=generation
   if(database && target.origin===new URL(database).origin && target.pathname.startsWith('/rest/v1/')){
     const token=await sessionProof()
     const headers=new Headers(init.headers||input?.headers)
     headers.set('x-nzos-edit-proof',token)
     init={...init,headers,redirect:'error'}
     // Only cache ordinary list reads from business tables covered by the journal.
     const name=target.pathname.split('/').pop()
     if(method==='GET' && !/[(!]/.test(target.searchParams.get('select')||'') && /^(orders|buyers|suppliers|samples|sample_comments|bom_items|fitting_blocks|parcels|shipment_lines|size_groups|size_group_colors|order_queues)$/.test(name)){
       version=(await currentVersion(target.origin,headers))?.[name]
       if(typeof version==='string'&&epoch===generation){
         readKey=JSON.stringify([target.href,headers.get('range'),headers.get('range-unit'),headers.get('accept'),headers.get('prefer'),headers.get('accept-profile')])
         const entry=readCache.get(readKey)
         if(entry&&entry.version===version)return new Response(entry.bytes.slice(0),entry.init)
       }
     }else if(isWrite){versionRequest=null}
   }
   const response=await fetch(input,init)
   if(readKey&&response.ok&&epoch===generation){
     const bytes=await response.clone().arrayBuffer()
     if(bytes.byteLength<=1024*1024 && epoch===generation){
       if(cacheBytes+bytes.byteLength>8*1024*1024||readCache.size>=128)clearReadCache()
       cacheBytes-=readCache.get(readKey)?.bytes.byteLength||0
       readCache.set(readKey,{version,bytes,init:{status:response.status,headers:response.headers}})
       cacheBytes+=bytes.byteLength
     }
   }
   if(isWrite){
     if(!response.ok){
       let detail=''
       try {
         const body=await response.clone().json()
         detail=body?.message||body?.error_description||body?.error||body?.details||''
       }catch{}
       recordFailure(input,method,response.status,detail||response.statusText||'Database rejected the request')
     }else{versionRequest=null;lastSaved=new Date().toISOString()}
   }
   return response
 }catch(err){
   if(isWrite)recordFailure(input,method,null,err?.message||'Network request failed')
   throw err
 }finally{if(isWrite){pending=Math.max(0,pending-1);emit()}}
}
