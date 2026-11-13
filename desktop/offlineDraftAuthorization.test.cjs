'use strict'
const assert = require('node:assert/strict')
const { makeDraft } = require('./offlineDraft.cjs')
const { authorizedDraft, MAX_GRANT_AGE_MS } = require('./offlineDraftAuthorization.cjs')
const now = 1800000000000
const hash = 'a'.repeat(64)
const draft = makeDraft({ table: 'orders', record: { id: 1, notes: 'old' }, changes: { notes: 'new' }, snapshotHash: hash })
const permission = 'offline:draft:orders'
const grant = { identity: 'operator_1', issuedAt: now - 1000, expiresAt: now + 60000, snapshotHash: hash, permissions: [permission] }
const session = { identity: 'operator_1', verifiedIdentity: 'operator_1', authenticated: true, permissions: [permission] }
assert.equal(authorizedDraft(draft, grant, session, now), true)
assert.equal(authorizedDraft(draft, null, session, now), false)
assert.equal(authorizedDraft(draft, grant, null, now), false)
assert.equal(authorizedDraft(draft, { ...grant, identity: 'other' }, session, now), false)
assert.equal(authorizedDraft(draft, grant, { ...session, authenticated: false }, now), false)
assert.equal(authorizedDraft(draft, grant, { ...session, permissions: [] }, now), false)
assert.equal(authorizedDraft(draft, { ...grant, permissions: [] }, session, now), false)
assert.equal(authorizedDraft(draft, { ...grant, snapshotHash: 'b'.repeat(64) }, session, now), false)
assert.equal(authorizedDraft(draft, { ...grant, expiresAt: now }, session, now), false)
assert.equal(authorizedDraft(draft, { ...grant, expiresAt: now + MAX_GRANT_AGE_MS + 1, issuedAt: now }, session, now), false)
assert.equal(authorizedDraft({ ...draft, changes: { quantity: 100 } }, grant, session, now), false)
assert.equal(authorizedDraft({ ...draft, status: 'committed' }, grant, session, now), false)
process.stdout.write('CP-18 draft authorization policy tests passed.\n')
