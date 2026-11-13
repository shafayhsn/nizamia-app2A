'use strict'
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { verifySignedDraftGrant, AUDIENCE } = require('./offlineSignedDraftGrant.cjs')
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
const other = crypto.generateKeyPairSync('ed25519')
const now = 1794600000000
const identity = 'owner'
const snapshotHash = 'a'.repeat(64)
const claims = { audience:AUDIENCE, identity, snapshotHash, permissions:['offline:draft:orders'],
  issuedAt:now-1000, expiresAt:now+60000 }
function sign(c, key=privateKey) {
  const canonical = JSON.stringify([c.audience,c.identity,c.snapshotHash,c.permissions,c.issuedAt,c.expiresAt])
  return { claims:c, signature:crypto.sign(null,Buffer.from(canonical),key).toString('base64url') }
}
const args = { identity, snapshotHash, publicKey, now }
const valid = verifySignedDraftGrant({ ...args, proof:sign(claims) })
assert.equal(valid.identity,identity)
assert.deepEqual([...valid.permissions],['offline:draft:orders'])
assert.equal(verifySignedDraftGrant({ ...args, proof:sign(claims,other.privateKey) }),null)
assert.equal(verifySignedDraftGrant({ ...args, proof:sign({...claims,identity:'intruder'}) }),null)
assert.equal(verifySignedDraftGrant({ ...args, proof:sign({...claims,snapshotHash:'b'.repeat(64)}) }),null)
assert.equal(verifySignedDraftGrant({ ...args, proof:sign({...claims,permissions:['offline:draft:users']}) }),null)
assert.equal(verifySignedDraftGrant({ ...args, proof:sign({...claims,expiresAt:now-1}) }),null)
assert.equal(verifySignedDraftGrant({ ...args, proof:sign({...claims,expiresAt:now+3600000}) }),null)
assert.equal(verifySignedDraftGrant({ ...args, proof:sign({...claims,permissions:['offline:draft:orders','offline:draft:orders']}) }),null)
assert.equal(verifySignedDraftGrant({ ...args, proof:{...sign(claims),claims:{...claims,admin:true}} }),null)
process.stdout.write('Signed offline draft grant verification tests passed.\n')
