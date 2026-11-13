'use strict'
// Server-only issuer. Never import into Electron or browser bundles.
// Authentication/authorization callbacks MUST verify the live server session.
const crypto = require('node:crypto')
const ENROLL_AUD = 'nizamia-app2a-offline-enrollment-v1'
const DRAFT_AUD = 'nizamia-app2a-offline-draft-v1'
const PERMISSIONS = new Set(['offline:draft:orders','offline:draft:production_daily_entries'])
function createOfflineGrantIssuer({ privateKey, authorize, now = () => Date.now() }) {
  if (typeof authorize !== 'function' || typeof now !== 'function') throw new Error('Trusted authorization callback required')
  const key = privateKey instanceof crypto.KeyObject && privateKey.type === 'private'
    ? privateKey : crypto.createPrivateKey(privateKey)
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Ed25519 signing key required')
  function clock() {
    const t = now()
    if (!Number.isSafeInteger(t) || t <= 0) throw new Error('Invalid server clock')
    return t
  }
  function sign(claims, fields) {
    const payload = JSON.stringify(fields.map(field => claims[field]))
    return { claims, signature: crypto.sign(null, Buffer.from(payload), key).toString('base64url') }
  }
  async function enrollment({ session, identity, nonce }) {
    if (typeof identity !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(identity) ||
        typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce))
      throw new Error('Invalid enrollment request')
    if (await authorize({ session, identity, purpose:'enrollment' }) !== true)
      throw new Error('Enrollment authorization denied')
    const issuedAt = clock()
    const claims = { audience:ENROLL_AUD, identity, nonce, issuedAt, expiresAt:issuedAt + 5 * 60 * 1000 }
    return sign(claims, ['audience','identity','nonce','issuedAt','expiresAt'])
  }
  async function draft({ session, identity, snapshotHash, permissions }) {
    if (typeof identity !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(identity) ||
        typeof snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(snapshotHash) ||
        !Array.isArray(permissions) || !permissions.length || permissions.length > 2 ||
        new Set(permissions).size !== permissions.length || permissions.some(p => !PERMISSIONS.has(p)))
      throw new Error('Invalid draft grant request')
    if (await authorize({ session, identity, purpose:'draft', permissions, snapshotHash }) !== true)
      throw new Error('Draft authorization denied')
    const issuedAt = clock()
    const claims = { audience:DRAFT_AUD, identity, snapshotHash, permissions:[...permissions],
      issuedAt, expiresAt:issuedAt + 10 * 60 * 1000 }
    return sign(claims, ['audience','identity','snapshotHash','permissions','issuedAt','expiresAt'])
  }
  return Object.freeze({ enrollment, draft })
}
module.exports = { createOfflineGrantIssuer }
