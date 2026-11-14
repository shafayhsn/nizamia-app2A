'use strict'

// CP-18 foundation: local SQLite metadata only. No production data is copied,
// no cloud writes are intercepted, and no synchronization is enabled.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { app, dialog } = require('electron')

const DB_NAME = 'nizamia-app2a.sqlite'
const CONFIG_NAME = 'local-database-settings.json'
const SCHEMA_VERSION = 1

function settingsFile() { return path.join(app.getPath('userData'), CONFIG_NAME) }

function readSettings() {
  try {
    const data = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))
    return typeof data.databaseDirectory === 'string' ? data : {}
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

function saveSettings(data) {
  const target = settingsFile()
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const temp = target + '.tmp'
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(temp, target)
}

function isInternalUserFolder(directory) {
  const real = fs.realpathSync(directory)
  const home = fs.realpathSync(os.homedir())
  // Scope the first implementation to the user's internal home directory.
  // This rejects /Volumes (external drives) and symlink escapes.
  return real === home || real.startsWith(home + path.sep)
}

async function openSqlite(bytes) {
  const initSqlJs = require('sql.js')
  const wasm = require.resolve('sql.js/dist/sql-wasm.wasm')
  const unpacked = wasm.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
  const SQL = await initSqlJs({ locateFile: () => unpacked })
  return bytes ? new SQL.Database(bytes) : new SQL.Database()
}

function persistDatabase(db, destination) {
  const temporary = destination + '.new'
  const bytes = Buffer.from(db.export())
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, destination)
  } finally {
    try { fs.unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

async function initializeDatabase(directory) {
  if (!isInternalUserFolder(directory)) throw new Error('Choose a folder inside your Mac user account on the internal drive.')
  const target = path.join(fs.realpathSync(directory), DB_NAME)
  const existed = fs.existsSync(target)
  const db = await openSqlite(existed ? fs.readFileSync(target) : null)
  try {
    db.run('CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)')
    db.run('CREATE TABLE IF NOT EXISTS snapshot_rows (table_name TEXT NOT NULL, row_index INTEGER NOT NULL, row_json TEXT NOT NULL, PRIMARY KEY(table_name,row_index))')
    db.run('CREATE TABLE IF NOT EXISTS snapshot_manifest (table_name TEXT PRIMARY KEY NOT NULL, row_count INTEGER NOT NULL)')
    db.run('INSERT OR IGNORE INTO app_metadata (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)])
    const version = db.exec("SELECT value FROM app_metadata WHERE key = 'schema_version'")
    if (version[0]?.values[0]?.[0] !== String(SCHEMA_VERSION)) throw new Error('Unsupported local database schema version.')
    // Never rewrite an existing database during folder selection.
    if (!existed) persistDatabase(db, target)
  } finally {
    db.close()
  }
  return target
}

async function chooseDatabaseFolder(parent) {
  const current = readSettings()
  const selection = await dialog.showOpenDialog(parent, {
    title: 'Choose Nizamia App-2A database folder',
    defaultPath: current.databaseDirectory || path.join(os.homedir(), 'Documents'),
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Use this folder'
  })
  if (selection.canceled || !selection.filePaths[0]) return false
  const directory = selection.filePaths[0]
  try {
    const old = current.databaseDirectory
    if (old && fs.realpathSync(old) !== fs.realpathSync(directory)) {
      await dialog.showMessageBox(parent, {
        type: 'info',
        title: 'Database relocation is not yet available',
        message: 'Your current database folder has not changed.',
        detail: 'CP-18 will add verified database relocation in a later stage. For now, we do not move or overwrite your existing database.'
      })
      return false
    }
    const target = await initializeDatabase(directory)
    saveSettings({ databaseDirectory: fs.realpathSync(directory) })
    await dialog.showMessageBox(parent, {
      type: 'info', title: 'Local database ready',
      message: 'SQLite database initialized successfully.',
      detail: target + '\n\nYour standalone offline database is ready. Local records remain on this Mac and are not synchronized to Supabase.'
    })
    return true
  } catch (error) {
    await dialog.showMessageBox(parent, {
      type: 'error', title: 'Database folder not changed',
      message: 'Could not initialize the local database.',
      detail: error.message
    })
    return false
  }
}

async function showDatabaseLocation(parent) {
  let current
  try { current = readSettings() } catch (error) {
    await dialog.showErrorBox('Database settings error', error.message)
    return
  }
  await dialog.showMessageBox(parent, {
    type: 'info', title: 'Local database location',
    message: current.databaseDirectory ? path.join(current.databaseDirectory, DB_NAME) : 'No local database folder selected.',
    detail: 'CP-18 foundation: local SQLite metadata only. Supabase remains the active data source.'
  })
}

function getDatabaseDirectory() { return readSettings().databaseDirectory || null }

module.exports = { chooseDatabaseFolder, showDatabaseLocation, getDatabaseDirectory, initializeDatabase, saveSettings }
