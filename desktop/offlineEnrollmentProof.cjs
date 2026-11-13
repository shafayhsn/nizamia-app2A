'use strict'
// Verify backend-signed, short-lived offline enrollment authorization.
// Public key must be pinned in the trusted desktop main process, never
// supplied by the renderer or read from the snapshot database.
const crypto = require('node:crypto')
const AUDIENCE = 'nizamia-app2a-offline-enrollment-v1'
const MAX_LIFETIME_MS = 5 * 60 * 1000
function verifyEnrollmentProof({ proof, identity, nonce, publicKey, now = Date.now() }) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) ||
      typeof identity !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(identity) ||
      typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce) ||
      !Number.isSafeInteger(now) || now <= 0) return false
  const { claims, signature } = proof
  if (!claims || typeof claims !== 'object' || Array.isArray(claims) ||
      Object.keys(claims).sort().join(',') !== 'audience,expiresAt,identity,issuedAt,nonce' ||
      claims.audience !== AUDIENCE || claims.identity !== identity || claims.nonce !== nonce ||
      !Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt) ||
      claims.issuedAt > now || claims.expiresAt <= now ||
      claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt - claims.issuedAt > MAX_LIFETIME_MS ||
      typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false
  try {
    const key = crypto.createPublicKey(publicKey)
    if (key.asymmetricKeyType !== 'ed25519') return false
    const canonical = JSON.stringify([claims.audience, claims.identity, claims.nonce, claims.issuedAt, claims.expiresAt])
    return crypto.verify(null, Buffer.from(canonical), key, Buffer.from(signature, 'base64url'))
  } catch { return false }
}
module.exports = { verifyEnrollmentProof, AUDIENCE, MAX_LIFETIME_MS }
