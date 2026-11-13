'use strict'
// Main-process-only offline session lifecycle. No renderer-controlled permissions.
// A trusted permission resolver must obtain scoped permissions from a verified
// signed enrollment/authorization source, not the snapshot or renderer.
const crypto = require('node:crypto')
const MAX_SESSION_MS = 30 * 60 * 1000
const MAX_IDLE_MS = 10 * 60 * 1000
const ALLOWED = new Set(['offline:draft:orders', 'offline:draft:production_daily_entries'])
function createOfflineSessionManager({ authenticate, resolvePermissions, now = () => Date.now() }) {
  if (typeof authenticate !== 'function' || typeof resolvePermissions !== 'function' || typeof now !== 'function')
    throw new Error('Trusted authentication and permission resolver required')
  let current = null
  let busy = false
  function clear() { current = null }
  function check() {
    const time = now()
    if (!Number.isSafeInteger(time) || time <= 0) { clear(); throw new Error('Invalid system clock') }
    if (!current) return null
    if (time < current.issuedAt || time >= current.expiresAt || time - current.lastUsed >= MAX_IDLE_MS) {
      clear()
      return null
    }
    return current
  }
  async function login(passphrase) {
    if (busy) throw new Error('Authentication in progress')
    clear()
    busy = true
    try {
      const result = await authenticate(passphrase, now())
      if (!result || result.authenticated !== true || typeof result.identity !== 'string' || !result.identity)
        return { authenticated: false, reason: result?.reason || 'denied' }
      const permissions = await resolvePermissions(result.identity)
      if (!Array.isArray(permissions) || permissions.some(p => !ALLOWED.has(p)))
        throw new Error('Invalid trusted offline permissions')
      const issuedAt = now()
      if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new Error('Invalid system clock')
      current = {
        token: crypto.randomBytes(32).toString('hex'),
        identity: result.identity,
        permissions: [...new Set(permissions)],
        issuedAt, lastUsed: issuedAt, expiresAt: issuedAt + MAX_SESSION_MS
      }
      return { authenticated: true, identity: current.identity, expiresAt: current.expiresAt }
    } finally { busy = false }
  }
  function authorize(token, permission) {
    const session = check()
    if (!session || typeof token !== 'string' || token.length !== 64 ||
        !/^[a-f0-9]{64}$/.test(token) || !ALLOWED.has(permission)) return null
    if (!crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(session.token, 'hex')) ||
        !session.permissions.includes(permission)) return null
    session.lastUsed = now()
    return { authenticated: true, identity: session.identity, verifiedIdentity: session.identity,
      permissions: [...session.permissions] }
  }
  // Token is intentionally never returned by login. Only a trusted main-process
  // controller can receive it; do not expose this method to untrusted web content.
  function withTrustedSession(callback) {
    const session = check()
    if (!session) return null
    if (typeof callback !== 'function') throw new Error('Trusted callback required')
    return callback(session.token)
  }
  function status() {
    const session = check()
    return session ? { authenticated: true, identity: session.identity, expiresAt: session.expiresAt } : { authenticated: false }
  }
  return { login, authorize, withTrustedSession, logout: clear, status }
}
module.exports = { createOfflineSessionManager, MAX_SESSION_MS, MAX_IDLE_MS }
