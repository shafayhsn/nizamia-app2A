'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const initSqlJs = require('sql.js')
const { previewLocalDrafts } = require('./offlineDraftPreview.cjs')
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app2a-preview-'))
  try {
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
    const db = new SQL.Database()
    db.run('CREATE TABLE snapshot_rows (table_name TEXT, row_index INTEGER, row_json TEXT)')
    db.run('CREATE TABLE offline_draft_journal (draft_id TEXT, identity TEXT, table_name TEXT, record_id TEXT, snapshot_hash TEXT, draft_json TEXT, state TEXT, created_at TEXT)')
    db.run('INSERT INTO snapshot_rows VALUES (?, ?, ?)', ['orders', 0, JSON.stringify({ id: 'o1', notes: 'Original', remarks: 'Unchanged' })])
    const id = '11111111-1111-4111-8111-111111111111'
    const draft = { draftId: id, table: 'orders', recordId: 'o1', changes: { notes: 'Pending update' } }
    db.run('INSERT INTO offline_draft_journal VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, 'user1', 'orders', 'o1', 'hash', JSON.stringify(draft), 'pending', '2026-11-13'])
    fs.writeFileSync(path.join(dir, 'nizamia-app2a.sqlite'), Buffer.from(db.export()))
    db.close()
    const base = { directory: dir, table: 'orders', recordId: 'o1', session: { identity: 'user1' }, authenticateSession: async () => true }
    const result = await previewLocalDrafts(base)
    assert.equal(result.original.notes, 'Original')
    assert.equal(result.preview.notes, 'Pending update')
    assert.equal(result.preview.remarks, 'Unchanged')
    assert.equal(result.pending.length, 1)
    const other = await previewLocalDrafts({ ...base, session: { identity: 'user2' } })
    assert.equal(other.preview.notes, 'Original')
    assert.equal(other.pending.length, 0)
    await assert.rejects(previewLocalDrafts({ ...base, authenticateSession: async () => false }), /Authenticated/)
    await assert.rejects(previewLocalDrafts({ ...base, table: 'users' }), /Unsupported/)
    process.stdout.write('Offline draft preview tests passed: overlay, owner isolation, fail-closed authentication.\n')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
