import { supabase } from './supabase'

/**
 * List of all Supabase tables to include in backup
 * Order matters for FK relationships (parents before children)
 */
const BACKUP_TABLES = [
  'buyers',
  'suppliers',
  'users',
  'jobs',
  'orders',
  'size_group_templates',
  'bom_items',
  'fitting_blocks',
  'finishing',
  'finishing_packs',
  'order_queues',
  'samples',
  'sample_comments',
  'sample_logs',
  'shipments',
  'shipment_lines',
]

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
 * Generate Excel workbook data from backup object
 * Returns array of sheets: [{ sheetName, data: [[row1], [row2], ...] }, ...]
 */
export function generateExcelSheets(backupData) {
  const { tables } = backupData
  const sheets = []

  for (const [tableName, rows] of Object.entries(tables)) {
    if (!rows || rows.length === 0) continue

    // Get column names from first row
    const columns = Object.keys(rows[0])

    // Build sheet data: headers + rows
    const sheetData = [columns]
    for (const row of rows) {
      sheetData.push(columns.map(col => {
        const val = row[col]
        // Convert complex objects to JSON string for Excel readability
        if (typeof val === 'object' && val !== null) {
          return JSON.stringify(val)
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
