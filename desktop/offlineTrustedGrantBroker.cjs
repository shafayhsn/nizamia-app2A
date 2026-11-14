'use strict'
// Trusted main-process grant acquisition. Never accept proofs, identities or
// permissions supplied by a renderer. The server must independently authorize.
const {verifySignedDraftGrant}=require('./offlineSignedDraftGrant.cjs')
const ALLOWED=new Set(['orders','production_daily_entries'])
function createTrustedGrantBroker({client,publicKey,clock=()=>Date.now()}){
 if(!client||typeof client.draft!=='function'||!publicKey||typeof clock!=='function')
  throw Error('Trusted HTTPS authorization client and pinned signing key required')
 let pending=false
 async function request({identity,table,snapshotHash,token}){
  if(pending)throw Error('Authorization already in progress')
  if(typeof identity!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(identity)||
     !ALLOWED.has(table)||typeof snapshotHash!=='string'||!/^[a-f0-9]{64}$/.test(snapshotHash)||
     typeof token!=='string'||token.length<16)
   throw Error('Invalid trusted authorization request')
  pending=true
  try {
   const permission='offline:draft:'+table
   const proof=await client.draft(snapshotHash,[permission],token)
   const grant=verifySignedDraftGrant({proof,identity,snapshotHash,publicKey,now:clock()})
   if(!grant||!grant.permissions.includes(permission))throw Error('Server draft authorization rejected')
   return grant
  }finally{pending=false}
 }
 return Object.freeze({request})
}
module.exports={createTrustedGrantBroker}
