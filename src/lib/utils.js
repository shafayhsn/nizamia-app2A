import { supabase } from './supabase'

// Generate NZ-YYSS job number
export async function generateJobNumber() {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const ss = String(now.getMonth() < 6 ? 1 : 2).padStart(2, '0')
  const key = `job_${yy}${ss}`
  const { data } = await supabase.rpc('increment_counter', { counter_key: key })
  const seq = String(data || 1).padStart(2, '0')
  return `NZ-${yy}${ss}-${seq}`
}

// Generate NZP-YYSS-NNN
export async function generatePONumber() {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const ss = String(now.getMonth() < 6 ? 1 : 2).padStart(2, '0')
  const key = `po_${yy}${ss}`
  const { data } = await supabase.rpc('increment_counter', { counter_key: key })
  const seq = String(data || 1).padStart(3, '0')
  return `NZP-${yy}${ss}-${seq}`
}

// Generate NZW-YYSS-NNN
export async function generateWONumber() {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const ss = String(now.getMonth() < 6 ? 1 : 2).padStart(2, '0')
  const key = `wo_${yy}${ss}`
  const { data } = await supabase.rpc('increment_counter', { counter_key: key })
  const seq = String(data || 1).padStart(3, '0')
  return `NZW-${yy}${ss}-${seq}`
}

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
  'Finishing', 'Packing', 'Final Checking', 'Heat Transfer',
  'Paint Splatter', 'Decorative Stitch', 'Washing', 'Screen Print',
  'Embroidery', 'General Maintenance', 'Transportation',
  'Extra Labour', 'Rework Cost'
]

export const SHIP_MODES = ['Sea', 'Air', 'Courier']
export const INCOTERMS = ['FOB', 'CIF', 'EXW', 'CFR', 'DDP', 'FCA']
export const CURRENCIES = ['USD', 'EUR', 'GBP']
export const SAMPLE_TYPES = ['Proto', 'Fit', 'Salesman', 'PP', 'TOP', 'Shipment']
export const BOM_CATEGORIES = ['Fabric', 'Stitching Trim', 'Packing Trim']
export const USAGE_RULES = ['Generic', 'By Color', 'By Size Group', 'By Individual Sizes', 'Configure Own']
