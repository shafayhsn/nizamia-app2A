'use strict'
// Offline edit validation foundation. Pure functions; no database, IPC or cloud writes.
// Drafts must not be persisted or synchronized until local authentication and
// per-field authorization are implemented.
const crypto = require('node:crypto')
const TABLES = Object.freeze({
  orders: Object.freeze(['remarks', 'notes']),
  production_daily_entries: Object.freeze(['remarks', 'notes'])
})
const FORBIDDEN = /password|token|secret|credential|session|permission|role|auth|api_key/i
function makeDraft({ table, record, changes, snapshotHash }) {
  if (!Object.hasOwn(TABLES, table)) throw new Error('Unsupported offline draft table')
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.id == null) throw new Error('A saved record identifier is required')
  if (typeof snapshotHash !== 'string' || !/^[a-f0-9]{64}$/i.test(snapshotHash)) throw new Error('Verified snapshot fingerprint required')
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Invalid changes')
  const entries = Object.entries(changes)
  if (!entries.length || entries.length > 2) throw new Error('Invalid draft field count')
  for (const [key, value] of entries) {
    if (FORBIDDEN.test(key) || !TABLES[table].includes(key)) throw new Error('Field is not approved for offline drafting')
    if (typeof value !== 'string' || value.length > 2000) throw new Error('Draft text must be at most 2000 characters')
  }
  const before = Object.fromEntries(entries.map(([key]) => [key, record[key] ?? null]))
  return Object.freeze({
    draftId: crypto.randomUUID(),
    table, recordId: String(record.id), snapshotHash: snapshotHash.toLowerCase(),
    before, changes: Object.fromEntries(entries),
    createdAt: new Date().toISOString(),
    status: 'uncommitted'
  })
}
function checkDraftConflict(draft, currentRecord, currentSnapshotHash) {
  if (!draft || draft.status !== 'uncommitted') throw new Error('Invalid draft')
  if (currentSnapshotHash !== draft.snapshotHash) return { safe: false, reason: 'snapshot-changed' }
  if (!currentRecord || String(currentRecord.id) !== draft.recordId) return { safe: false, reason: 'record-missing' }
  for (const [field, oldValue] of Object.entries(draft.before)) {
    if ((currentRecord[field] ?? null) !== oldValue) return { safe: false, reason: 'field-changed', field }
  }
  return { safe: true }
}
module.exports = { makeDraft, checkDraftConflict }
