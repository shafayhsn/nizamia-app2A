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

export function calculateBOMFinalQty(item, { totalQty, poData, excessCutPct, cuttingQtyMult }) {
  const wastage = parseFloat(item.wastage) || 0
  const rule = item.usage_rule || 'Generic'
  const ud = normalizeUsageData(item.usage_data)
  const useCut = item.use_cutting_qty && excessCutPct > 0
  const multiplier = useCut ? cuttingQtyMult : 1

  if (rule === 'Generic') {
    const generic = normalizeUsageCell(ud?.generic)
    if (generic.na) return null
    const base = parseFloat(item.base_qty) || parseFloat(generic.value) || 0
    if (!base || !totalQty) return null
    return (base * totalQty * multiplier * (1 + wastage / 100)).toFixed(1)
  }
  if (!ud) return null
  if (rule === 'By Color') {
    const total = Object.entries(ud).filter(([k]) => !String(k).startsWith('_')).reduce((s, [n, cons]) => {
      const c = poData.colors.find(c => c.name === n)
      const cell = normalizeUsageCell(cons)
      return s + (cell.na ? 0 : (parseFloat(cell.value) || 0) * (c?.qty || 0) * multiplier * (1 + wastage / 100))
    }, 0)
    return total > 0 ? total.toFixed(1) : null
  }
  if (rule === 'By Size Group') {
    const total = Object.entries(ud).filter(([k]) => !String(k).startsWith('_')).reduce((s, [n, cons]) => {
      const g = poData.sizeGroups.find(x => x.name === n)
      const cell = normalizeUsageCell(cons)
      return s + (cell.na ? 0 : (parseFloat(cell.value) || 0) * (g?.qty || 0) * multiplier * (1 + wastage / 100))
    }, 0)
    return total > 0 ? total.toFixed(1) : null
  }
  if (rule === 'By Individual Sizes') {
    const total = Object.entries(ud).filter(([k]) => !String(k).startsWith('_')).reduce((s, [sz, cons]) => {
      const found = poData.allSizes.find(x => x.size === sz)
      const cell = normalizeUsageCell(cons)
      return s + (cell.na ? 0 : (parseFloat(cell.value) || 0) * (found?.qty || 0) * multiplier * (1 + wastage / 100))
    }, 0)
    return total > 0 ? total.toFixed(1) : null
  }
  if (rule === 'Configure Own') {
    if (ud.__matrix) {
      const total = ud.__matrix.reduce((s, m) => {
        const sg = (poData.sgMatrix || []).find(x => x.sgName === m.sgName)
        const c  = sg?.colors.find(x => x.colorName === m.colorName)
        return s + (parseFloat(m.consumption) || 0) * (c?.qty || 0) * multiplier * (1 + wastage / 100)
      }, 0)
      return total > 0 ? total.toFixed(1) : null
    }
    const groups = ud.__groups || []
    const total = groups.reduce((s, g) => {
      const gQty = g.sizes.reduce((sq, sz) => sq + (poData.allSizes.find(x => x.size === sz)?.qty || 0), 0)
      return s + (parseFloat(g.consumption) || 0) * gQty * multiplier * (1 + wastage / 100)
    }, 0)
    return total > 0 ? total.toFixed(1) : null
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
    return total > 0 ? total.toFixed(1) : null
  }
  return null
}
