'use strict'
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { verifyEnrollmentProof, AUDIENCE, MAX_LIFETIME_MS } = require('./offlineEnrollmentProof.cjs')
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
const attacker = crypto.generateKeyPairSync('ed25519')
const now = 1800000000000
const nonce = crypto.randomBytes(32).toString('hex')
const claims = { audience: AUDIENCE, identity: 'worker_1', nonce, issuedAt: now - 1000, expiresAt: now + 60000 }
function sign(claims, key = privateKey) {
  const payload = JSON.stringify([claims.audience, claims.identity, claims.nonce, claims.issuedAt, claims.expiresAt])
  return { claims, signature: crypto.sign(null, Buffer.from(payload), key).toString('base64url') }
}
const verify = (proof, overrides = {}) => verifyEnrollmentProof({ proof, identity: 'worker_1', nonce, publicKey, now, ...overrides })
assert.equal(verify(sign(claims)), true)
assert.equal(verify(sign(claims, attacker.privateKey)), false)
assert.equal(verify(sign({ ...claims, identity: 'other' })), false)
assert.equal(verify(sign({ ...claims, nonce: 'f'.repeat(64) })), false)
assert.equal(verify(sign({ ...claims, audience: 'another-app' })), false)
assert.equal(verify(sign({ ...claims, expiresAt: now })), false)
assert.equal(verify(sign({ ...claims, expiresAt: now + MAX_LIFETIME_MS + 1, issuedAt: now })), false)
assert.equal(verify(sign(claims), { now: now + 61000 }), false)
assert.equal(verify({ ...sign(claims), claims: { ...claims, identity: 'other' } }), false)
assert.equal(verify(sign(claims), { publicKey: attacker.publicKey }), false)
assert.equal(verify({ ...sign(claims), claims: { ...claims, admin: true } }), false)
process.stdout.write('CP-18 signed enrollment proof verification tests passed.\n')
