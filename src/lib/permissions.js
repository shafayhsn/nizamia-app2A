import { staffWorkflow } from './staffRoles.js'
// src/lib/permissions.js
// App-2A role-based permission helpers (DB permissions first, safe legacy fallback)

export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'orders', label: 'Orders' },
  { key: 'purchasing', label: 'Purchasing' },
  { key: 'buyers', label: 'Buyers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'sampling', label: 'Sampling' },
  { key: 'parcels', label: 'Parcels' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'library', label: 'Library' },
  { key: 'reports', label: 'Reports' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'production', label: 'Production' },
  { key: 'features', label: 'Features' },
  { key: 'features/costing', label: 'Costing Sheet' },
  { key: 'reports/pp-meeting', label: 'PP Meeting' },
  { key: 'reports/custom', label: 'Custom Report Builder' },
  { key: 'settings', label: 'Settings' },
]

export const ACTIONS = ['view', 'create', 'edit', 'delete']

export const LEGACY_PERMISSIONS = {
  admin: 'all',
  merchandiser: {
    dashboard: ['view'],
    orders: ['view', 'create', 'edit'],
    purchasing: ['view', 'create'],
    buyers: ['view'],
    suppliers: ['view'],
    sampling: ['view', 'create', 'edit'],
    parcels: ['view', 'create', 'edit'],
    shipping: ['view'],
    library: ['view', 'create'],
    reports: ['view'],
    tasks: ['view','create','edit'],
    settings: [],
  },
}

const MODULE_ALIASES = {
  po: 'purchasing',
  purchase: 'purchasing',
  print: 'reports',
  users: 'settings',
}

export function normalizeModule(module) {
  const key = String(module || '').trim().toLowerCase()
  return MODULE_ALIASES[key] || key
}

export function getRole(user) {
  if (!user) return null
  if (typeof user === 'string') return user
  return user.role || user.userRole?.role || null
}

function getPermissionMap(user) {
  if (!user || typeof user === 'string') return null
  return user.permissions || user.userRole?.permissions || null
}

export function can(user, module, action = 'view') {
  const role = getRole(user)
  if (role === 'admin') return true
  if (staffWorkflow(role)) return false
  const key = normalizeModule(module)
  if (key === 'settings' || key === 'shipping.payments') return false
  const act = String(action || 'view').toLowerCase()

  const map = getPermissionMap(user)
  if (map && Object.prototype.hasOwnProperty.call(map, key)) {
    return !!map[key]?.[act]
  }

  const legacy = LEGACY_PERMISSIONS[role]?.[key]
  if (!legacy) return false
  return legacy.includes(act)
}

export const access = {
  canViewDashboard: (user) => can(user, 'dashboard', 'view'),
  canViewOrders: (user) => can(user, 'orders', 'view'),
  canCreateOrder: (user) => can(user, 'orders', 'create'),
  canEditOrder: (user) => can(user, 'orders', 'edit'),
  canViewPO: (user) => can(user, 'purchasing', 'view'),
  canCreatePO: (user) => can(user, 'purchasing', 'create'),
  canEditPO: (user) => can(user, 'purchasing', 'edit'),
  canPrintPO: (user) => can(user, 'reports', 'view'),
  canApprovePO: (user) => getRole(user) === 'admin',
  canViewQueues: (user) => can(user, 'dashboard', 'view'),
  canDownloadBackup: (user) => can(user, 'settings', 'view'),
  canManageUsers: (user) => getRole(user) === 'admin',
}

export const poWorkflow = {
  canCreateDraft: (user) => can(user, 'purchasing', 'create'),
  canEditDraft: (user) => can(user, 'purchasing', 'edit'),
  canApprovePO: (user) => getRole(user) === 'admin',
  isDraft: (po) => po?.status === 'draft',
  isApproved: (po) => po?.status === 'approved',
}
