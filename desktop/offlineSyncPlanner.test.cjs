'use strict'
const assert = require('node:assert/strict')
const { planDraft, planBatch, operationId } = require('./offlineSyncPlanner.cjs')
const draft = Object.freeze({
  draftId: '11111111-1111-4111-8111-111111111111',
  table: 'orders', recordId: 'o1', snapshotHash: 'a'.repeat(64),
  status: 'uncommitted', before: { notes: 'old' }, changes: { notes: 'new' }
})
const auth = { identity: 'worker', authorizedTables: ['orders'] }
assert.deepEqual(planDraft(draft, { id: 'o1', notes: 'old' }, auth), {
  decision: 'ready', table: 'orders', recordId: 'o1', draftId: draft.draftId,
  changes: { notes: 'new' }, expected: { notes: 'old' }
})
assert.equal(planDraft(draft, { id: 'o1', notes: 'other' }, auth).reason, 'cloud-field-changed')
assert.equal(planDraft(draft, null, auth).reason, 'record-missing')
assert.equal(planDraft(draft, { id: 'o1', notes: 'old' }, {}).reason, 'unauthorized')
assert.throws(() => planDraft({ ...draft, table: 'users' }, {}, auth), /Invalid offline draft/)
assert.throws(() => planDraft({ ...draft, changes: { password_hash: 'x' }, before: { password_hash: null } }, {}, auth), /Unsupported draft fields/)
const second = { ...draft, draftId: '22222222-2222-4222-8222-222222222222' }
const cloud = new Map([['orders:o1', { id: 'o1', notes: 'old' }]])
const batch = planBatch([{ identity: 'worker', draft }, { identity: 'worker', draft: second }], cloud, auth)
assert.equal(batch[0].decision, 'ready')
assert.equal(batch[1].reason, 'overlapping-batch-fields')
assert.equal(planBatch([{ identity: 'other', draft }], cloud, auth)[0].reason, 'identity-mismatch')
assert.equal(operationId(draft), operationId(draft))
assert.notEqual(operationId(draft), operationId(second))
assert.throws(() => planBatch(new Array(101).fill({ identity: 'worker', draft }), cloud, auth), /Invalid sync batch/)
process.stdout.write('Offline sync planner tests passed: authorization, conflicts, idempotency, bounded batches.\n')
