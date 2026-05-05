// Universal status color behaviour for App-2A.
// Keeps raw status text unchanged; only standardizes color + badge styling.
export const PALETTE = {
  green:  { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  red:    { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
  yellow: { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  blue:   { bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
  purple: { bg: '#ede9fe', color: '#6d28d9', border: '#ddd6fe' },
  gray:   { bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' },
}

const MEANING_MAP = [
  { keys: ['complete','completed','closed','paid','received','approved','confirmed','done','dispatched'], tone: 'green' },
  { keys: ['overdue','rejected','cancelled','canceled','failed','blocked','problem'], tone: 'red' },
  { keys: ['partial','partially shipped','revision required','warning','warn'], tone: 'yellow' },
  { keys: ['active','in progress','in_progress','created','issued','booked','shipped','queued'], tone: 'blue' },
  { keys: ['open','pending','draft','inactive','nil','none','na','n/a'], tone: 'gray' },
]


function savedUiColorForStatus(status) {
  try {
    const rows = JSON.parse(localStorage.getItem('app2a_setting_ui_status_colors') || '[]')
    const raw = String(status || '').trim().toLowerCase()
    const hit = Array.isArray(rows) ? rows.find(r => String(r.status_value || '').trim().toLowerCase() === raw) : null
    return hit?.color || null
  } catch (_) { return null }
}

export function statusTone(status) {
  const override = savedUiColorForStatus(status)
  if (override) return override
  const raw = String(status || '').trim().toLowerCase()
  if (!raw) return 'gray'
  const hit = MEANING_MAP.find(group => group.keys.includes(raw))
  return hit?.tone || 'gray'
}

export function statusColors(status) {
  return PALETTE[statusTone(status)] || PALETTE.gray
}

export function statusBadgeStyle(status, extra = {}) {
  const c = statusColors(status)
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '3px 8px',
    borderRadius: 999,
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
    fontSize: 10.5,
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    ...extra,
  }
}

export function statusDotStyle(status, extra = {}) {
  const c = statusColors(status)
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: c.color,
    display: 'inline-block',
    flexShrink: 0,
    ...extra,
  }
}
