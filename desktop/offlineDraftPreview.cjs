'use strict'
// Read-only pending-change preview. Only the authenticated owner's changes
// are overlaid; snapshot records remain unchanged and no cloud writes occur.
const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')
const ALLOWED = new Set(['orders', 'production_daily_entries'])
async function previewLocalDrafts({ directory, table, recordId, session, authenticateSession }) {
  if (!session || typeof session.identity !== 'string' || !session.identity ||
      typeof authenticateSession !== 'function' || await authenticateSession(session) !== true)
    throw new Error('Authenticated offline session required')
  if (!ALLOWED.has(table) || !['string','number'].includes(typeof recordId) ||
      !String(recordId) || String(recordId).length > 120)
    throw new Error('Unsupported record preview')
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Invalid database directory')
  const file = path.join(directory, 'nizamia-app2a.sqlite')
  const info = fs.lstatSync(file)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 50 * 1024 * 1024)
    throw new Error('Unsafe local database')
  const wasm = require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const db = new SQL.Database(fs.readFileSync(file))
  try {
    if (db.exec('PRAGMA quick_check')[0]?.values?.[0]?.[0] !== 'ok') throw new Error('SQLite integrity failure')
    const stmt = db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index')
    let record = null
    try {
      stmt.bind([table])
      while (stmt.step()) {
        const candidate = JSON.parse(stmt.get()[0])
        if (String(candidate.id) === String(recordId)) { record = candidate; break }
      }
    } finally { stmt.free() }
    if (!record) throw new Error('Record not found in local snapshot')
    const exists = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_draft_journal'")
    if (!exists.length) return { original: record, preview: record, pending: [] }
    const drafts = []
    const query = db.prepare("SELECT draft_id, draft_json, state FROM offline_draft_journal WHERE identity = ? AND table_name = ? AND record_id = ? ORDER BY created_at")
    try {
      query.bind([session.identity, table, String(recordId)])
      while (query.step()) {
        const [draftId, json, state] = query.get()
        if (drafts.length >= 100) throw new Error('Too many local drafts')
        const draft = JSON.parse(json)
        if (!draft || draft.draftId !== draftId || draft.table !== table || draft.recordId !== String(recordId) ||
            !draft.changes || typeof draft.changes !== 'object' || Array.isArray(draft.changes) ||
            Object.keys(draft.changes).some(key => !['notes','remarks'].includes(key) || typeof draft.changes[key] !== 'string'))
          throw new Error('Invalid pending draft data')
        drafts.push({ draftId, state, changes: draft.changes })
      }
    } finally { query.free() }
    const preview = { ...record }
    for (const draft of drafts) if (draft.state === 'pending') Object.assign(preview, draft.changes)
    return { original: record, preview, pending: drafts }
  } finally { db.close() }
}
module.exports = { previewLocalDrafts }
