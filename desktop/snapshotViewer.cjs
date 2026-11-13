'use strict'
// Read-only local snapshot viewer. Never exposes SQLite to the remote App-2A site.
const fs = require('node:fs')
const path = require('node:path')
const { BrowserWindow, ipcMain, dialog, app } = require('electron')
const { csvFromRows, selectSnapshotRows } = require('./offlineCsvExport.cjs')
const { layoutRows, validateLayout } = require('./offlineReportLayout.cjs')
const { createReportPresets } = require('./offlineReportPresets.cjs')
const { createLocalAnnotations } = require('./offlinePersonalNotes.cjs')
const { searchSnapshot } = require('./offlineGlobalSearch.cjs')
const { createOfflineWorkspace } = require('./offlineWorkspace.cjs')
const initSqlJs = require('sql.js')
const channel = 'nizamia-local-snapshot'
let viewer = null
let bound = false
let selectedDirectory = null
const bundledReact = path.join(process.resourcesPath, 'web', 'offline-desktop.html')
const legacyViewer = path.join(__dirname, 'snapshotViewer.html')
let activeViewerFile = legacyViewer
let sqlEnginePromise = null
let workspace = null
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
    if (action === 'exportCsv') {
      const rows = selectSnapshotRows(db, args || {})
      const formatted = layoutRows(rows, args?.layout || {})
      const csv = csvFromRows(formatted)
      const proposed = args.table + '-offline-' + new Date().toISOString().slice(0, 10) + '.csv'
      const choice = await dialog.showSaveDialog(viewer, {
        title: 'Export local snapshot as CSV (read only)',
        defaultPath: proposed,
        filters: [{ name: 'CSV spreadsheet', extensions: ['csv'] }]
      })
      if (choice.canceled || !choice.filePath) return { cancelled: true }
      if (path.extname(choice.filePath).toLowerCase() !== '.csv') throw new Error('CSV destination required')
      // The OS dialog selects the destination. No network or cloud writes occur.
      fs.writeFileSync(choice.filePath, csv, { encoding: 'utf8', flag: 'w', mode: 0o600 })
      return { exported: rows.length, file: path.basename(choice.filePath) }
    }
    if (action === 'globalSearch') return searchSnapshot(db, args?.query, 100)
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
      const modules = {
        dashboard: ['orders', 'production_daily_entries', 'tasks', 'purchase_orders'],
        orders: ['orders', 'size_groups', 'size_group_colors', 'size_group_breakdown', 'bom_items'],
        purchasing: ['purchase_orders', 'suppliers', 'bom_items'],
        sampling: ['samples', 'fitting_blocks', 'embellishments'],
        parcels: ['parcels', 'parcel_items'],
        shipping: ['shipments', 'bookings', 'shipping', 'containers'],
        reports: ['production_daily_entries', 'orders', 'quality_reports'],
        tasks: ['tasks', 'task_comments'],
        production: ['production_daily_entries', 'production_entries', 'production_batch_orders', 'production_batches'],
        buyers: ['buyers'],
        suppliers: ['suppliers'],
        library: ['library', 'documents', 'attachments'],
        costing: ['costing', 'cost_sheets', 'costing_sheets', 'quotations', 'fabric_consumption'],
        ppmeeting: ['pp_meetings', 'pre_production_meetings', 'meeting_action_items'],
        customreports: ['custom_reports', 'report_templates', 'report_formats', 'quality_reports'],
        users: [],
        settings: [],
        features: []
      }
      if (typeof requested !== 'string' || !Object.hasOwn(modules, requested))
        throw new Error('Unsupported module')
      const available = new Set((db.exec('SELECT table_name FROM snapshot_manifest')[0]?.values || []).map(row => row[0]))
      const result = {}
      for (const name of modules[requested]) {
        if (!available.has(name)) continue
        const count = db.exec('SELECT row_count FROM snapshot_manifest WHERE table_name = ?', [name])[0]?.values[0]?.[0] || 0
        // Keep previews bounded and never include credential or permission tables.
        const records = (db.exec('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index LIMIT 10', [name])[0]?.values || []).map(([json]) => JSON.parse(json))
        result[name] = { count, records }
      }
      return result
    }
    if (action === 'filteredRows') {
      const name = args?.table
      const offset = args?.offset
      const query = args?.query
      const department = args?.department
      const layout = validateLayout(args?.layout || {})
      if (typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid table')
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000000) throw new Error('Invalid offset')
      if (typeof query !== 'string' || query.length > 120) throw new Error('Invalid search')
      if (typeof department !== 'string' || department.length > 80) throw new Error('Invalid department')
      if (!db.exec('SELECT 1 FROM snapshot_manifest WHERE table_name = ?', [name]).length) throw new Error('Unknown table')
      // Only snapshot JSON is searched; never executes user-supplied SQL.
      const matches = []
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
          matches.push(record)
          total++
        }
      } finally { statement.free() }
      const departments = [...departmentsSeen].sort()
      if (matches.length > 20000 && layout.sortBy) throw new Error('Sorting more than 20,000 records requires narrower filters')
      const sorted = layout.sortBy ? layoutRows(matches, { sortBy: layout.sortBy, descending: layout.descending }) : matches
      const page = sorted.slice(offset, offset + 25)
      return { total, departments, rows: page }
    }
    if (action === 'orderDossier') {
      const orderId = args?.orderId
      if (!['string','number'].includes(typeof orderId) || !String(orderId).trim() ||
          String(orderId).length > 120) throw new Error('Invalid order reference')
      const orderRows = db.exec('SELECT row_json FROM snapshot_rows WHERE table_name = ?', ['orders'])
      const order = (orderRows[0]?.values || []).map(([json]) => JSON.parse(json))
        .find(row => String(row.id) === String(orderId))
      if (!order) throw new Error('Order not found in snapshot')
      const relatedTables = ['size_groups','size_group_colors','size_group_breakdown','bom_items',
        'purchase_orders','order_queues','washing','finishing','finishing_packs',
        'production_daily_entries','production_batch_orders','production_entries','order_items']
      const available = new Set((db.exec('SELECT table_name FROM snapshot_manifest')[0]?.values || []).map(r => r[0]))
      const groups = new Set(), colors = new Set(), related = {}
      let total = 0
      for (const table of relatedTables) {
        if (!available.has(table)) continue
        const stmt = db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index')
        const found = []
        try {
          stmt.bind([table])
          while (stmt.step()) {
            const row = JSON.parse(stmt.get()[0])
            const direct = String(row.order_id ?? '') === String(orderId)
            const viaGroup = ['size_group_colors','size_group_breakdown'].includes(table) && groups.has(String(row.size_group_id ?? ''))
            const viaColor = table === 'size_group_breakdown' && colors.has(String(row.color_id ?? ''))
            if (!(direct || viaGroup || viaColor)) continue
            if (table === 'size_groups' && row.id != null) groups.add(String(row.id))
            if (table === 'size_group_colors' && row.id != null) colors.add(String(row.id))
            if (found.length >= 1000 || ++total > 5000) throw new Error('Order dossier exceeds safe export limit')
            found.push(row)
          }
        } finally { stmt.free() }
        if (found.length) related[table] = found
      }
      const clean = value => Object.fromEntries(Object.entries(value).filter(([key]) =>
        !/(password|secret|credential|token|hash|salt|private_key)/i.test(key)))
      const dossier = { format:'nizamia-offline-order-dossier-v1', exportedAt:new Date().toISOString(),
        snapshotImportedAt:db.exec("SELECT value FROM app_metadata WHERE key='snapshot_imported_at'")[0]?.values?.[0]?.[0] || null,
        order:clean(order), related:Object.fromEntries(Object.entries(related).map(([key,rows]) => [key,rows.map(clean)])) }
      const choice = await dialog.showSaveDialog(viewer, {
        title:'Export complete offline order dossier',
        defaultPath:'nizamia-order-' + String(orderId).replace(/[^a-zA-Z0-9_-]/g,'_') + '.json',
        filters:[{name:'Order dossier JSON',extensions:['json']}]
      })
      if (choice.canceled || !choice.filePath) return {cancelled:true}
      if (path.extname(choice.filePath).toLowerCase() !== '.json') throw new Error('JSON export required')
      if (fs.existsSync(choice.filePath)) {
        const stat=fs.lstatSync(choice.filePath)
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe export destination')
      }
      fs.writeFileSync(choice.filePath,JSON.stringify(dossier,null,2),{encoding:'utf8',mode:0o600,flag:'w'})
      return {exported:total + 1, tables:Object.keys(related).length + 1, file:path.basename(choice.filePath)}
    }
    if (action === 'relatedRows') {
      const orderId = args?.orderId
      if (typeof orderId !== 'string' && typeof orderId !== 'number') throw new Error('Invalid order identifier')
      if (String(orderId).length > 120) throw new Error('Invalid identifier length')
      const related = {}
      const names = ['size_groups', 'size_group_colors', 'size_group_breakdown', 'bom_items', 'purchase_orders', 'order_queues', 'washing', 'finishing', 'finishing_packs', 'production_daily_entries', 'production_batch_orders', 'production_entries', 'order_items']
      const available = new Set((db.exec('SELECT table_name FROM snapshot_manifest')[0]?.values || []).map(v => v[0]))
      const sizeGroupIds = new Set()
      const colorIds = new Set()
      for (const name of names) {
        if (!available.has(name)) continue
        const found = []
        const statement = db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index')
        try {
          statement.bind([name])
          while (statement.step()) {
            const record = JSON.parse(statement.get()[0])
            const direct = String(record.order_id ?? '') === String(orderId)
            const viaGroup = (name === 'size_group_colors' || name === 'size_group_breakdown') && sizeGroupIds.has(String(record.size_group_id ?? ''))
            const viaColor = name === 'size_group_breakdown' && colorIds.has(String(record.color_id ?? ''))
            if (direct || viaGroup || viaColor) {
              if (name === 'size_groups' && record.id != null) sizeGroupIds.add(String(record.id))
              if (name === 'size_group_colors' && record.id != null) colorIds.add(String(record.id))
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
    ...(parent && !parent.isDestroyed() ? { parent } : {}), width: 1360, height: 900, minWidth: 960, minHeight: 650,
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
  viewer.on('closed', () => { workspace?.logout(); viewer = null; selectedDirectory = null })
  activeViewerFile = fs.existsSync(bundledReact) ? bundledReact : legacyViewer
  viewer.loadFile(activeViewerFile).catch(error => {
    if (viewer && !viewer.isDestroyed()) viewer.webContents.loadFile(legacyViewer).catch(() => {})
    activeViewerFile = legacyViewer
    console.error('Packaged offline interface failed to load:', error)
  })
  if (!workspace) workspace = createOfflineWorkspace(() => selectedDirectory)
  if (!bound) {
    bound = true
    ipcMain.handle(channel, async (event, action, args) => {
      if (!viewer || viewer.isDestroyed() || event.sender.id !== viewer.webContents.id)
        throw new Error('Local viewer access denied')
      const senderURL = new URL(event.sender.getURL())
      if (senderURL.protocol !== 'file:' || decodeURIComponent(senderURL.pathname) !== activeViewerFile)
        throw new Error('Unexpected viewer origin')
      if (typeof action === 'string' && action.startsWith('note:')) {
        const notes = createLocalAnnotations(app.getPath('userData'))
        const command = action.slice('note:'.length)
        if (command === 'get') return notes.get(args?.table, args?.recordId)
        if (command === 'save') return notes.save(args?.table, args?.recordId, args?.body)
        if (command === 'import') {
          const choice = await dialog.showOpenDialog(viewer, {
            title:'Restore personal offline notes backup',
            properties:['openFile'],
            filters:[{name:'JSON notes backup',extensions:['json']}]
          })
          if (choice.canceled || choice.filePaths?.length !== 1) return {cancelled:true}
          const file = choice.filePaths[0]
          const stat = fs.lstatSync(file)
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 50 * 1024 * 1024)
            throw new Error('Unsafe notes backup')
          const backup = JSON.parse(fs.readFileSync(file,'utf8'))
          return notes.importNotes(backup,'merge')
        }
        if (command === 'export') {
          const backup = await notes.exportNotes()
          const choice = await dialog.showSaveDialog(viewer, {
            title: 'Back up personal offline notes (unencrypted JSON)',
            defaultPath: 'nizamia-personal-notes-' + new Date().toISOString().slice(0,10) + '.json',
            filters: [{ name:'JSON notes backup', extensions:['json'] }]
          })
          if (choice.canceled || !choice.filePath) return {cancelled:true}
          if (path.extname(choice.filePath).toLowerCase() !== '.json') throw new Error('JSON destination required')
          if (fs.existsSync(choice.filePath)) {
            const stat = fs.lstatSync(choice.filePath)
            if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe backup destination')
          }
          fs.writeFileSync(choice.filePath, JSON.stringify(backup,null,2), {encoding:'utf8',mode:0o600,flag:'w'})
          return {exported:backup.notes.length,file:path.basename(choice.filePath)}
        }
        throw new Error('Unsupported local note action')
      }
      if (typeof action === 'string' && action.startsWith('preset:')) {
        const presets = createReportPresets(app.getPath('userData'))
        const command = action.slice('preset:'.length)
        if (command === 'get') return presets.get(args?.table)
        if (command === 'save') return presets.save(args?.table, args?.layout)
        if (command === 'remove') return presets.remove(args?.table)
        throw new Error('Unsupported report preset action')
      }
      if (typeof action === 'string' && action.startsWith('workspace:'))
        return workspace.action(action.slice('workspace:'.length), args)
      return querySnapshot(selectedDirectory, action, args)
    })
  }
}

module.exports = { showLocalSnapshot }
