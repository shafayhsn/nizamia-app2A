'use strict'
// Main-process-only authenticated snapshot download. No renderer-provided URLs,
// no privileged Supabase keys and no cloud writes.
function createSnapshotDownloadClient({origin,fetchImpl,maxBytes=100*1024*1024}){
 const base=new URL(origin)
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||base.port)
  throw Error('Pinned HTTPS application origin required')
 if(typeof fetchImpl!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>1024*1024*1024)
  throw Error('Invalid snapshot transport')
 let busy=false
 async function download({token,checkpoint,incremental=false}){
  if(busy)throw Error('Snapshot download already running')
  if(typeof token!=='string'||token.length<16||token.length>4096)throw Error('Authenticated online session required')
  busy=true
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
  try{
   const url=new URL('/api/desktop/snapshot',base)
   if(incremental){
    url.searchParams.set('sync','2')
    if(checkpoint){url.searchParams.set('after',checkpoint.revision);url.searchParams.set('scope',checkpoint.scope)}
   }
   const response=await fetchImpl(url.toString(),{
    method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
    headers:{authorization:'Bearer '+token,accept:'application/json'},
    signal:controller.signal
   })
   if(!response||response.status!==200)throw Object.assign(Error('Authenticated snapshot endpoint unavailable'),{status:response?.status})
   if(response.url&&new URL(response.url).origin!==base.origin)throw Error('Snapshot response origin mismatch')
   const length=response.headers?.get?.('content-length')
   if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maxBytes))
    throw Error('Snapshot response exceeds size limit')
   const reader=response.body?.getReader?.()
   if(!reader)throw Error('Streaming snapshot response required')
   const chunks=[];let total=0
   try{
    while(true){
     const {done,value}=await reader.read()
     if(done)break
     total+=value.byteLength
     if(total>maxBytes)throw Error('Snapshot response exceeds size limit')
     chunks.push(Buffer.from(value))
    }
   }finally{reader.releaseLock()}
   const payload=JSON.parse(Buffer.concat(chunks,total).toString('utf8'))
   if(payload?.delta){
    const {after,changes}=payload.delta,next=payload.checkpoint
    if(!checkpoint||next?.scope!==checkpoint.scope||after!==checkpoint.revision||!Number.isSafeInteger(next.revision)||next.revision<after||!changes||typeof changes!=='object'||Array.isArray(changes))throw Error('Invalid change response')
    for(const [table,part] of Object.entries(changes)){
     if(!/^[a-z][a-z0-9_]*$/.test(table)||!['id','key','order_id','parcel_id'].includes(part?.key)||!Array.isArray(part.records)||!Array.isArray(part.removed)||part.records.some(r=>r?.[part.key]==null)||part.removed.some(id=>typeof id!=='string'))throw Error('Incomplete changed records')
    }
    return payload
   }
   if(!payload||typeof payload!=='object'||!payload.backup_metadata||!payload.tables||
      typeof payload.tables!=='object'||Array.isArray(payload.tables))
    throw Error('Invalid snapshot envelope')
   const names=Object.keys(payload.tables)
   if(!['orders','buyers','suppliers'].every(t=>names.includes(t)))throw Error('Missing critical snapshot tables')
   const counts=payload.backup_metadata.table_row_counts
   if(!counts||payload.backup_metadata.table_count!==names.length)throw Error('Snapshot manifest mismatch')
   for(const name of names){
    if(!/^[a-z][a-z0-9_]*$/.test(name)||!Array.isArray(payload.tables[name])||
       counts[name]!==payload.tables[name].length)throw Error('Snapshot table manifest mismatch')
   }
   return payload
  }finally{clearTimeout(timer);busy=false}
 }
 return Object.freeze({download})
}
module.exports={createSnapshotDownloadClient}
