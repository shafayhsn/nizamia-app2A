'use strict'
const assert = require('node:assert/strict')
const { createOfflineAuthService } = require('./offlineAuthService.cjs')
const now = 1800000000000
let saved = null
let saves = 0
const store = { load: () => saved, save: entry => { saved = structuredClone(entry); saves++ } }
const denied = createOfflineAuthService({ store, authorizeEnrollment: async () => false })
async function run() {
  await assert.rejects(denied.enroll({ identity: 'worker_1', passphrase: 'a sufficiently long passphrase', onlineProof: 'fake' }, now), /denied/)
  assert.equal(saved, null)
  const service = createOfflineAuthService({ store, authorizeEnrollment: async ({ identity, onlineProof }) => identity === 'worker_1' && onlineProof === 'trusted-test-fixture' })
  await service.enroll({ identity: 'worker_1', passphrase: 'a sufficiently long passphrase', onlineProof: 'trusted-test-fixture' }, now)
  assert.equal(saved.verifier.identity, 'worker_1')
  assert.equal(JSON.stringify(saved).includes('a sufficiently long passphrase'), false)
  for (let i = 0; i < 5; i++) assert.equal(service.authenticate('incorrect passphrase', now + i + 1).authenticated, false)
  assert.equal(saved.attempts.failures, 5)
  assert.equal(service.authenticate('a sufficiently long passphrase', now + 10).reason, 'locked')
  assert.equal(service.authenticate('a sufficiently long passphrase', now + 15 * 60 * 1000 + 10).authenticated, true)
  assert.deepEqual(saved.attempts, { failures: 0, lockedUntil: 0 })
  assert.equal(service.authenticate('a sufficiently long passphrase', now + 8 * 24 * 60 * 60 * 1000).authenticated, false)
  assert.ok(saves >= 7)
  process.stdout.write('CP-18 integrated offline authentication coordinator tests passed.\n')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
