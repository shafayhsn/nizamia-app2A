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
 async function download({token}){
  if(busy)throw Error('Snapshot download already running')
  if(typeof token!=='string'||token.length<16||token.length>4096)throw Error('Authenticated online session required')
  busy=true
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
  try{
   const url=new URL('/api/desktop/snapshot',base)
   const response=await fetchImpl(url.toString(),{
    method:'GET',redirect:'error',cache:'no-store',credentials:'omit',
    headers:{authorization:'Bearer '+token,accept:'application/json'},
    signal:controller.signal
   })
   if(!response||response.status!==200)throw Error('Authenticated snapshot endpoint unavailable')
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
