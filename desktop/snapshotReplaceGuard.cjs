'use strict'
// Never replace an imported snapshot while unsynchronized local work exists.
// This runs before import begins and again immediately before atomic replacement.
function assertSnapshotReplaceSafe(db) {
  if (!db || typeof db.exec !== 'function') throw new Error('SQLite database required')
  const exists = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_draft_journal'")
  const standalone = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='standalone_records'")
  if (standalone.length) {
    const count = db.exec('SELECT COUNT(*) FROM standalone_records')[0]?.values?.[0]?.[0]
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid standalone record state')
    if (count > 0) throw new Error('Snapshot import blocked: '+count+' standalone offline record(s) are stored locally. Back up or safely migrate them before importing. No data was replaced.')
  }
  if (!exists.length) return
  const result = db.exec("SELECT COUNT(*) FROM offline_draft_journal WHERE state IN ('pending', 'conflict')")
  const count = result[0]?.values?.[0]?.[0]
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid draft journal state')
  if (count > 0) throw new Error('Snapshot import blocked: ' + count + ' unsynchronized or conflicted local draft(s) must be safely resolved first. No data was replaced.')
}
module.exports = { assertSnapshotReplaceSafe }
