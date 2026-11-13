'use strict'
// Main-process-only coordinator. Not exposed over IPC or connected to a UI.
// Enrollment requires a trusted server-side authorization callback; never
// treat renderer claims, a local snapshot or legacy password hashes as proof.
const crypto = require('node:crypto')
const { verifyEnrollmentProof } = require('./offlineEnrollmentProof.cjs')
const { createVerifier, verifyPassphrase } = require('./offlineAuthVerifier.cjs')
const { checkAttempt, recordFailure, recordSuccess } = require('./offlineLoginPolicy.cjs')
function createOfflineAuthService({ store, authorizeEnrollment, enrollmentPublicKey }) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function' ||
      typeof authorizeEnrollment !== 'function' || !enrollmentPublicKey)
    throw new Error('Trusted enrollment, pinned verification key and encrypted storage are required')
  let active = false
  let challenge = null
  function beginEnrollment(now = Date.now()) {
    if (active || !Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid enrollment challenge request')
    challenge = { nonce: crypto.randomBytes(32).toString('hex'), issuedAt: now }
    return { nonce: challenge.nonce }
  }
  async function enroll({ identity, passphrase, onlineProof }, now = Date.now()) {
    if (active) throw new Error('Authentication operation already in progress')
    active = true
    const pending = challenge
    challenge = null // consume before any asynchronous work; deny replay even on failure
    try {
      if (!pending || !Number.isSafeInteger(now) || now < pending.issuedAt || now - pending.issuedAt > 5 * 60 * 1000 ||
          !verifyEnrollmentProof({ proof: onlineProof, identity, nonce: pending.nonce, publicKey: enrollmentPublicKey, now }))
        throw new Error('Invalid or expired signed enrollment authorization')
      // Callback must verify the online session and authorization with the
      // trusted backend, not merely inspect a caller-supplied boolean.
      const approved = await authorizeEnrollment({ identity, onlineProof })
      if (approved !== true) throw new Error('Online enrollment authorization denied')
      const verifier = createVerifier(passphrase, identity, now)
      store.save({ version: 1, verifier, attempts: { failures: 0, lockedUntil: 0 } })
      return { enrolled: true, expiresAt: verifier.expiresAt }
    } finally { active = false }
  }
  function authenticate(passphrase, now = Date.now()) {
    if (active) throw new Error('Authentication operation already in progress')
    active = true
    try {
      const entry = store.load()
      if (!entry) return { authenticated: false, reason: 'not-enrolled' }
      const allowed = checkAttempt(entry.attempts, now)
      if (!allowed.allowed) return { authenticated: false, reason: 'locked', retryAfterMs: allowed.retryAfterMs }
      if (verifyPassphrase(passphrase, entry.verifier, now)) {
        store.save({ ...entry, attempts: recordSuccess(entry.attempts, now) })
        return { authenticated: true, identity: entry.verifier.identity }
      }
      // Persist failed attempts before returning; a failed save must throw
      // rather than silently allow unlimited retries.
      store.save({ ...entry, attempts: recordFailure(entry.attempts, now) })
      return { authenticated: false, reason: 'invalid-or-expired' }
    } finally { active = false }
  }
  return { beginEnrollment, enroll, authenticate }
}
module.exports = { createOfflineAuthService }
