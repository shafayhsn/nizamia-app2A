'use strict'
const fs=require('node:fs')
const path=require('node:path')
const {createHash,randomUUID}=require('node:crypto')

function validToken(token,id,scope,now){
 if(typeof token!=='string'||token.length>4096)return null
 try{
  const [body,signature,extra]=token.split('.')
  if(!body||!signature||extra!==undefined)return null
  const claim=JSON.parse(Buffer.from(body,'base64url').toString('utf8'))
  // Decoding is only for local expiry and account binding. The backend
  // authenticates the signed bearer before accepting any operation.
  if(claim.id!==id||claim.scope!==scope||!Number.isSafeInteger(claim.exp)||claim.exp<=now)
   return null
  return {token,expiresAt:claim.exp}
 }catch{return null}
}

function createDesktopCloudSessionStore({directory,safeStorage,now=Date.now}){
 const location=id=>path.join(directory,'cloud-session-'+createHash('sha256').update(id).digest('hex')+'.bin')
 const normalize=(id,input)=>({
  snapshot:validToken(input?.snapshotToken,id,'desktop-snapshot',now()),
  sync:validToken(input?.syncToken,id,'desktop-sync',now())
 })
 function save(id,input){
  const tokens=normalize(id,input)
  if(!tokens.snapshot&&!tokens.sync){clear(id);return tokens}
  if(!safeStorage.isEncryptionAvailable())return tokens
  const target=location(id),temp=target+'.'+randomUUID()+'.tmp'
  try{
   const bytes=safeStorage.encryptString(JSON.stringify(input))
   fs.writeFileSync(temp,bytes,{mode:0o600,flag:'wx'})
   fs.renameSync(temp,target)
  }catch{
   clear(id)
  }finally{try{fs.unlinkSync(temp)}catch{}}
  return tokens
 }
 function read(id){
  try{
   if(!safeStorage.isEncryptionAvailable())return {}
   const safe=location(id),stat=fs.lstatSync(safe)
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)return {}
   return normalize(id,JSON.parse(safeStorage.decryptString(fs.readFileSync(safe))))
  }catch{return {}}
 }
 function clear(id){try{fs.unlinkSync(location(id))}catch{}}
 return {save,read,clear}
}

module.exports={createDesktopCloudSessionStore}
