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
const bundledReact = path.join(process.resourcesPath, 'web', 'offline-desktop.html')
const legacyViewer = path.join(__dirname, 'snapshotViewer.html')
let activeViewerFile = legacyViewer
let sqlEnginePromise = null
function getSqlEngine() {
  if (!sqlEnginePromise) {
    const wasm = require.resolve('sql.js/dist/sql-wasm.wasm').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
    sqlEnginePromise = initSqlJs({ locateFile: () => wasm }).catch(error => { sqlEnginePromise = null; throw error })
  }
  return sqlEnginePromise
}

async function querySnapshot(directory, action, args) {
  const filename = path.join(directory, 'nizamia-app2a.sqlite')
  const SQL = await getSqlEngine()
  const db = new SQL.Database(fs.readFileSync(filename))
  try {
    const ok = db.exec('PRAGMA integrity_check')
    if (ok[0]?.values[0]?.[0] !== 'ok') throw new Error('SQLite integrity check failed')
    if (action === 'tables') {
      const result = db.exec('SELECT table_name, row_count FROM snapshot_manifest ORDER BY table_name')
      return (result[0]?.values || []).map(([name, count]) => ({ name, count }))
    }
    if (action === 'summary') {
      const result = db.exec("SELECT value FROM app_metadata WHERE key='snapshot_imported_at'")
      const counts = db.exec('SELECT COUNT(*), COALESCE(SUM(row_count), 0) FROM snapshot_manifest')
      return { importedAt: result[0]?.values[0]?.[0] || null, tables: counts[0]?.values[0]?.[0] || 0, records: counts[0]?.values[0]?.[1] || 0 }
    }
    if (action === 'moduleOverview') {
      const requested = args?.module
      if (requested !== 'orders' && requested !== 'production') throw new Error('Unsupported module')
      const available = new Set((db.exec('SELECT table_name FROM snapshot_manifest')[0]?.values || []).map(row => row[0]))
      const names = requested === 'orders' ? ['orders'] : ['production_entries', 'production_batch_orders', 'production_batches']
      const result = {}
      for (const name of names) {
        if (!available.has(name)) continue
        const count = db.exec('SELECT row_count FROM snapshot_manifest WHERE table_name = ?', [name])[0]?.values[0]?.[0] || 0
        const records = (db.exec('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index LIMIT 100', [name])[0]?.values || []).map(([json]) => JSON.parse(json))
        result[name] = { count, records }
      }
      return result
    }
    if (action === 'filteredRows') {
      const name = args?.table
      const offset = args?.offset
      const query = args?.query
      const department = args?.department
      if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid table')
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000000) throw new Error('Invalid offset')
      if (typeof query !== 'string' || query.length > 120) throw new Error('Invalid search')
      if (typeof department !== 'string' || department.length > 80) throw new Error('Invalid department')
      if (!db.exec('SELECT 1 FROM snapshot_manifest WHERE table_name = ?', [name]).length) throw new Error('Unknown table')
      // Only snapshot JSON is searched; never executes user-supplied SQL.
      const page = []
      let total = 0
      const departmentsSeen = new Set()
      const statement = db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index')
      try {
        statement.bind([name])
        while (statement.step()) {
          const record = JSON.parse(statement.get()[0])
          if (query && !Object.values(record).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase()))) continue
          if (name.includes('production')) {
            const label = record.department || record.dept || record.department_name
            if (label) departmentsSeen.add(String(label))
          }
          if (department && String(record.department || record.dept || record.department_name || '').toLowerCase() !== department.toLowerCase()) continue
          if (total >= offset && page.length < 25) page.push(record)
          total++
        }
      } finally { statement.free() }
      const departments = [...departmentsSeen].sort()
      return { total, departments, rows: page }
    }
    if (action === 'relatedRows') {
      const orderId = args?.orderId
      if (typeof orderId !== 'string' && typeof orderId !== 'number') throw new Error('Invalid order identifier')
      if (String(orderId).length > 120) throw new Error('Invalid identifier length')
      const related = {}
      const names = ['size_groups', 'production_batch_orders', 'production_entries', 'order_items']
      const available = new Set((db.exec('SELECT table_name FROM snapshot_manifest')[0]?.values || []).map(v => v[0]))
      for (const name of names) {
        if (!available.has(name)) continue
        const found = []
        const statement = db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index')
        try {
          statement.bind([name])
          while (statement.step()) {
            const record = JSON.parse(statement.get()[0])
            if (String(record.order_id ?? '') === String(orderId)) {
              found.push(record)
              if (found.length >= 100) break
            }
          }
        } finally { statement.free() }
        related[name] = found
      }
      return related
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
  viewer.webContents.on('will-frame-navigate', (event, navigation) => {
    if (!navigation.isMainFrame) event.preventDefault()
  })
  viewer.webContents.on('will-attach-webview', event => event.preventDefault())
  viewer.on('closed', () => { viewer = null; selectedDirectory = null })
  activeViewerFile = fs.existsSync(bundledReact) ? bundledReact : legacyViewer
  viewer.loadFile(activeViewerFile).catch(error => {
    if (viewer && !viewer.isDestroyed()) viewer.webContents.loadFile(legacyViewer).catch(() => {})
    activeViewerFile = legacyViewer
    console.error('Packaged offline interface failed to load:', error)
  })
  if (!bound) {
    bound = true
    ipcMain.handle(channel, async (event, action, args) => {
      if (!viewer || viewer.isDestroyed() || event.sender.id !== viewer.webContents.id)
        throw new Error('Local viewer access denied')
      const senderURL = new URL(event.sender.getURL())
      if (senderURL.protocol !== 'file:' || decodeURIComponent(senderURL.pathname) !== activeViewerFile)
        throw new Error('Unexpected viewer origin')
      return querySnapshot(selectedDirectory, action, args)
    })
  }
}

module.exports = { showLocalSnapshot }
