'use strict'
// Deny-by-default local draft authorization. Grants must originate from a
// trusted online authorization flow, be bound to an identity and expire.
// This module cannot issue grants and does not enable editing or sync.
const crypto = require('node:crypto')
const MAX_GRANT_AGE_MS = 24 * 60 * 60 * 1000
const FIELD_ALLOWLIST = Object.freeze({
  orders: Object.freeze(['notes', 'remarks']),
  production_daily_entries: Object.freeze(['notes', 'remarks'])
})
function authorizedDraft(draft, grant, session, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now <= 0) return false
  if (!draft || !grant || !session || typeof draft !== 'object' ||
      typeof grant !== 'object' || typeof session !== 'object') return false
  if (draft.status !== 'uncommitted' || !Object.hasOwn(FIELD_ALLOWLIST, draft.table) ||
      !draft.changes || typeof draft.changes !== 'object' || Array.isArray(draft.changes)) return false
  const fields = Object.keys(draft.changes)
  if (!fields.length || !fields.every(f => FIELD_ALLOWLIST[draft.table].includes(f))) return false
  if (typeof grant.identity !== 'string' || !grant.identity ||
      grant.identity !== session.identity || grant.identity !== session.verifiedIdentity ||
      session.authenticated !== true) return false
  if (!Number.isSafeInteger(grant.issuedAt) || !Number.isSafeInteger(grant.expiresAt) ||
      grant.issuedAt > now || grant.expiresAt <= now ||
      grant.expiresAt <= grant.issuedAt || grant.expiresAt - grant.issuedAt > MAX_GRANT_AGE_MS) return false
  if (!Array.isArray(grant.permissions) || !grant.permissions.includes('offline:draft:' + draft.table)) return false
  if (!Array.isArray(session.permissions) || !session.permissions.includes('offline:draft:' + draft.table)) return false
  if (typeof grant.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(grant.snapshotHash) ||
      grant.snapshotHash !== draft.snapshotHash) return false
  // A caller must authenticate the grant and session before invoking this policy.
  // Matching fields alone are NOT proof of a trusted issuer.
  return true
}
module.exports = { authorizedDraft, MAX_GRANT_AGE_MS }
