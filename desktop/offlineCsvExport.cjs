'use strict'
// Pure, bounded CSV exporter. Runs only in the trusted Electron main process.
const {readLocalRows,TABLES:LOCAL_TABLES}=require('./standaloneRecords.cjs')
const MAX_EXPORT_ROWS = 20000
const MAX_EXPORT_BYTES = 20 * 1024 * 1024
function scalar(value) {
  if (value == null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
function safeCell(value) {
  const str = scalar(value)
  // Prevent spreadsheet formula execution when a CSV is opened in Excel.
  const escaped = /^[\s\u0000-\u001f]*[=+@\-\t\r]/.test(str) ? "'" + str : str
  return '"' + escaped.replace(/"/g, '""') + '"'
}
function csvFromRows(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_EXPORT_ROWS ||
      rows.some(r => !r || typeof r !== 'object' || Array.isArray(r)))
    throw new Error('Invalid or oversized CSV export')
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
  if (columns.length > 250) throw new Error('Too many export columns')
  const lines = [columns.map(safeCell).join(',')]
  for (const row of rows) lines.push(columns.map(key => safeCell(row[key])).join(','))
  const result = '\uFEFF' + lines.join('\r\n') + '\r\n'
  if (Buffer.byteLength(result, 'utf8') > MAX_EXPORT_BYTES) throw new Error('CSV export exceeds 20 MB')
  return result
}
function selectSnapshotRows(db, { table, query = '', department = '' }) {
  if (typeof table !== 'string' || !/^[a-z][a-z0-9_]*$/.test(table) ||
      typeof query !== 'string' || query.length > 120 ||
      typeof department !== 'string' || department.length > 80)
    throw new Error('Invalid export filters')
  const manifest=db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_manifest'").length
  const imported=manifest&&db.exec('SELECT 1 FROM snapshot_manifest WHERE table_name = ?', [table]).length
  if (!imported&&!LOCAL_TABLES.has(table)) throw new Error('Unknown snapshot table')
  const rows = []
  const stmt = imported?db.prepare('SELECT row_json FROM snapshot_rows WHERE table_name = ? ORDER BY row_index'):null
  try {
    if(stmt)stmt.bind([table])
    while (stmt&&stmt.step()) {
      const row = JSON.parse(stmt.get()[0])
      if (query && !Object.values(row).some(v => scalar(v).toLowerCase().includes(query.toLowerCase()))) continue
      if (department && scalar(row.department || row.dept || row.department_name).toLowerCase() !== department.toLowerCase()) continue
      if (rows.length === MAX_EXPORT_ROWS) throw new Error('Export exceeds 20,000 rows; narrow the filters')
      rows.push(row)
    }
  } finally { if(stmt)stmt.free() }
  if(LOCAL_TABLES.has(table))for(const row of readLocalRows(db,table)){
    if(query&&!Object.values(row).some(v=>scalar(v).toLowerCase().includes(query.toLowerCase())))continue
    if(department&&scalar(row.department||row.dept||row.department_name).toLowerCase()!==department.toLowerCase())continue
    if(rows.length===MAX_EXPORT_ROWS)throw Error('Export exceeds 20,000 rows; narrow the filters')
    rows.push(row)
  }
  return rows
}
module.exports = { csvFromRows, selectSnapshotRows, MAX_EXPORT_ROWS }
