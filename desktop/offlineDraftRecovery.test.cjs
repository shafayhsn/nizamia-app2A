'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const initSqlJs = require('sql.js')
const { buildDraftRecovery } = require('./offlineDraftRecovery.cjs')
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app2a-recovery-'))
  try {
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
    const db = new SQL.Database()
    db.run('CREATE TABLE offline_draft_journal (draft_id TEXT, identity TEXT, table_name TEXT, record_id TEXT, snapshot_hash TEXT, draft_json TEXT, state TEXT, created_at TEXT)')
    const draftId = '11111111-1111-4111-8111-111111111111'
    const draft = { draftId, table: 'orders', recordId: 'o1', snapshotHash: 'a'.repeat(64), before: { notes: 'old' }, changes: { notes: 'new' }, status: 'uncommitted' }
    for (const identity of ['owner', 'other']) db.run('INSERT INTO offline_draft_journal VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [draftId, identity, 'orders', 'o1', 'a'.repeat(64), JSON.stringify(draft), 'pending', '2026-11-13'])
    fs.writeFileSync(path.join(directory, 'nizamia-app2a.sqlite'), Buffer.from(db.export()))
    db.close()
    const args = { directory, session: { identity: 'owner' }, authenticateSession: async () => true }
    const result = await buildDraftRecovery(args)
    assert.equal(result.drafts.length, 1)
    assert.equal(result.drafts[0].changes.notes, 'new')
    assert.equal(result.format, 'nizamia-offline-draft-recovery-v1')
    await assert.rejects(buildDraftRecovery({ ...args, authenticateSession: async () => false }), /Authenticated/)
    process.stdout.write('Offline draft recovery tests passed.\n')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
