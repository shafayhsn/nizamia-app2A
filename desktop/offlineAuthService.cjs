'use strict'
// Main-process-only coordinator. Not exposed over IPC or connected to a UI.
// Enrollment requires a trusted server-side authorization callback; never
// treat renderer claims, a local snapshot or legacy password hashes as proof.
const { createVerifier, verifyPassphrase } = require('./offlineAuthVerifier.cjs')
const { checkAttempt, recordFailure, recordSuccess } = require('./offlineLoginPolicy.cjs')
function createOfflineAuthService({ store, authorizeEnrollment }) {
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function' ||
      typeof authorizeEnrollment !== 'function') throw new Error('Trusted enrollment and encrypted storage are required')
  let active = false
  async function enroll({ identity, passphrase, onlineProof }, now = Date.now()) {
    if (active) throw new Error('Authentication operation already in progress')
    active = true
    try {
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
  return { enroll, authenticate }
}
module.exports = { createOfflineAuthService }
