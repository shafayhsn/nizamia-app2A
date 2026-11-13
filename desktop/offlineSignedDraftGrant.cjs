'use strict'
// Independently verify a short-lived backend-signed editing grant.
// Neither a renderer claim nor a snapshot role can authorize a draft.
const crypto = require('node:crypto')
const AUDIENCE = 'nizamia-app2a-offline-draft-v1'
const MAX_MS = 10 * 60 * 1000
const ALLOWED = new Set(['offline:draft:orders','offline:draft:production_daily_entries'])
function verifySignedDraftGrant({ proof, identity, snapshotHash, publicKey, now = Date.now() }) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof) ||
      typeof identity !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(identity) ||
      typeof snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(snapshotHash) ||
      !Number.isSafeInteger(now) || now <= 0) return null
  const { claims, signature } = proof
  if (!claims || typeof claims !== 'object' || Array.isArray(claims) ||
      Object.keys(claims).sort().join(',') !== 'audience,expiresAt,identity,issuedAt,permissions,snapshotHash' ||
      claims.audience !== AUDIENCE || claims.identity !== identity || claims.snapshotHash !== snapshotHash ||
      !Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt) ||
      claims.issuedAt > now || claims.expiresAt <= now || claims.expiresAt <= claims.issuedAt ||
      claims.expiresAt - claims.issuedAt > MAX_MS ||
      !Array.isArray(claims.permissions) || !claims.permissions.length ||
      claims.permissions.length > 2 || new Set(claims.permissions).size !== claims.permissions.length ||
      claims.permissions.some(p => !ALLOWED.has(p)) ||
      typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return null
  try {
    const key = publicKey instanceof crypto.KeyObject && publicKey.type === 'public'
      ? publicKey : crypto.createPublicKey(publicKey)
    if (key.asymmetricKeyType !== 'ed25519') return null
    const canonical = JSON.stringify([claims.audience, claims.identity, claims.snapshotHash,
      claims.permissions, claims.issuedAt, claims.expiresAt])
    if (!crypto.verify(null, Buffer.from(canonical), key, Buffer.from(signature,'base64url'))) return null
    return Object.freeze({ identity, snapshotHash, permissions: Object.freeze([...claims.permissions]),
      issuedAt: claims.issuedAt, expiresAt: claims.expiresAt })
  } catch { return null }
}
module.exports = { verifySignedDraftGrant, AUDIENCE, MAX_MS }
