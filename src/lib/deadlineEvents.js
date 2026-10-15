import { supabase } from './supabase'

const TABLES = [
  { table: 'orders', category: 'Orders', route: '/orders', label: r => `${r.buyer_name || r.brand_name || 'Order'} · Style ${r.style_number || '—'}`, fields: {
    ship_date: 'Ship Date', delivery_date: 'Delivery Date', planned_date: 'Planned Date', ex_factory_date: 'Ex-Factory Date', ex_fty_date: 'Ex-Factory Date', due_date: 'Due Date'
  }},
  { table: 'purchase_orders', category: 'Purchasing PO', route: '/purchasing', label: r => `${r.po_number || 'PO'} · ${r.supplier_name || r.supplier || ''}`, fields: {
    po_date: 'PO Issue Date', issue_date: 'Issue Date', delivery_date: 'Supplier Delivery', due_date: 'Due Date', approved_at: 'Approved Date'
  }},
  { table: 'work_orders', category: 'Work Orders', route: '/purchasing', label: r => `${r.wo_number || 'WO'} · ${r.supplier_name || r.supplier || ''}`, fields: {
    wo_date: 'WO Issue Date', issue_date: 'Issue Date', delivery_date: 'WO Delivery', due_date: 'Due Date'
  }},
  { table: 'shipments', category: 'Booking & Shipping', route: '/shipping', label: r => `${r.booking_no || r.shipment_no || 'Shipment'} · ${r.destination || r.store || ''}`, fields: {
    ship_date: 'Ship Date', etd: 'ETD', eta: 'ETA', booking_date: 'Booking Date', delivery_date: 'Delivery Date'
  }},
  { table: 'samples', category: 'Sampling', route: '/sampling', label: r => `${r.sample_type || r.type || 'Sample'} · ${r.style_number || r.buyer_name || ''}`, fields: {
    due_date: 'Sample Due', required_date: 'Required Date', sent_date: 'Sent Date', received_date: 'Received Date', approval_date: 'Approval Date'
  }},
  { table: 'order_queues', category: 'Queues / Production', route: '/orders', label: r => `${r.q_number || 'Queue'} · ${r.label || ''}`, fields: {
    planned_date: 'Planned Date', due_date: 'Due Date', cutting_date: 'Cutting Date', delivery_date: 'Delivery Date'
  }},
]

function isValidDateValue(value) {
  if (!value || typeof value === 'object') return false
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return false
  const y = d.getFullYear()
  return y >= 2020 && y <= 2100
}

export function dateKey(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function eventStatus(dateValue) {
  const today = startOfDay()
  const d = startOfDay(new Date(dateValue))
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return 'week'
  return 'future'
}

export async function loadDeadlineEvents() {
  const events = []
  for (const cfg of TABLES) {
    try {
      const { data, error } = await supabase.from(cfg.table).select('*')
      if (error || !Array.isArray(data)) continue
      for (const row of data) {
        const fieldMap = cfg.fields || {}
        for (const [field, title] of Object.entries(fieldMap)) {
          const value = row?.[field]
          if (!isValidDateValue(value)) continue
          const key = dateKey(value)
          const status = eventStatus(value)
          events.push({
            id: `${cfg.table}-${row.id || Math.random()}-${field}`,
            table: cfg.table,
            recordId: row.id,
            route: cfg.route,
            category: cfg.category,
            title,
            label: cfg.label(row).trim(),
            date: key,
            rawDate: value,
            status,
            field,
            row,
          })
        }
      }
    } catch (_) {
      // Skip missing optional tables safely.
    }
  }
  return events.sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate))
}

export function dueWithin24h(events) {
  const now = new Date()
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return (events || []).filter(e => {
    const d = new Date(e.rawDate)
    return !Number.isNaN(d.getTime()) && d >= startOfDay(now) && d <= end
  })
}

export function overdueEvents(events) {
  return (events || []).filter(e => e.status === 'overdue')
}
