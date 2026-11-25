import { lsGet, lsSet, saveSetting } from './settingsStore'
import { supabase } from './supabase'

const KEY = 'nizamia_po_terms_conditions'
const DEFAULT_TERMS = [
  'Payment Terms: Net [X] days after delivery. The payment period begins upon receipt of the final invoice; partial deliveries will not be paid separately.',
  'Delivery: Suppliers must adhere strictly to the agreed delivery date. If a delay occurs, standard payment terms are voided. Any supplier-caused delays resulting in air-freight costs or customer discounts will be billed directly to the supplier.',
  'Quality & Quantity: Any quantities delivered in excess of the PO will not be accepted or paid for. We reserve the right to reject and return any goods that do not meet specified quality criteria.',
].join('\n')

export async function loadPOTerms() {
  const legacy = localStorage.getItem(KEY)
  const fallback = { text: legacy && !legacy.startsWith('Lorem ipsum') ? legacy : DEFAULT_TERMS }
  try {
    const { data, error } = await supabase.rpc('read_po_terms')
    if (!error && typeof data?.text === 'string') {
      lsSet(KEY, data)
      return data.text
    }
  } catch {
    // The last synced terms remain available when the app is offline.
  }
  const saved = lsGet(KEY, fallback)
  return typeof saved?.text === 'string' ? saved.text : fallback.text
}

export function savePOTerms(text) {
  return saveSetting(KEY, { text })
}
