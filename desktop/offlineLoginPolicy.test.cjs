'use strict'
const assert = require('node:assert/strict')
const { checkAttempt, recordFailure, recordSuccess, MAX_FAILURES, LOCK_MS } = require('./offlineLoginPolicy.cjs')
const now = 1800000000000
let state = null
for (let i = 0; i < MAX_FAILURES; i++) state = recordFailure(state, now + i)
assert.equal(state.failures, MAX_FAILURES)
assert.equal(checkAttempt(state, now + MAX_FAILURES).allowed, false)
assert.equal(checkAttempt(state, now + MAX_FAILURES).retryAfterMs, LOCK_MS - 1)
assert.deepEqual(recordFailure(state, now + 10), state, 'Locked attempts cannot extend or clear the lockout')
assert.throws(() => recordSuccess(state, now + 10), /lockout/)
assert.equal(checkAttempt(state, state.lockedUntil).allowed, true)
assert.deepEqual(recordSuccess(state, state.lockedUntil), { failures: 0, lockedUntil: 0 })
assert.deepEqual(recordFailure({ failures: 1, lockedUntil: 0 }, now), { failures: 2, lockedUntil: 0 })
assert.throws(() => checkAttempt({ failures: -1, lockedUntil: 0 }, now))
assert.throws(() => checkAttempt(null, -1))
process.stdout.write('CP-18 offline login lockout policy tests passed.\n')
