'use strict'
// Pure sync planner. No network or database writes. A trusted sync coordinator
// must independently authenticate the user and authorize each cloud mutation.
const crypto = require('node:crypto')
const FIELDS = Object.freeze({
  orders: Object.freeze(['notes', 'remarks']),
  production_daily_entries: Object.freeze(['notes', 'remarks'])
})
const MAX_BATCH = 100
function canonical(v) { return v === undefined ? null : v }
function validateDraft(d) {
  if (!d || d.status !== 'uncommitted' || !Object.hasOwn(FIELDS, d.table) ||
      typeof d.draftId !== 'string' || !/^[a-f0-9-]{36}$/i.test(d.draftId) ||
      typeof d.recordId !== 'string' || !d.recordId || d.recordId.length > 120 ||
      typeof d.snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(d.snapshotHash) ||
      !d.before || !d.changes || typeof d.before !== 'object' || typeof d.changes !== 'object' ||
      Array.isArray(d.before) || Array.isArray(d.changes)) throw new Error('Invalid offline draft')
  const fields = Object.keys(d.changes)
  if (!fields.length || fields.length > 2 || fields.some(f => !FIELDS[d.table].includes(f) ||
      !Object.hasOwn(d.before, f) || typeof d.changes[f] !== 'string' || d.changes[f].length > 2000 ||
      (d.before[f] !== null && typeof d.before[f] !== 'string'))) throw new Error('Unsupported draft fields')
  return fields
}
function planDraft(draft, cloudRecord, { identity, authorizedTables = [] } = {}) {
  const fields = validateDraft(draft)
  if (typeof identity !== 'string' || !identity || !Array.isArray(authorizedTables) ||
      !authorizedTables.includes(draft.table)) return { decision: 'blocked', reason: 'unauthorized' }
  if (!cloudRecord || typeof cloudRecord !== 'object' || Array.isArray(cloudRecord) ||
      String(cloudRecord.id) !== draft.recordId) return { decision: 'conflict', reason: 'record-missing' }
  for (const field of fields) {
    if (canonical(cloudRecord[field]) !== canonical(draft.before[field]))
      return { decision: 'conflict', reason: 'cloud-field-changed', field }
  }
  return {
    decision: 'ready',
    table: draft.table, recordId: draft.recordId, draftId: draft.draftId,
    changes: Object.fromEntries(fields.map(f => [f, draft.changes[f]])),
    expected: Object.fromEntries(fields.map(f => [f, draft.before[f]]))
  }
}
function planBatch(items, cloudRecords, authorization) {
  if (!Array.isArray(items) || items.length > MAX_BATCH || !(cloudRecords instanceof Map))
    throw new Error('Invalid sync batch')
  const seen = new Set()
  return items.map(item => {
    if (!item || typeof item.identity !== 'string' || item.identity !== authorization?.identity)
      return { draftId: item?.draft?.draftId ?? null, decision: 'blocked', reason: 'identity-mismatch' }
    const d = item.draft
    const fields = validateDraft(d)
    const key = d.table + ':' + d.recordId
    if (fields.some(f => seen.has(key + ':' + f)))
      return { draftId: d.draftId, decision: 'conflict', reason: 'overlapping-batch-fields' }
    fields.forEach(f => seen.add(key + ':' + f))
    return planDraft(d, cloudRecords.get(key), authorization)
  })
}
// Stable idempotency key for a trusted server-side apply endpoint.
function operationId(draft) {
  validateDraft(draft)
  return crypto.createHash('sha256').update('app2a-offline-draft-v1:' + draft.draftId).digest('hex')
}
module.exports = { planDraft, planBatch, operationId, validateDraft }
