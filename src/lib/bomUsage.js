export const USAGE_RULES = ['Generic', 'By Color', 'By Size Group', 'By Individual Sizes', 'Configure Own', 'By Batch']

export function normalizeUsageData(ud) {
  if (!ud) return {}
  if (typeof ud === 'string') {
    try {
      const parsed = JSON.parse(ud)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch (e) { return {} }
  }
  return typeof ud === 'object' && !Array.isArray(ud) ? ud : {}
}

export function normalizeUsageCell(cell) {
  if (cell && typeof cell === 'object' && !Array.isArray(cell)) return { value: cell.value ?? '', na: !!cell.na }
  return { value: cell ?? '', na: false }
}

export function configuredCell(row, size) {
  return row?.overrides?.find(entry => entry.size === size) ?? row
}

export function configuredQuantity(row, qty, sizes = []) {
  const rate = cell => cell?.na ? 0 : Number(cell?.consumption) || 0
  const base = rate(row)
  return sizes.reduce((sum, cell) =>
    sum + (rate(configuredCell(row, cell.size)) - base) * cell.qty, base * (qty || 0))
}

export function configuredMapQuantity(row, qty, sizeMap) {
  return configuredQuantity(row, qty, Object.entries(sizeMap || {}).map(([size, qty]) => ({ size, qty })))
}

export function calculateBOMFinalQty(item, { totalQty, poData, excessCutPct, cuttingQtyMult, round = true }) {
  const wastage = parseFloat(item.wastage) || 0
  const rule = item.usage_rule || 'Generic'
  const ud = normalizeUsageData(item.usage_data)
  const useCut = item.use_cutting_qty && excessCutPct > 0
  const multiplier = useCut ? cuttingQtyMult : 1
  const finalQuantity = qty => round ? Number(qty.toPrecision(15)).toLocaleString('en-US', {
    useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1,
  }) : qty

  if (rule === 'Generic') {
    const generic = normalizeUsageCell(ud?.generic)
    if (generic.na) return null
    const base = parseFloat(item.base_qty) || parseFloat(generic.value) || 0
    if (!base || !totalQty) return null
    return finalQuantity(base * totalQty * multiplier * (1 + wastage / 100))
  }
  if (!ud) return null
  if (rule === 'By Color') {
    const total = Object.entries(ud).filter(([k]) => !String(k).startsWith('_')).reduce((s, [n, cons]) => {
      const c = poData.colors.find(c => c.name === n)
      const cell = normalizeUsageCell(cons)
      return s + (cell.na ? 0 : (parseFloat(cell.value) || 0) * (c?.qty || 0) * multiplier * (1 + wastage / 100))
    }, 0)
    return total > 0 ? finalQuantity(total) : null
  }
  if (rule === 'By Size Group') {
    const total = Object.entries(ud).filter(([k]) => !String(k).startsWith('_')).reduce((s, [n, cons]) => {
      const g = poData.sizeGroups.find(x => x.name === n)
      const cell = normalizeUsageCell(cons)
      return s + (cell.na ? 0 : (parseFloat(cell.value) || 0) * (g?.qty || 0) * multiplier * (1 + wastage / 100))
    }, 0)
    return total > 0 ? finalQuantity(total) : null
  }
  if (rule === 'By Individual Sizes') {
    const total = Object.entries(ud).filter(([k]) => !String(k).startsWith('_')).reduce((s, [sz, cons]) => {
      const found = poData.allSizes.find(x => x.size === sz)
      const cell = normalizeUsageCell(cons)
      return s + (cell.na ? 0 : (parseFloat(cell.value) || 0) * (found?.qty || 0) * multiplier * (1 + wastage / 100))
    }, 0)
    return total > 0 ? finalQuantity(total) : null
  }
  if (rule === 'Configure Own') {
    if (ud.__matrix) {
      const total = ud.__matrix.reduce((s, m) => {
        const sg = (poData.sgMatrix || []).find(x => x.sgName === m.sgName)
        const c  = sg?.colors.find(x => x.colorName === m.colorName)
        return s + configuredQuantity(m, c?.qty, c?.sizes) * multiplier * (1 + wastage / 100)
      }, 0)
      return total > 0 ? finalQuantity(total) : null
    }
    const groups = ud.__groups || []
    const total = groups.reduce((s, g) => {
      const gQty = g.sizes.reduce((sq, sz) => sq + (poData.allSizes.find(x => x.size === sz)?.qty || 0), 0)
      return s + (parseFloat(g.consumption) || 0) * gQty * multiplier * (1 + wastage / 100)
    }, 0)
    return total > 0 ? finalQuantity(total) : null
  }
  if (rule === 'By Batch') {
    const batches = ud.__batches || []
    const total = batches.reduce((s, b) => {
      const qty = (b.cells || []).reduce((sq, cell) => {
        const sg = (poData.sgMatrix || []).find(x => x.sgName === cell.sgName)
        const c = sg?.colors.find(x => x.colorName === cell.colorName)
        if (cell.size) return sq + (parseFloat((c?.sizes || []).find(sz => sz.size === cell.size)?.qty) || 0)
        return sq + (parseFloat(c?.qty) || 0)
      }, 0)
      return s + (parseFloat(b.consumption) || 0) * qty * multiplier * (1 + wastage / 100)
    }, 0)
    return total > 0 ? finalQuantity(total) : null
  }
  return null
}

export function buildBOMMatrix(groups, colors, breakdown) {
  const colorTotals = new Map()
  const sizeTotals = new Map()
  const groupTotals = new Map()
  const matrixTotals = new Map()
  const add = (map, key, qty) => map.set(key, (map.get(key) || 0) + qty)
  const key = (...parts) => JSON.stringify(parts)
  for (const row of breakdown) {
    const qty = Number(row.qty) || 0
    add(colorTotals, row.color_id, qty)
    add(sizeTotals, row.size, qty)
    add(groupTotals, row.size_group_id, qty)
    add(matrixTotals, key(row.size_group_id, row.color_id, row.size), qty)
  }
  const merge = (entries, label) => {
    const totals = new Map()
    for (const entry of entries) add(totals, entry[label], entry.qty)
    return [...totals].map(([name, qty]) => ({ [label]: name, qty }))
  }
  const sgMatrix = groups.map(group => {
    const sizes = group.sizes || []
    return {
      sgName: group.group_name,
      sizes,
      colors: colors.filter(color => color.size_group_id === group.id).map(color => {
        const cells = sizes.map(size => ({ size, qty: matrixTotals.get(key(group.id, color.id, size)) || 0 }))
        return { colorName: color.color_name, sizes: cells, qty: cells.reduce((sum, cell) => sum + cell.qty, 0) }
      }),
    }
  })
  const mergedMatrix = new Map()
  for (const group of sgMatrix) {
    const combined = mergedMatrix.get(group.sgName) || { sgName: group.sgName, sizes: [], colors: [] }
    combined.sizes = [...new Set([...combined.sizes, ...group.sizes])]
    for (const color of group.colors) {
      const existing = combined.colors.find(entry => entry.colorName === color.colorName)
      if (existing) {
        existing.sizes = merge([...existing.sizes, ...color.sizes], 'size')
        existing.qty += color.qty
      } else {
        combined.colors.push(color)
      }
    }
    mergedMatrix.set(group.sgName, combined)
  }
  return {
    colors: merge(colors.map(color => ({ name: color.color_name, qty: colorTotals.get(color.id) || 0 })), 'name'),
    sizeGroups: merge(groups.map(group => ({ name: group.group_name, qty: groupTotals.get(group.id) || 0 })), 'name'),
    allSizes: [...new Set(groups.flatMap(group => group.sizes || []))].map(size => ({ size, qty: sizeTotals.get(size) || 0 })),
    sgMatrix: [...mergedMatrix.values()],
  }
}
