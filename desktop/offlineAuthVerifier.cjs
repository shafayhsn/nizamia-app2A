'use strict'
// Local verifier primitives only. Enrollment must require a verified online session,
// explicit authorization and an OS-protected secret store before this is connected to UI.
const crypto = require('node:crypto')
const ITERATIONS = 210000
const KEY_BYTES = 32
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
function validatePassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256)
    throw new Error('Offline passphrase must contain 12–256 characters')
}
function derive(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_BYTES, 'sha256')
}
function createVerifier(passphrase, identity, now = Date.now()) {
  validatePassphrase(passphrase)
  if (typeof identity !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(identity))
    throw new Error('Invalid verified identity')
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid enrollment time')
  const salt = crypto.randomBytes(32)
  return {
    version: 1, identity, enrolledAt: now, expiresAt: now + MAX_AGE_MS,
    algorithm: 'pbkdf2-sha256', iterations: ITERATIONS,
    salt: salt.toString('hex'), verifier: derive(passphrase, salt).toString('hex')
  }
}
function verifyPassphrase(passphrase, entry, now = Date.now()) {
  if (!entry || entry.version !== 1 || entry.algorithm !== 'pbkdf2-sha256' ||
      entry.iterations !== ITERATIONS || !Number.isSafeInteger(entry.enrolledAt) ||
      !Number.isSafeInteger(entry.expiresAt) || entry.expiresAt !== entry.enrolledAt + MAX_AGE_MS ||
      !Number.isSafeInteger(now) || now < entry.enrolledAt || now >= entry.expiresAt ||
      typeof entry.salt !== 'string' || !/^[a-f0-9]{64}$/.test(entry.salt) ||
      typeof entry.verifier !== 'string' || !/^[a-f0-9]{64}$/.test(entry.verifier) ||
      typeof passphrase !== 'string' || passphrase.length > 256) return false
  const actual = derive(passphrase, Buffer.from(entry.salt, 'hex'))
  return crypto.timingSafeEqual(actual, Buffer.from(entry.verifier, 'hex'))
}
module.exports = { createVerifier, verifyPassphrase, MAX_AGE_MS }
