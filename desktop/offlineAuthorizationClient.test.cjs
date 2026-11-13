'use strict'
const assert=require('node:assert/strict')
const crypto=require('node:crypto')
const {createOfflineAuthorizationClient}=require('./offlineAuthorizationClient.cjs')
const {createOfflineGrantIssuer}=require('../server/offlineGrantIssuer.cjs')
const {createOfflineAuthorizationHandler}=require('../server/offlineAuthorizationHandler.cjs')
const {verifyEnrollmentProof}=require('./offlineEnrollmentProof.cjs')
const {verifySignedDraftGrant}=require('./offlineSignedDraftGrant.cjs')
async function main() {
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519')
  const now=1794600000000, identity='owner',nonce='a'.repeat(64),snapshotHash='b'.repeat(64)
  const issuer=createOfflineGrantIssuer({privateKey,now:()=>now,authorize:async ({session,identity,permissions=[]}) =>
    session.authenticated && session.identity===identity && permissions.every(p=>session.permissions.includes(p))})
  const handler=createOfflineAuthorizationHandler({issuer,authenticateRequest:async request =>
    request.authorization==='Bearer trusted-session-token' ? {authenticated:true,identity,permissions:['offline:draft:orders']} : null})
  const calls=[]
  const client=createOfflineAuthorizationClient({endpoint:'https://example.org/api/offline-authorization',
    fetchImpl:async (url,opts)=>{
      calls.push({url,opts})
      const request=JSON.parse(opts.body)
      const result=await handler({method:opts.method,kind:request.kind,body:request,authorization:opts.headers.authorization})
      return {status:result.status,headers:{get:()=>null},text:async()=>JSON.stringify(result.body)}
    }})
  const enrollment=await client.enrollment(nonce,'trusted-session-token')
  assert.equal(verifyEnrollmentProof({proof:enrollment,identity,nonce,publicKey,now}),true)
  const draft=await client.draft(snapshotHash,['offline:draft:orders'],'trusted-session-token')
  assert.equal(verifySignedDraftGrant({proof:draft,identity,snapshotHash,publicKey,now}).identity,identity)
  assert.equal(calls.length,2)
  assert.equal(calls[0].opts.redirect,'error')
  await assert.rejects(client.draft(snapshotHash,['offline:draft:production_daily_entries'],'trusted-session-token'),/denied/)
  await assert.rejects(client.enrollment(nonce,'invalid-token-that-is-not-authorized'),/denied/)
  assert.throws(()=>createOfflineAuthorizationClient({endpoint:'http://example.org/api/offline-authorization',fetchImpl:()=>{}}),/HTTPS/)
  assert.throws(()=>createOfflineAuthorizationClient({endpoint:'https://example.org/api/offline-authorization?next=evil',fetchImpl:()=>{}}),/HTTPS/)
  const oversized=createOfflineAuthorizationClient({endpoint:'https://example.org/api/offline-authorization',
    fetchImpl:async()=>({status:200,headers:{get:()=>null},text:async()=> 'x'.repeat(9000)})})
  await assert.rejects(oversized.enrollment(nonce,'trusted-session-token'),/too large/)
  process.stdout.write('Pinned HTTPS desktop-to-server authorization integration tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
