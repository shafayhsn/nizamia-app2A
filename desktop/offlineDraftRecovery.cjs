'use strict'
// Authenticated, owner-scoped recovery export. This is NOT a cloud sync payload.
const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')
const { validateDraft } = require('./offlineSyncPlanner.cjs')
async function buildDraftRecovery({ directory, session, authenticateSession }) {
  if (!session || typeof session.identity !== 'string' || !session.identity ||
      typeof authenticateSession !== 'function' || await authenticateSession(session) !== true)
    throw new Error('Authenticated offline session required')
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Invalid database directory')
  const file = path.join(directory, 'nizamia-app2a.sqlite')
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 * 1024)
    throw new Error('Unsafe local database')
  const wasm = require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const db = new SQL.Database(fs.readFileSync(file))
  try {
    if (db.exec('PRAGMA quick_check')[0]?.values?.[0]?.[0] !== 'ok') throw new Error('SQLite integrity failure')
    const present = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='offline_draft_journal'")
    const drafts = []
    if (present.length) {
      const stmt = db.prepare("SELECT draft_id, table_name, record_id, state, draft_json FROM offline_draft_journal WHERE identity = ? ORDER BY created_at LIMIT 1001")
      try {
        stmt.bind([session.identity])
        while (stmt.step()) {
          if (drafts.length >= 1000) throw new Error('Draft recovery export limit exceeded')
          const [id, table, recordId, state, json] = stmt.get()
          const draft = JSON.parse(json)
          validateDraft(draft)
          if (draft.draftId !== id || draft.table !== table || draft.recordId !== recordId ||
              !['pending', 'conflict'].includes(state)) throw new Error('Invalid draft journal entry')
          drafts.push({ ...draft, state })
        }
      } finally { stmt.free() }
    }
    return {
      format: 'nizamia-offline-draft-recovery-v1',
      warning: 'Contains private business notes. Recovery copy only; importing and cloud synchronization are not supported.',
      identity: session.identity, exportedAt: new Date().toISOString(), drafts
    }
  } finally { db.close() }
}
module.exports = { buildDraftRecovery }
