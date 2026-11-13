'use strict'
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const {createOfflineGrantIssuer} = require('./offlineGrantIssuer.cjs')
const {createOfflineAuthorizationHandler} = require('./offlineAuthorizationHandler.cjs')
const {verifyEnrollmentProof} = require('../desktop/offlineEnrollmentProof.cjs')
const {verifySignedDraftGrant} = require('../desktop/offlineSignedDraftGrant.cjs')
async function main() {
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519')
  const now=1794600000000, identity='owner', nonce='a'.repeat(64), snapshotHash='b'.repeat(64)
  const issuer=createOfflineGrantIssuer({privateKey,now:()=>now,authorize:async ({session,identity,purpose,permissions=[]}) =>
    session.authenticated === true && session.identity === identity &&
    (purpose !== 'draft' || permissions.every(p=>session.permissions.includes(p)))})
  const handler=createOfflineAuthorizationHandler({issuer,authenticateRequest:async req =>
    req.authorization === 'valid' ? {authenticated:true,identity,permissions:['offline:draft:orders']} : null})
  const call=(kind,body,authorization='valid')=>handler({method:'POST',kind,body,authorization})
  assert.equal((await call('enrollment',{nonce},'forged')).status,401)
  assert.equal((await call('draft',{snapshotHash,permissions:['offline:draft:production_daily_entries']})).status,403)
  assert.equal((await call('enrollment',{nonce:'bad'})).status,403)
  assert.equal((await handler({method:'GET',kind:'enrollment'})).status,405)
  const enrolled=await call('enrollment',{nonce,identity:'intruder'})
  assert.equal(enrolled.status,200)
  assert.equal(verifyEnrollmentProof({proof:enrolled.body.proof,identity,nonce,publicKey,now}),true)
  const draft=await call('draft',{snapshotHash,permissions:['offline:draft:orders'],identity:'intruder'})
  assert.equal(draft.status,200)
  assert.equal(verifySignedDraftGrant({proof:draft.body.proof,identity,snapshotHash,publicKey,now}).identity,identity)
  process.stdout.write('Offline authorization HTTP adapter tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
