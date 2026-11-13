'use strict'
// CP-18: inspect the imported SQLite snapshot without contacting Supabase.
// Runs only from the native Electron Database menu, never from web content.
const fs = require('node:fs')
const path = require('node:path')
const { dialog } = require('electron')
const initSqlJs = require('sql.js')
const NAME = 'nizamia-app2a.sqlite'

async function inspectSnapshot(parent, directory) {
  try {
    if (!directory) throw new Error('Choose your local database folder first.')
    const filename = path.join(directory, NAME)
    if (!fs.existsSync(filename)) throw new Error('The local database file was not found.')
    const wasm = require.resolve('sql.js/dist/sql-wasm.wasm')
      .replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
    const SQL = await initSqlJs({ locateFile: () => wasm })
    const db = new SQL.Database(fs.readFileSync(filename))
    try {
      const integrity = db.exec('PRAGMA integrity_check')
      if (integrity[0]?.values[0]?.[0] !== 'ok') throw new Error('SQLite integrity check failed.')
      const exists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='snapshot_manifest'")
      if (!exists.length) throw new Error('No imported business snapshot was found.')
      const manifest = db.exec('SELECT table_name, row_count FROM snapshot_manifest ORDER BY table_name')
      const rows = manifest[0]?.values || []
      const actual = db.exec('SELECT table_name, COUNT(*) FROM snapshot_rows GROUP BY table_name')
      const counts = new Map((actual[0]?.values || []).map(([name, count]) => [name, count]))
      for (const [name, count] of rows) {
        if ((counts.get(name) || 0) !== count) throw new Error('Snapshot row count mismatch: ' + name)
      }
      if (counts.size !== rows.filter(([, count]) => count > 0).length)
        throw new Error('Unexpected snapshot rows detected.')
      const total = rows.reduce((sum, [, count]) => sum + count, 0)
      const metadata = db.exec("SELECT value FROM app_metadata WHERE key='snapshot_imported_at'")
      const date = metadata[0]?.values[0]?.[0] || 'Unknown'
      const display = rows.map(([name, count]) => name + ': ' + count.toLocaleString()).join('\n')
      await dialog.showMessageBox(parent, {
        type: 'info',
        title: 'Local SQLite snapshot verified',
        message: rows.length + ' business tables · ' + total.toLocaleString() + ' records',
        detail: 'SQLite integrity: OK\nManifest counts: matched\nImported: ' + date +
          '\n\nThis is a snapshot, not a live synchronization. App-2A screens still read Supabase.\n\nTable counts:\n' + display,
        buttons: ['OK']
      })
    } finally { db.close() }
  } catch (error) {
    await dialog.showMessageBox(parent, {
      type: 'error', title: 'Local snapshot verification failed',
      message: 'Could not verify the SQLite snapshot.',
      detail: String(error.message || error)
    })
  }
}

module.exports = { inspectSnapshot }
