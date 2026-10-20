// Shared normalization for Supabase JSONB values and legacy double-encoded JSON.
export function usageObject(raw) {
  if (raw == null || raw === '') return {}
  if (typeof raw === 'string') {
    try { return usageObject(JSON.parse(raw)) } catch { return {} }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}
export function usageNumber(raw) {
  if (raw == null) return 0
  if (typeof raw === 'object') {
    if (raw.na === true || raw.disabled === true) return 0
    return usageNumber(raw.value ?? raw.qty ?? raw.consumption ?? raw.cons ?? raw.amount)
  }
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
export function usageEntries(raw) {
  return Object.entries(usageObject(raw)).filter(([key]) => !key.startsWith('_'))
}
export function grossUsage(item, totalQty, groupQty = {}, colorQty = {}) {
  const ud = usageObject(item.usage_data)
  const rule = item.usage_rule || 'Generic'
  let net = 0
  if (rule === 'Generic') net = usageNumber(item.base_qty ?? ud.generic) * usageNumber(totalQty)
  else if (rule === 'By Size Group') net = usageEntries(ud).reduce((sum,[name,cons]) => sum + usageNumber(cons)*usageNumber(groupQty[name]),0)
  else if (rule === 'By Color') net = usageEntries(ud).reduce((sum,[name,cons]) => sum + usageNumber(cons)*usageNumber(colorQty[name]),0)
  else return null // Other rules require the full PO matrix; never fake a requirement.
  return net * (1 + usageNumber(item.wastage)/100)
}
