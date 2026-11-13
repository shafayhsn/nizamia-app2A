'use strict'
const assert = require('node:assert/strict')
const initSqlJs = require('sql.js')
const { csvFromRows, selectSnapshotRows } = require('./offlineCsvExport.cjs')
async function main() {
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
  const db = new SQL.Database()
  try {
    db.run('CREATE TABLE snapshot_manifest (table_name TEXT, row_count INTEGER)')
    db.run('CREATE TABLE snapshot_rows (table_name TEXT, row_index INTEGER, row_json TEXT)')
    db.run("INSERT INTO snapshot_manifest VALUES ('orders', 3)")
    const rows = [
      { id: 'o1', notes: '=1+1', department: 'Cutting', amount: 5 },
      { id: 'o2', notes: '+SUM(A1:A2)', department: 'Sewing', amount: 10 },
      { id: 'o3', notes: 'hello, "world"', department: 'Cutting', amount: 0 }
    ]
    rows.forEach((row, i) => db.run('INSERT INTO snapshot_rows VALUES (?, ?, ?)', ['orders', i, JSON.stringify(row)]))
    assert.equal(selectSnapshotRows(db, { table: 'orders' }).length, 3)
    assert.equal(selectSnapshotRows(db, { table: 'orders', department: 'Cutting' }).length, 2)
    assert.equal(selectSnapshotRows(db, { table: 'orders', query: 'sewing' }).length, 1)
    assert.equal(selectSnapshotRows(db, { table: 'orders', query: 'nonexistent' }).length, 0)
    assert.throws(() => selectSnapshotRows(db, { table: 'users' }), /Unknown snapshot table/)
    assert.throws(() => selectSnapshotRows(db, { table: 'orders;DROP TABLE' }), /Invalid export filters/)
    const csv = csvFromRows(rows)
    assert.ok(csv.startsWith('\uFEFF'))
    assert.ok(csv.includes("'=1+1"))
    assert.ok(csv.includes("'+SUM(A1:A2)"))
    assert.ok(csv.includes('hello, ""world""'))
    assert.ok(csv.includes('\r\n'))
    assert.throws(() => csvFromRows(new Array(20001).fill({ id: 1 })), /oversized/)
    process.stdout.write('Offline CSV tests passed: filters, escaping, formula protection, row limits.\n')
  } finally { db.close() }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
