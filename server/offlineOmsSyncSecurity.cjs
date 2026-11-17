'use strict'
// Server-only adapter for the existing App-2A signed backend session format.
// Uses the SAME signing secret as api/oms.js, never a desktop-supplied key.
// This is not a deployed endpoint; caller must inject trusted server DB access.
const {createHmac,timingSafeEqual}=require('node:crypto')
const {createOfflineSyncSecurity}=require('./offlineSyncSecurity.cjs')
function createOmsSyncSecurity({secret,db,now=()=>Date.now()}){
 if(typeof secret!=='string'||secret.length<32||!db||typeof db.from!=='function'||typeof now!=='function')
  throw Error('Trusted OMS session secret and server database required')
 async function verifyBearer(token){
  if(typeof token!=='string'||token.length>4096)return null
  const parts=token.split('.')
  if(parts.length!==2||!parts[0]||!parts[1]||
     !/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]+$/.test(parts[1]))return null
  const expected=createHmac('sha256',secret).update(parts[0]).digest('base64url')
  const actual=Buffer.from(parts[1]),valid=Buffer.from(expected)
  if(actual.length!==valid.length||!timingSafeEqual(actual,valid))return null
  let payload
  try{payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'))}catch{return null}
  if(!payload||typeof payload.id!=='string'||!payload.id||
     !Number.isSafeInteger(payload.exp)||payload.exp<=now())return null
  return {userId:payload.id}
 }
 async function loadUser(id){
  const {data,error}=await db.from('users').select('id,role,role_id,is_active,is_restricted').eq('id',id).maybeSingle()
  if(error)throw Error('Current user verification unavailable')
  return data
 }
 async function loadPermissions(roleId){
  if(typeof roleId!=='string'||!roleId)return null
  const {data,error}=await db.from('permissions').select('module,can_edit').eq('role_id',roleId)
  if(error)throw Error('Current permissions unavailable')
  return Object.fromEntries((data||[]).map(row=>[row.module,{edit:row.can_edit===true}]))
 }
 return createOfflineSyncSecurity({verifyBearer,loadUser,loadPermissions})
}
module.exports={createOmsSyncSecurity}
