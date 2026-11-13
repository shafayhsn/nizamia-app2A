'use strict'
const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')
const DB_NAME = 'nizamia-app2a.sqlite'
async function snapshotReady(directory) {
  if (!directory || typeof directory !== 'string' || !path.isAbsolute(directory)) return false
  const file = path.join(directory, DB_NAME)
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 * 1024) return false
    const wasm = require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
    const SQL = await initSqlJs({ locateFile: () => wasm })
    const db = new SQL.Database(fs.readFileSync(file))
    try {
      const integrity = db.exec('PRAGMA quick_check')
      if (integrity[0]?.values?.[0]?.[0] !== 'ok') return false
      const tables = new Set((db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values || []).map(row => row[0]))
      if (!['snapshot_rows', 'snapshot_manifest', 'app_metadata'].every(t => tables.has(t))) return false
      const manifest = db.exec("SELECT row_count FROM snapshot_manifest WHERE table_name = 'orders'")
      if (!manifest.length || !Number.isInteger(manifest[0].values[0][0])) return false
      const imported = db.exec("SELECT value FROM app_metadata WHERE key = 'snapshot_imported_at'")
      return Boolean(imported[0]?.values?.[0]?.[0])
    } finally { db.close() }
  } catch { return false }
}
module.exports = { snapshotReady }
