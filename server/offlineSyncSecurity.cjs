'use strict'
const MODULES=Object.freeze({orders:'orders',production_daily_entries:'production'})
function createOfflineSyncSecurity({verifyBearer,loadUser,loadPermissions}){
 if(typeof verifyBearer!=='function'||typeof loadUser!=='function'||typeof loadPermissions!=='function')throw Error('Trusted backend security providers required')
 async function authenticate(request){
  const header=request?.headers?.authorization
  if(typeof header!=='string'||!/^Bearer [A-Za-z0-9._~-]{16,4096}$/.test(header))return null
  try{
   const verified=await verifyBearer(header.slice(7))
   if(typeof verified?.userId!=='string'||!verified.userId)return null
   const user=await loadUser(verified.userId)
   if(!user||user.id!==verified.userId||user.is_active!==true||user.is_restricted===true)return null
   return Object.freeze({authenticated:true,identity:user.id})
  }catch{return null}
 }
 async function authorize({session,identity,table,fields,purpose}){
  if(purpose!=='offline-sync'||!session?.authenticated||session.identity!==identity||
     !Object.hasOwn(MODULES,table)||!Array.isArray(fields)||fields.length<1||
     fields.length>2||fields.some(f=>!['notes','remarks'].includes(f)))return false
  try{
   const user=await loadUser(identity)
   if(!user||user.id!==identity||user.is_active!==true||user.is_restricted===true)return false
   if(user.role==='admin')return true
   const permissions=await loadPermissions(user.role_id,identity)
   return permissions?.[MODULES[table]]?.edit===true
  }catch{return false}
 }
 return Object.freeze({authenticate,authorize})
}
module.exports={createOfflineSyncSecurity}
