// src/lib/permissions.js
// F3: Users & Rights System — Permissions & Auth Helpers

export const PERMISSIONS = {
  admin: 'all',
  gm: {
    dashboard: ['view'],
    orders: ['view', 'create', 'edit'],
    po: ['view', 'create', 'edit', 'print', 'approve'],
    buyers: ['view', 'create', 'edit'],
    suppliers: ['view', 'create', 'edit'],
    sampling: ['view', 'create', 'edit', 'approve'],
    parcels: ['view', 'create', 'edit'],
    shipping: ['view', 'create', 'edit'],
    library: ['view', 'create', 'edit'],
    queues: ['view'],
    backup: ['download'],
    settings: ['view'],
    users: ['view'],
  },
  merchandiser: {
    dashboard: ['view'],
    orders: ['view', 'create', 'edit'],
    po: ['view', 'create', 'edit', 'print'],
    buyers: ['view'],
    suppliers: ['view'],
    sampling: ['view', 'create', 'edit'],
    parcels: ['view', 'create', 'edit'],
    shipping: ['view'],
    library: ['view'],
    queues: ['view'],
    users: [],
  },
};

export function getRole(user) {
  if (!user) return null;
  if (typeof user === 'string') return user;
  return user.role || user.userRole?.role || null;
}

export function can(user, module, action = 'view') {
  const role = getRole(user);
  if (!role) return false;
  if (role === 'admin') return true;
  const modulePerms = PERMISSIONS[role]?.[module];
  if (!modulePerms) return false;
  return modulePerms.includes(action);
}

export const access = {
  canViewDashboard: (user) => can(user, 'dashboard', 'view'),
  canViewOrders: (user) => can(user, 'orders', 'view'),
  canCreateOrder: (user) => can(user, 'orders', 'create'),
  canEditOrder: (user) => can(user, 'orders', 'edit'),
  canViewPO: (user) => can(user, 'po', 'view'),
  canCreatePO: (user) => can(user, 'po', 'create'),
  canEditPO: (user) => can(user, 'po', 'edit'),
  canPrintPO: (user) => can(user, 'po', 'print'),
  canApprovePO: (user) => can(user, 'po', 'approve'),
  canViewQueues: (user) => can(user, 'queues', 'view'),
  canDownloadBackup: (user) => can(user, 'backup', 'download'),
  canManageUsers: (user) => getRole(user) === 'admin',
};

export const poWorkflow = {
  canCreateDraft: (user) => can(user, 'po', 'create'),
  canEditDraft: (user) => can(user, 'po', 'edit'),
  canApprovePO: (user) => can(user, 'po', 'approve'),
  isDraft: (po) => po?.status === 'draft',
  isApproved: (po) => po?.status === 'approved',
};
