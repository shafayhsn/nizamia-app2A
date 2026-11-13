'use strict'
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createOfflineGrantIssuer } = require('./offlineGrantIssuer.cjs')
const { verifyEnrollmentProof } = require('../desktop/offlineEnrollmentProof.cjs')
const { verifySignedDraftGrant } = require('../desktop/offlineSignedDraftGrant.cjs')
async function main() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const now = 1794600000000
  const identity = 'owner'
  const nonce = 'b'.repeat(64)
  const snapshotHash = 'a'.repeat(64)
  const issuer = createOfflineGrantIssuer({ privateKey, now:() => now,
    authorize: async ({session,identity:requested,purpose,permissions}) =>
      session?.authenticated === true && session.identity === requested &&
      (purpose !== 'draft' || permissions.every(p => session.permissions.includes(p))) })
  const session = { authenticated:true, identity, permissions:['offline:draft:orders'] }
  const proof = await issuer.enrollment({ session, identity, nonce })
  assert.equal(verifyEnrollmentProof({proof,identity,nonce,publicKey,now}),true)
  const draft = await issuer.draft({ session,identity,snapshotHash,permissions:['offline:draft:orders'] })
  assert.equal(verifySignedDraftGrant({proof:draft,identity,snapshotHash,publicKey,now}).identity,identity)
  await assert.rejects(issuer.enrollment({session:{authenticated:false,identity},identity,nonce}),/denied/)
  await assert.rejects(issuer.draft({session,identity,snapshotHash,permissions:['offline:draft:production_daily_entries']}),/denied/)
  await assert.rejects(issuer.draft({session,identity,snapshotHash,permissions:['offline:draft:users']}),/Invalid/)
  await assert.rejects(issuer.enrollment({session,identity:'intruder',nonce}),/denied/)
  assert.equal(verifyEnrollmentProof({proof,identity,nonce,publicKey,now:now+300001}),false)
  assert.equal(verifySignedDraftGrant({proof:draft,identity,snapshotHash,publicKey,now:now+600001}),null)
  process.stdout.write('Server grant issuer and desktop verifier integration tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
