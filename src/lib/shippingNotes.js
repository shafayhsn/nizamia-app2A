const SHIPPING_META_START = '\n\n[[APP2A_SHIPPING_META:'
const SHIPPING_META_END = ']]'
export function splitShippingNotes(notes) {
  const raw = String(notes || '')
  const i = raw.indexOf(SHIPPING_META_START)
  if (i < 0) return { clean: raw, meta: {} }
  const clean = raw.slice(0, i).trim()
  const rest = raw.slice(i + SHIPPING_META_START.length)
  const j = rest.indexOf(SHIPPING_META_END)
  if (j < 0) return { clean, meta: {} }
  try { return { clean, meta: JSON.parse(atob(rest.slice(0, j))) || {} } } catch { return { clean, meta: {} } }
}
export function packShippingNotes(clean, meta) {
  const encoded = btoa(JSON.stringify(meta || {}))
  return String(clean || '').trim() + SHIPPING_META_START + encoded + SHIPPING_META_END
}
