'use strict'
// Offline report layout: pure, validated column selection and deterministic sort.
const MAX_COLUMNS = 250
const MAX_SORT_ROWS = 20000
function validateLayout(layout = {}) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new Error('Invalid report layout')
  const { columns = null, sortBy = '', descending = false } = layout
  if (columns !== null && (!Array.isArray(columns) || !columns.length ||
      columns.length > MAX_COLUMNS || new Set(columns).size !== columns.length ||
      columns.some(c => typeof c !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]{0,119}$/.test(c))))
    throw new Error('Invalid report columns')
  if (typeof sortBy !== 'string' || (sortBy && !/^[a-zA-Z_][a-zA-Z0-9_]{0,119}$/.test(sortBy)) ||
      typeof descending !== 'boolean') throw new Error('Invalid report sort')
  return { columns, sortBy, descending }
}
function layoutRows(rows, layout = {}) {
  const { columns, sortBy, descending } = validateLayout(layout)
  if (!Array.isArray(rows) || rows.length > MAX_SORT_ROWS ||
      rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('Invalid report rows')
  const available = new Set(rows.flatMap(row => Object.keys(row)))
  if (columns && columns.some(c => !available.has(c))) throw new Error('Unknown report column')
  if (sortBy && !available.has(sortBy)) throw new Error('Unknown sort column')
  const ordered = rows.map((row, index) => ({ row, index }))
  if (sortBy) ordered.sort((a, b) => {
    const left = a.row[sortBy], right = b.row[sortBy]
    const emptyA = left == null || left === '', emptyB = right == null || right === ''
    if (emptyA || emptyB) return emptyA === emptyB ? a.index - b.index : emptyA ? 1 : -1
    const nA = Number(left), nB = Number(right)
    let result = Number.isFinite(nA) && Number.isFinite(nB) && String(left).trim() && String(right).trim()
      ? Math.sign(nA - nB)
      : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
    return (descending ? -result : result) || a.index - b.index
  })
  return ordered.map(({ row }) => columns
    ? Object.fromEntries(columns.map(c => [c, row[c] ?? null]))
    : { ...row })
}
module.exports = { validateLayout, layoutRows }
