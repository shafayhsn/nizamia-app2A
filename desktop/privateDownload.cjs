'use strict'
const fs=require('node:fs')
const path=require('node:path')
const {createHash,randomUUID}=require('node:crypto')
const hash=value=>createHash('sha256').update(value).digest('hex')
async function privateDownload({directory,owner,kind,id,record,online,token,origin,isCurrent,fetchImpl=fetch}){
 const meeting=kind==='meeting'
 const object=record?.[meeting?'attachment_path':'storage_path']
 if(!object||!owner||!isCurrent())throw Error('Sign in and refresh the attachment list.')
 const max=(meeting?10:25)*1024*1024
 const cache=path.join(directory,'attachment-cache',hash(owner))
 const file=path.join(cache,hash(JSON.stringify([kind,id,object,record.file_size??null])))
 const validSize=n=>n>=0&&n<=max&&(meeting||record.file_size==null||Number(record.file_size)===n)
 if(!online){
  if(!fs.existsSync(file))throw Error('Download this attachment once while connected to open it offline.')
  const size=fs.statSync(file).size
  if(!validSize(size-64))throw Error('Cached attachment is incomplete. Reconnect to download it again.')
  const bytes=fs.readFileSync(file),body=bytes.subarray(64)
  if(hash(body)!==bytes.subarray(0,64).toString())throw Error('Cached attachment failed verification.')
  return body
 }
 if(!token)throw Error('Sign in online to download this attachment.')
 const meta=await fetchImpl(origin+'/api/desktop/snapshot?'+new URLSearchParams({attachment:kind,id}),{
  headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)})
 if(!meta.ok)throw Error('Attachment access could not be verified.')
 const details=await meta.json(),url=new URL(details.url)
 if(details.path!==object||url.protocol!=='https:'||url.username||url.password||url.port||
   !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)||!url.pathname.startsWith('/storage/v1/object/sign/'+(meeting?'ppm-attachments':'company-assets')+'/'))
  throw Error('Refresh the attachment list and try again.')
 const res=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(60000)})
 if(!res.ok)throw Error('Attachment download failed.')
 let n=0
 const chunks=[]
 for await(const chunk of res.body){
  n+=chunk.length
  if(n>max||!isCurrent())throw Error('Attachment download interrupted.')
  chunks.push(chunk)
 }
 const length=res.headers.get('content-length')
 if(!isCurrent()||!validSize(n)||length!==null&&Number(length)!==n)throw Error('Attachment download incomplete.')
 const bytes=Buffer.concat(chunks)
 fs.mkdirSync(cache,{recursive:true,mode:0o700})
 const temp=file+'.'+randomUUID()
 try{
  fs.writeFileSync(temp,Buffer.concat([Buffer.from(hash(bytes)),bytes]),{flag:'wx',mode:0o600})
  fs.renameSync(temp,file)
 }finally{fs.rmSync(temp,{force:true})}
 return bytes
}
module.exports={privateDownload}
