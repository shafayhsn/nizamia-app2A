export function purchaseOrderComments(notes) {
  return String(notes ?? '')
    .replace(/\n?\[PO_META:\{.*?\}\]\s*$/i, '')
    .replace(/\n?\[PO_TAX:\{.*?\}\]\s*$/i, '')
}

export function estimatedPaymentDate(deliveryDate, paymentTerms) {
  const match = String(paymentTerms ?? '').trim()
    .match(/^(?:net[\s-]*)?(\d+)\s*(?:days?)?(?:\s+net)?(?:\s+after\s+delivery)?$/i)
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate ?? '')) return 'N/A'
  const date = new Date(deliveryDate + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== deliveryDate) return 'N/A'
  date.setUTCDate(date.getUTCDate() + Number(match[1]))
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) return 'N/A'
  return date.toISOString().slice(0, 10).split('-').reverse().join('-')
}
