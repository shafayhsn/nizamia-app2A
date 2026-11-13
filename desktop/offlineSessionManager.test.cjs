'use strict'
const assert = require('node:assert/strict')
const { createOfflineSessionManager, MAX_IDLE_MS, MAX_SESSION_MS } = require('./offlineSessionManager.cjs')
async function main() {
  let time = 1800000000000
  let pass = 'correct'
  const service = createOfflineSessionManager({
    now: () => time,
    authenticate: async supplied => supplied === pass
      ? { authenticated: true, identity: 'worker1' }
      : { authenticated: false, reason: 'invalid-or-expired' },
    resolvePermissions: async identity => identity === 'worker1' ? ['offline:draft:orders'] : []
  })
  assert.equal(service.status().authenticated, false)
  assert.equal((await service.login('wrong')).authenticated, false)
  assert.equal((await service.login(pass)).authenticated, true)
  assert.equal(service.status().identity, 'worker1')
  const token = service.withTrustedSession(t => t)
  assert.equal(typeof token, 'string')
  assert.equal(service.authorize('0'.repeat(64), 'offline:draft:orders'), null)
  assert.equal(service.authorize(token, 'offline:draft:production_daily_entries'), null)
  assert.equal(service.authorize(token, 'offline:draft:orders').identity, 'worker1')
  time += MAX_IDLE_MS - 1
  assert.ok(service.authorize(token, 'offline:draft:orders'))
  time += MAX_IDLE_MS
  assert.equal(service.authorize(token, 'offline:draft:orders'), null)
  assert.equal(service.status().authenticated, false)
  await service.login(pass)
  const newToken = service.withTrustedSession(t => t)
  assert.notEqual(token, newToken)
  time += MAX_SESSION_MS
  assert.equal(service.authorize(newToken, 'offline:draft:orders'), null)
  await service.login(pass)
  service.logout()
  assert.equal(service.status().authenticated, false)
  await service.login(pass)
  time -= 1
  assert.equal(service.status().authenticated, false)
  const denied = createOfflineSessionManager({ now: () => time,
    authenticate: async () => ({ authenticated: true, identity: 'worker1' }),
    resolvePermissions: async () => ['offline:admin'] })
  await assert.rejects(denied.login('anything'), /Invalid trusted offline permissions/)
  assert.equal(denied.status().authenticated, false)
  process.stdout.write('Offline session manager tests passed: login, permissions, token, idle and absolute expiry, logout, clock rollback.\n')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
