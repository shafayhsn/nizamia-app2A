'use strict'
// CP-18: one-shot, read-only import of an App-2A JSON backup into SQLite.
// No cloud credentials, web IPC bridge, or Supabase writes.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { app, dialog } = require('electron')
const initSqlJs = require('sql.js')
const { mergeSnapshotRows } = require('./snapshotMerge.cjs')
const DB_NAME = 'nizamia-app2a.sqlite'
const EXCLUDED_TABLES = new Set(['users', 'permissions', 'roles', 'app_database_sync_status', 'notification_reads', 'app_task_reads'])
const SENSITIVE_FIELDS = /password|secret|token|api_key|private_key|session|credential|auth_hash/i
const TABLE_RE = /^[a-z][a-z0-9_]*$/
const MAX_FILE_BYTES = 1024 * 1024 * 1024
let busy = false

async function sqlite(bytes) {
  const wasm = require.resolve('sql.js/dist/sql-wasm.wasm')
    .replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
  const SQL = await initSqlJs({ locateFile: () => wasm })
  return bytes ? new SQL.Database(bytes) : new SQL.Database()
}

function atomicReplace(destination, bytes) {
  const temp = destination + '.importing'
  const previous = destination + '.pre-import-backup'
  if (fs.existsSync(temp)) throw new Error('A previous temporary import file exists. Please contact support before retrying.')
  if (fs.existsSync(previous)) throw new Error('A previous pre-import backup exists. Move it to a safe backup location before another import.')
  fs.writeFileSync(temp, Buffer.from(bytes), { flag: 'wx', mode: 0o600 })
  try {
    // Preserve the prior database as a separate recoverable file.
    fs.renameSync(destination, previous)
    try { fs.renameSync(temp, destination) }
    catch (error) { fs.renameSync(previous, destination); throw error }
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp)
  }
}

function validateBackup(payload) {
  if (!payload || typeof payload !== 'object' || !payload.backup_metadata || !payload.tables || typeof payload.tables !== 'object')
    throw new Error('Expected App-2A backup data.json with backup_metadata and tables.')
  const names = Object.keys(payload.tables)
  if (!names.length || !['orders', 'buyers', 'suppliers'].every(t => names.includes(t)))
    throw new Error('The backup is missing critical business tables.')
  const declared = payload.backup_metadata.table_row_counts
  if (!declared || typeof declared !== 'object') throw new Error('Backup row-count manifest is required.')
  for (const name of names) {
    if (!TABLE_RE.test(name) || !Array.isArray(payload.tables[name])) throw new Error('Invalid backup table: ' + name)
    if (declared[name] !== payload.tables[name].length) throw new Error('Row-count mismatch in backup: ' + name)
  }
  if (payload.backup_metadata.table_count !== names.length) throw new Error('Backup table count does not match manifest.')
  return names
}

async function importBackup(parent, databaseDirectory) {
  if (busy) return
  busy = true
  try {
    if (!databaseDirectory) throw new Error('Choose a database folder first.')
    const destination = path.join(databaseDirectory, DB_NAME)
    if (!fs.existsSync(destination)) throw new Error('Local SQLite database is missing. Choose the folder again.')
    const pick = await dialog.showOpenDialog(parent, {
      title: 'Select App-2A backup data.json (read-only import)',
      properties: ['openFile'], filters: [{ name: 'App-2A JSON backup', extensions: ['json'] }]
    })
    if (pick.canceled || !pick.filePaths[0]) return
    const file = pick.filePaths[0]
    if (fs.statSync(file).size > MAX_FILE_BYTES) throw new Error('Backup exceeds the 1 GB import limit.')
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
    const names = validateBackup(payload)
    const answer = await dialog.showMessageBox(parent, {
      type: 'question', buttons: ['Cancel', 'Import read-only snapshot'], defaultId: 0, cancelId: 0,
      title: 'Confirm local snapshot import',
      message: 'Refresh business snapshot while preserving local work?',
      detail: 'This reads a backup file on your Mac. It will NOT write to Supabase. Authentication tables and sensitive fields are excluded. Standalone offline records, local edits and drafts will be retained. The existing SQLite file will be preserved as a pre-import backup.'
    })
    if (answer.response !== 1) return
    const db = await sqlite(fs.readFileSync(destination))
    let tableCount = 0, rowCount = 0
    try {
      // Refresh only imported snapshot tables. Standalone records, overlays and
      // pending drafts stay in the same SQLite database, unchanged.
      const safeTables = {}
      for (const name of names) {
        if (EXCLUDED_TABLES.has(name)) continue
        safeTables[name] = payload.tables[name].map(source => {
          if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid row in ' + name)
          return Object.fromEntries(Object.entries(source).filter(([key]) => !SENSITIVE_FIELDS.test(key)))
        })
        tableCount++
        rowCount += safeTables[name].length
      }
      mergeSnapshotRows(db, safeTables)
      db.run('CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)')
      db.run('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)', ['snapshot_imported_at', new Date().toISOString()])
      db.run('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)', ['snapshot_source_sha256', crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])
      const checked = db.exec('SELECT COUNT(*), COALESCE(SUM(row_count),0) FROM snapshot_manifest WHERE table_name IN ('+Object.keys(safeTables).map(()=>'?').join(',')+')',Object.keys(safeTables))
      const [actualTables, expectedRows] = checked[0].values[0]
      const actualRows = db.exec('SELECT COUNT(*) FROM snapshot_rows WHERE table_name IN ('+Object.keys(safeTables).map(()=>'?').join(',')+')',Object.keys(safeTables))[0].values[0][0]
      if (actualTables !== tableCount || expectedRows !== rowCount || actualRows !== rowCount)
        throw new Error('Local snapshot verification failed; original database remains unchanged.')
      if (db.exec('PRAGMA integrity_check')[0]?.values?.[0]?.[0] !== 'ok') throw new Error('Merged SQLite integrity check failed')
      atomicReplace(destination, db.export())
    } catch (error) {
      throw error
    } finally { db.close() }
    await dialog.showMessageBox(parent, {
      type: 'info', title: 'Read-only snapshot imported',
      message: tableCount + ' business tables imported successfully.',
      detail: rowCount.toLocaleString() + ' records verified. Your original SQLite database was preserved as nizamia-app2a.sqlite.pre-import-backup.\n\nLocal work was preserved. This is a manual snapshot refresh; live Supabase sync is not yet enabled.'
    })
  } catch (error) {
    await dialog.showMessageBox(parent, {
      type: 'error', title: 'Local snapshot import not completed',
      message: 'Your existing database has not been intentionally replaced.',
      detail: String(error.message || error)
    })
  } finally { busy = false }
}

module.exports = { importBackup }
