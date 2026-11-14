'use strict'
// Framework-neutral HTTP adapter for authenticated offline sync.
// Deployment must mount behind the existing trusted server auth middleware.
// No implicit CORS and no public/anonymous access.
function createOfflineSyncHttpHandler({apply,maxBodyBytes=262144}){
 if(typeof apply!=='function'||!Number.isInteger(maxBodyBytes)||maxBodyBytes<4096||maxBodyBytes>1048576)
  throw Error('Trusted sync engine and request limit required')
 return async function handle(request){
  if(request?.method!=='POST')return {status:405,body:{error:'Method not allowed'}}
  if(request.headers?.['content-type']?.split(';')[0]?.trim().toLowerCase()!=='application/json')
   return {status:415,body:{error:'JSON required'}}
  const raw=request.rawBody
  if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>maxBodyBytes)
   return {status:413,body:{error:'Invalid or oversized body'}}
  let parsed
  try{parsed=JSON.parse(raw)}catch{return {status:400,body:{error:'Invalid JSON'}}}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
     !Array.isArray(parsed.operations))
   return {status:400,body:{error:'Invalid operations'}}
  // Preserve the trusted request's authorization header for the injected
  // authenticate() callback; never trust identity inside the JSON payload.
  return apply({...request,operations:parsed.operations,body:undefined,rawBody:undefined})
 }
}
module.exports={createOfflineSyncHttpHandler}
