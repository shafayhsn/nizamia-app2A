import { supabase } from './supabase'

/**
 * List of all Supabase tables to include in backup / restore.
 * Order matters for FK relationships (parents before children).
 */
export const BACKUP_TABLES = [
  // Reference & Config (parents first)
  'buyers',
  'suppliers',
  'roles',
  'permissions',
  'users',
  'jobs',

  // Orders ecosystem
  'orders',
  'order_queues',
  'order_processes',

  // Size & Library
  'size_groups',
  'size_group_breakdown',
  'size_group_colors',
  'size_group_templates',
  'library_items',

  // BOM & Specs
  'bom_items',
  'embellishments',
  'fitting',
  'washing',

  // Fitting & Finishing
  'fitting_blocks',
  'finishing',
  'finishing_packs',
  'finishing_color_packing',

  // Purchasing (Order → Material)
  'purchase_orders',
  'purchase_order_items',

  // Work Orders (Order → Process)
  'work_orders',
  'work_order_items',
  'work_order_changelog',

  // Sampling
  'samples',
  'sample_comments',
  'sample_logs',

  // Shipping
  'shipments',
  'shipment_lines',

  // Settings control panel
  'app_settings',
  'document_numbering',
  'uoms',
  'ui_status_colors',
]

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const BATCH_SIZE = 500

/**
 * Fetch all rows from a Supabase table
 */
async function fetchTable(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(10000) // Safety limit

    if (error) {
      console.warn(`Warning: Could not fetch ${tableName}:`, error.message)
      return []
    }

    return data || []
  } catch (err) {
    console.warn(`Error fetching ${tableName}:`, err.message)
    return []
  }
}

/**
 * Export all app data as a structured object
 */
export async function exportAppData() {
  const backup_metadata = {
    timestamp: new Date().toISOString(),
    app_version: '2A',
    table_count: BACKUP_TABLES.length,
    total_rows: 0,
  }

  const tables = {}
  let totalRows = 0

  // Fetch all tables in parallel
  const results = await Promise.all(
    BACKUP_TABLES.map(tableName => fetchTable(tableName))
  )

  // Assign results to tables object
  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    const tableName = BACKUP_TABLES[i]
    tables[tableName] = results[i]
    totalRows += results[i].length
  }

  backup_metadata.total_rows = totalRows

  return { backup_metadata, tables }
}

/**
 * Validate a parsed backup payload before restore.
 */
export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid backup file.')
  if (!payload.backup_metadata || typeof payload.backup_metadata !== 'object') throw new Error('Backup metadata missing.')
  if (!payload.tables || typeof payload.tables !== 'object') throw new Error('Backup table data missing.')

  const tableNames = Object.keys(payload.tables)
  if (tableNames.length === 0) throw new Error('Backup has no tables.')

  const missingCritical = ['orders', 'buyers', 'suppliers'].filter(t => !(t in payload.tables))
  if (missingCritical.length) throw new Error(`Backup missing critical tables: ${missingCritical.join(', ')}`)

  return {
    metadata: payload.backup_metadata,
    tableNames,
    totalRows: tableNames.reduce((sum, t) => sum + (Array.isArray(payload.tables[t]) ? payload.tables[t].length : 0), 0),
  }
}

async function clearTable(tableName) {
  // Supabase requires a filter for delete. All App-2A tables use UUID id.
  const { error } = await supabase.from(tableName).delete().neq('id', ZERO_UUID)
  if (error) throw new Error(`Clear failed for ${tableName}: ${error.message}`)
}

async function insertRows(tableName, rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from(tableName).insert(batch)
    if (error) throw new Error(`Insert failed for ${tableName}: ${error.message}`)
  }
}

/**
 * Restore full app data by replacing current records with backup records.
 * WARNING: This deletes data table-by-table in reverse FK order, then inserts parents-first.
 */
export async function restoreAppData(payload, { onProgress } = {}) {
  const { tableNames } = validateBackupPayload(payload)

  const knownTables = BACKUP_TABLES.filter(t => tableNames.includes(t))
  const extraTables = tableNames.filter(t => !BACKUP_TABLES.includes(t))
  const restoreTables = [...knownTables, ...extraTables]
  const deleteTables = [...restoreTables].reverse()

  let step = 0
  const totalSteps = deleteTables.length + restoreTables.length
  const progress = (message) => {
    step += 1
    if (typeof onProgress === 'function') onProgress({ step, totalSteps, message })
  }

  for (const table of deleteTables) {
    progress(`Clearing ${table}...`)
    await clearTable(table)
  }

  for (const table of restoreTables) {
    const rows = payload.tables[table] || []
    progress(`Restoring ${table} (${rows.length})...`)
    await insertRows(table, rows)
  }

  return { restoredTables: restoreTables.length, restoredRows: restoreTables.reduce((sum, t) => sum + ((payload.tables[t] || []).length), 0) }
}

/**
 * Generate Excel workbook data from backup object
 * Returns array of sheets: [{ sheetName, data: [[row1], [row2], ...] }, ...]
 */
export function generateExcelSheets(backupData) {
  const { tables } = backupData
  const sheets = []

  // Fields that are typically large (base64, JSON objects) — truncate for Excel
  const LARGE_FIELDS = [
    'dxf_base64',
    'style_image_base64',
    'wash_image_base64',
    'artwork_url',
    'custom_components',
    'usage_data',
    'config',
  ]

  for (const [tableName, rows] of Object.entries(tables)) {
    if (!rows || rows.length === 0) continue

    // Get column names from first row
    const columns = Object.keys(rows[0])

    // Build sheet data: headers + rows
    const sheetData = [columns]
    for (const row of rows) {
      sheetData.push(columns.map(col => {
        const val = row[col]

        // Skip large fields in Excel (reference in data.json instead)
        if (LARGE_FIELDS.includes(col)) {
          return '[see data.json]'
        }

        // Convert simple objects/arrays to JSON string
        if (typeof val === 'object' && val !== null) {
          try {
            const str = JSON.stringify(val)
            // Limit to 1000 chars for Excel readability
            return str.length > 1000 ? str.substring(0, 1000) + '...' : str
          } catch {
            return '[complex object]'
          }
        }

        return val ?? ''
      }))
    }

    sheets.push({
      sheetName: tableName.substring(0, 31), // Excel sheet name limit
      data: sheetData,
    })
  }

  return sheets
}
