'use strict'
// Pure offline login attempt policy. The caller must persist this state in a
// tamper-resistant OS-backed store; this module does not enable authentication.
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000
function validTime(now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid time')
}
function normalize(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { failures: 0, lockedUntil: 0 }
  const { failures, lockedUntil } = state
  if (!Number.isInteger(failures) || failures < 0 || failures > MAX_FAILURES ||
      !Number.isSafeInteger(lockedUntil) || lockedUntil < 0)
    throw new Error('Invalid login attempt state')
  return { failures, lockedUntil }
}
function checkAttempt(state, now = Date.now()) {
  validTime(now)
  const current = normalize(state)
  if (current.lockedUntil > now) return { allowed: false, retryAfterMs: current.lockedUntil - now }
  return { allowed: true, retryAfterMs: 0 }
}
function recordFailure(state, now = Date.now()) {
  validTime(now)
  const current = normalize(state)
  if (current.lockedUntil > now) return current
  const failures = Math.min(MAX_FAILURES, current.failures + 1)
  return { failures, lockedUntil: failures >= MAX_FAILURES ? now + LOCK_MS : 0 }
}
function recordSuccess(state, now = Date.now()) {
  if (!checkAttempt(state, now).allowed) throw new Error('Cannot reset an active lockout')
  return { failures: 0, lockedUntil: 0 }
}
module.exports = { checkAttempt, recordFailure, recordSuccess, MAX_FAILURES, LOCK_MS }
