import { supabase } from './supabase'
import { DEFAULT_NUMBERING, renderNumberFromConfig } from './settingsStore'

async function loadNumberingConfig(docType) {
  const fallback = DEFAULT_NUMBERING.find(r => r.doc_type === docType)
  try {
    const { data, error } = await supabase.from('document_numbering').select('*').eq('doc_type', docType).maybeSingle()
    if (!error && data) return { ...fallback, ...data }
  } catch (_) {}
  return fallback
}

async function ensureNumberingConfig(docType, fallbackPrefix, fallbackPad = 3) {
  const fallback = {
    doc_type: docType,
    label: docType.toUpperCase(),
    prefix: fallbackPrefix,
    pattern: `{PREFIX}-{YY}{SEASON}-{SEQ}`,
    seq_pad: fallbackPad,
    next_number: 1,
    enabled: true,
  }
  const cfg = await loadNumberingConfig(docType)
  if (cfg) return { ...fallback, ...cfg }
  try {
    const { data } = await supabase
      .from('document_numbering')
      .insert([fallback])
      .select('*')
      .single()
    return { ...fallback, ...(data || {}) }
  } catch (_) {
    return fallback
  }
}

async function persistNextNumber(docType, nextNumber) {
  try {
    // Support the App-2A settings schema (next_number) and older SQL snippets (current_number).
    await supabase
      .from('document_numbering')
      .update({ next_number: nextNumber, current_number: nextNumber, updated_at: new Date().toISOString() })
      .eq('doc_type', docType)
  } catch (_) {
    try {
      await supabase
        .from('document_numbering')
        .update({ next_number: nextNumber, updated_at: new Date().toISOString() })
        .eq('doc_type', docType)
    } catch (_) {}
  }
}

async function generateConfiguredNumber(docType, fallbackPrefix, fallbackPad = 3) {
  const cfg = await ensureNumberingConfig(docType, fallbackPrefix, fallbackPad)
  const seq = Number(cfg?.next_number ?? cfg?.current_number ?? 1) || 1

  // IMPORTANT: document_numbering is the source of truth.
  // Do not use jobs count or increment_counter for jobs/documents.
  const value = renderNumberFromConfig({
    ...cfg,
    pattern: cfg?.pattern || cfg?.format || `{PREFIX}-{YY}{SEASON}-{SEQ}`,
    seq_pad: Number(cfg?.seq_pad || fallbackPad),
    next_number: seq,
  }, seq)

  await persistNextNumber(docType, seq + 1)
  return value
}

// Generate job number from Settings → Document Numbering.
export async function generateJobNumber() { return generateConfiguredNumber('job', 'NZ', 2) }

export async function generatePONumber() { return generateConfiguredNumber('po', 'NZP', 3) }

export async function generatePDNumber() { return generateConfiguredNumber('pd', 'PD', 3) }

export async function generateWONumber() { return generateConfiguredNumber('wo', 'NZW', 3) }

export async function generateShipmentNumber() { return generateConfiguredNumber('shipment', 'SHP', 4) }

export async function generateInvoiceNumber() { return generateConfiguredNumber('invoice', 'INV', 3) }

// Generate SAM-YYSS-NN
export async function generateSampleNumber(colorSuffix = '') {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const ss = String(now.getMonth() < 6 ? 1 : 2).padStart(2, '0')
  const key = `sam_${yy}${ss}`
  const { data } = await supabase.rpc('increment_counter', { counter_key: key })
  const seq = String(data || 1).padStart(2, '0')
  const suffix = colorSuffix ? `-${colorSuffix.toUpperCase().replace(/\s/g, '').slice(0, 3)}` : ''
  return `SAM-${yy}${ss}-${seq}${suffix}`
}

export function formatCurrency(amount, currency = 'USD') {
  if (!amount) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(amount)
}

export function formatPKR(amount) {
  if (!amount) return '—'
  return `PKR ${new Intl.NumberFormat('en-PK').format(Math.round(amount))}`
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function shipDateStatus(dateStr) {
  const days = daysUntil(dateStr)
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days <= 7) return 'critical'
  if (days <= 21) return 'warning'
  return 'ok'
}

export const PROCESSES = [
  'Cutting', 'Stitching', 'Kaj', 'Bartack', 'Press', 'Cropping',
  'Finishing', 'Packing', 'Heat Transfer', 'Paint Splatter',
  'Decorative Stitch', 'Washing', 'Screen Print', 'Embroidery',
  'General Maintenance', 'Rework Cost'
]

export const SHIP_MODES = ['Sea', 'Air', 'Courier']
export const INCOTERMS = ['FOB', 'CIF', 'EXW', 'CFR', 'DDP', 'FCA']
export const CURRENCIES = ['USD', 'EUR', 'GBP']
export const SAMPLE_TYPES = ['Proto', 'Fit', 'Salesman', 'PP', 'TOP', 'Shipment']
export const BOM_CATEGORIES = ['Fabric', 'Stitching Trim', 'Packing Trim']
export const USAGE_RULES = ['Generic', 'By Color', 'By Size Group', 'By Individual Sizes', 'Configure Own']
