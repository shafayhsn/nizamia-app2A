import { supabase } from './supabase'

export const DEFAULT_SETTINGS = {
  tax: {
    sales_tax_rate: 18,
    sales_tax_refund_percent: 100,
    rebate_percent: 1,
  },
  defaults: {
    currency: 'USD',
    payment_terms_days: 50,
    shipment_status: 'Open',
    pkr_rate: 278.5,
  },
}

export const DEFAULT_UOMS = [
  { code: 'PCS', name: 'Pieces', type: 'Quantity', is_active: true },
  { code: 'MTR', name: 'Meter', type: 'Length', is_active: true },
  { code: 'YDS', name: 'Yards', type: 'Length', is_active: true },
  { code: 'KG', name: 'Kilogram', type: 'Weight', is_active: true },
  { code: 'CTN', name: 'Carton', type: 'Packing', is_active: true },
]

export const DEFAULT_NUMBERING = [
  { doc_type: 'job', label: 'Job Number', prefix: 'NZ-26', pattern: '{PREFIX}{SEQ}', seq_pad: 2, next_number: 1, enabled: true },
  { doc_type: 'po', label: 'Purchase Order', prefix: 'NZP', pattern: '{PREFIX}-{YY}{SEASON}-{SEQ}', seq_pad: 3, next_number: 1, enabled: true },
  { doc_type: 'pd', label: 'Purchase Demand', prefix: 'PD', pattern: '{PREFIX}-{YY}{SEASON}-{SEQ}', seq_pad: 3, next_number: 1, enabled: true },
  { doc_type: 'wo', label: 'Work Order', prefix: 'NZW', pattern: '{PREFIX}-{YY}{SEASON}-{SEQ}', seq_pad: 3, next_number: 1, enabled: true },
  { doc_type: 'shipment', label: 'Shipment', prefix: 'SHP', pattern: '{PREFIX}-{SEQ}', seq_pad: 4, next_number: 1, enabled: true },
  { doc_type: 'invoice', label: 'Invoice', prefix: 'INV', pattern: '{PREFIX}-{YY}-{SEQ}', seq_pad: 3, next_number: 1, enabled: true },
]

export const DEFAULT_STATUS_COLORS = [
  { module: 'orders', status_value: 'Draft', color: 'yellow' },
  { module: 'orders', status_value: 'Active', color: 'blue' },
  { module: 'orders', status_value: 'Completed', color: 'green' },
  { module: 'orders', status_value: 'Cancelled', color: 'red' },
  { module: 'queues', status_value: 'Pending', color: 'gray' },
  { module: 'queues', status_value: 'Active', color: 'blue' },
  { module: 'queues', status_value: 'Completed', color: 'green' },
  { module: 'shipments', status_value: 'Open', color: 'blue' },
  { module: 'shipments', status_value: 'Draft', color: 'gray' },
  { module: 'shipments', status_value: 'Completed', color: 'green' },
  { module: 'payments', status_value: 'Pipeline', color: 'gray' },
  { module: 'payments', status_value: 'Partial', color: 'yellow' },
  { module: 'payments', status_value: 'Complete', color: 'green' },
  { module: 'payments', status_value: 'Overdue', color: 'red' },
]

const LS_PREFIX = 'app2a_setting_'

export function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

export function lsSet(key, value) {
  localStorage.setItem(LS_PREFIX + key, JSON.stringify(value))
}

export async function loadSetting(section, fallback = {}) {
  const local = lsGet(section, fallback)
  try {
    // Current live DB uses `key`; older migration used `section`. Try key first.
    let res = await supabase.from('app_settings').select('value').eq('key', section).maybeSingle()
    if (res?.error) res = await supabase.from('app_settings').select('value').eq('section', section).maybeSingle()
    if (!res?.error && res?.data?.value) {
      lsSet(section, res.data.value)
      return { ...fallback, ...res.data.value }
    }
  } catch (_) {}
  return local
}

export async function saveSetting(section, value) {
  lsSet(section, value)
  try {
    // Current live DB uses `key`; fallback to `section` only if needed.
    let res = await supabase.from('app_settings').upsert(
      { key: section, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
    if (res?.error) {
      await supabase.from('app_settings').upsert(
        { section, value, updated_at: new Date().toISOString() },
        { onConflict: 'section' }
      )
    }
  } catch (_) {}
  return value
}

export async function loadList(table, fallback = []) {
  const local = lsGet(table, fallback)
  try {
    const { data, error } = await supabase.from(table).select('*').order('sort_order', { ascending: true, nullsLast: true })
    if (!error && Array.isArray(data)) {
      const clean = data.length ? data : fallback
      lsSet(table, clean)
      return clean
    }
  } catch (_) {}
  return local
}

export async function saveList(table, rows = []) {
  lsSet(table, rows)
  try {
    await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (rows.length) await supabase.from(table).insert(rows.map((r, i) => ({ ...r, sort_order: i + 1 })))
  } catch (_) {}
  return rows
}

export function renderNumberFromConfig(cfg = {}, seqValue) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const season = String(now.getMonth() < 6 ? 1 : 2).padStart(2, '0')
  const rawFormat = String(cfg.pattern || cfg.format || '{PREFIX}-{YY}{SEASON}-{SEQ}')
  const hashRun = rawFormat.match(/#+/)?.[0]
  const pad = Number(cfg.seq_pad || hashRun?.length || 3)
  const seq = String(seqValue ?? cfg.next_number ?? cfg.current_number ?? 1).padStart(pad, '0')

  // Supports both App-2A pattern tokens and simple settings formats like PREFIX##.
  if (rawFormat.includes('{')) {
    return rawFormat
      .replaceAll('{PREFIX}', cfg.prefix || '')
      .replaceAll('{YY}', yy)
      .replaceAll('{YYYY}', yyyy)
      .replaceAll('{MM}', mm)
      .replaceAll('{SEASON}', season)
      .replaceAll('{SEQ}', seq)
  }

  return rawFormat
    .replaceAll('PREFIX', cfg.prefix || '')
    .replace(/#+/, seq)
    .replaceAll('YYYY', yyyy)
    .replaceAll('YY', yy)
    .replaceAll('MM', mm)
}
