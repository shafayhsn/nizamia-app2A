'use strict'
const {createHmac,timingSafeEqual}=require('node:crypto')
const scope='desktop-sync'
const lifetime=8*60*60*1000
const signature=(key,payload)=>createHmac('sha256',key).update(scope+':'+payload).digest()
function issueDesktopSyncToken(key,id,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({id,scope,exp:now+lifetime})).toString('base64url')
 return payload+'.'+signature(key,payload).toString('base64url')
}
function verifyDesktopSyncToken(key,token,now=Date.now()){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{43}$/.test(token))return null
 const [payload,mac]=token.split('.')
 const supplied=Buffer.from(mac,'base64url')
 if(!timingSafeEqual(supplied,signature(key,payload)))return null
 try{
  const claim=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'))
  if(claim.scope===scope&&typeof claim.id==='string'&&claim.id&&
     Number.isSafeInteger(claim.exp)&&claim.exp>now&&claim.exp<=now+lifetime)return {userId:claim.id}
 }catch{}
 return null
}
module.exports={issueDesktopSyncToken,verifyDesktopSyncToken}
