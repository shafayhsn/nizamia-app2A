'use strict'
// Read-only local snapshot viewer. Never exposes SQLite to the remote App-2A site.
const fs = require('node:fs')
const path = require('node:path')
const { BrowserWindow, ipcMain } = require('electron')
const initSqlJs = require('sql.js')
const channel = 'nizamia-local-snapshot'
let viewer = null
let bound = false
let selectedDirectory = null

async function querySnapshot(directory, action, args) {
  const filename = path.join(directory, 'nizamia-app2a.sqlite')
  const wasm = require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
  const SQL = await initSqlJs({ locateFile: () => wasm })
  const db = new SQL.Database(fs.readFileSync(filename))
  try {
    const ok = db.exec('PRAGMA integrity_check')
    if (ok[0]?.values[0]?.[0] !== 'ok') throw new Error('SQLite integrity check failed')
    if (action === 'tables') {
      const result = db.exec('SELECT table_name, row_count FROM snapshot_manifest ORDER BY table_name')
      return (result[0]?.values || []).map(([name, count]) => ({ name, count }))
    }
    if (action === 'rows') {
      const name = args?.table
      const offset = args?.offset
      if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid table')
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000000) throw new Error('Invalid page')
      const exists = db.exec('SELECT 1 FROM snapshot_manifest WHERE table_name = ?', [name])
      if (!exists.length) throw new Error('Unknown snapshot table')
      const result = db.exec('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index LIMIT 25 OFFSET ?', [name, offset])
      return (result[0]?.values || []).map(([json]) => JSON.parse(json))
    }
    throw new Error('Unsupported read-only action')
  } finally { db.close() }
}

function showLocalSnapshot(parent, getDirectory) {
  const directory = getDirectory()
  if (!directory) throw new Error('Choose a database folder first.')
  if (viewer && !viewer.isDestroyed()) { viewer.focus(); return }
  selectedDirectory = directory
  viewer = new BrowserWindow({
    parent, width: 1100, height: 780, minWidth: 750, minHeight: 500,
    title: 'Nizamia — Local SQLite Viewer',
    webPreferences: {
      preload: path.join(__dirname, 'snapshotViewerPreload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, devTools: false
    }
  })
  viewer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  viewer.webContents.on('will-navigate', event => event.preventDefault())
  viewer.webContents.on('will-attach-webview', event => event.preventDefault())
  viewer.on('closed', () => { viewer = null; selectedDirectory = null })
  viewer.loadFile(path.join(__dirname, 'snapshotViewer.html'))
  if (!bound) {
    bound = true
    ipcMain.handle(channel, async (event, action, args) => {
      if (!viewer || viewer.isDestroyed() || event.sender.id !== viewer.webContents.id)
        throw new Error('Local viewer access denied')
      const senderURL = new URL(event.sender.getURL())
      if (senderURL.protocol !== 'file:' || decodeURIComponent(senderURL.pathname) !== path.join(__dirname, 'snapshotViewer.html'))
        throw new Error('Unexpected viewer origin')
      return querySnapshot(selectedDirectory, action, args)
    })
  }
}

module.exports = { showLocalSnapshot }
