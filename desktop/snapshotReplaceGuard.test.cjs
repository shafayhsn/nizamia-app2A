'use strict'
const assert = require('node:assert/strict')
const initSqlJs = require('sql.js')
const { assertSnapshotReplaceSafe } = require('./snapshotReplaceGuard.cjs')
async function main() {
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
  const db = new SQL.Database()
  try {
    assert.doesNotThrow(() => assertSnapshotReplaceSafe(db))
    db.run("CREATE TABLE offline_draft_journal (draft_id TEXT PRIMARY KEY, state TEXT)")
    assert.doesNotThrow(() => assertSnapshotReplaceSafe(db))
    db.run("INSERT INTO offline_draft_journal VALUES ('a', 'pending')")
    assert.throws(() => assertSnapshotReplaceSafe(db), /Snapshot import blocked: 1/)
    db.run("UPDATE offline_draft_journal SET state = 'conflict'")
    assert.throws(() => assertSnapshotReplaceSafe(db), /Snapshot import blocked: 1/)
    db.run("DELETE FROM offline_draft_journal")
    assert.doesNotThrow(() => assertSnapshotReplaceSafe(db))
    db.run('CREATE TABLE standalone_records (id TEXT PRIMARY KEY, table_name TEXT, fields_json TEXT, created_at TEXT, updated_at TEXT)')
    db.run("INSERT INTO standalone_records VALUES ('local-1','orders','{}','now','now')")
    assert.throws(()=>assertSnapshotReplaceSafe(db),/standalone offline record/)
    db.run('DELETE FROM standalone_records')
    assert.doesNotThrow(()=>assertSnapshotReplaceSafe(db))
    process.stdout.write('Snapshot replacement guard tests passed: pending/conflict edits block import.\n')
  } finally { db.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
