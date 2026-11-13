'use strict'
// CP-18 automated offline snapshot tests; no Supabase connection or production writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const initSqlJs = require('sql.js')

async function main() {
  const SQL = await initSqlJs({
    locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm')
  })
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app2a-offline-test-'))
  try {
    const file = path.join(directory, 'nizamia-app2a.sqlite')
    const db = new SQL.Database()
    db.run('CREATE TABLE app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)')
    db.run('CREATE TABLE snapshot_manifest (table_name TEXT PRIMARY KEY NOT NULL, row_count INTEGER NOT NULL)')
    db.run('CREATE TABLE snapshot_rows (table_name TEXT NOT NULL, row_index INTEGER NOT NULL, row_json TEXT NOT NULL, PRIMARY KEY (table_name, row_index))')
    db.run('INSERT INTO snapshot_manifest (table_name, row_count) VALUES (?, ?)', ['orders', 2])
    db.run('INSERT INTO snapshot_manifest (table_name, row_count) VALUES (?, ?)', ['buyers', 1])
    db.run('INSERT INTO snapshot_rows VALUES (?, ?, ?)', ['orders', 0, JSON.stringify({ id: 'o-1', buyer_name: 'Example Buyer' })])
    db.run('INSERT INTO snapshot_rows VALUES (?, ?, ?)', ['orders', 1, JSON.stringify({ id: 'o-2' })])
    db.run('INSERT INTO snapshot_rows VALUES (?, ?, ?)', ['buyers', 0, JSON.stringify({ id: 'b-1' })])
    fs.writeFileSync(file, Buffer.from(db.export()))
    db.close()
    const opened = new SQL.Database(fs.readFileSync(file))
    assert.equal(opened.exec('PRAGMA integrity_check')[0].values[0][0], 'ok')
    const manifest = opened.exec('SELECT table_name, row_count FROM snapshot_manifest ORDER BY table_name')[0].values
    assert.deepEqual(manifest, [['buyers', 1], ['orders', 2]])
    for (const [name, count] of manifest) {
      const rows = opened.exec('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index', [name])[0]?.values || []
      assert.equal(rows.length, count)
      for (const [json] of rows) assert.equal(typeof JSON.parse(json), 'object')
    }
    assert.equal(opened.exec('SELECT COUNT(*) FROM snapshot_rows')[0].values[0][0], 3)
    opened.close()
    process.stdout.write('CP-18 offline SQLite smoke tests passed: integrity, manifest, JSON records, and persistence.\n')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
