// src/lib/permissions.js
// F3: Users & Rights System — Permissions & Auth Helpers

/**
 * Role-based permission structure
 * Admin has implicit 'all' access
 * Define only what GM and Merchandiser can do
 */
export const PERMISSIONS = {
  admin: 'all', // Special case: admin can do anything
  gm: {
    orders: ['view', 'create', 'edit'],
    po: ['create', 'edit', 'print', 'approve'],
    queues: ['view'],
    backup: ['download'],
    users: ['view'], // Can view users list
  },
  merchandiser: {
    orders: ['view', 'create', 'edit'],
    po: ['create', 'edit', 'print'], // Cannot approve
    queues: ['view'],
    users: [], // Cannot manage users
  },
};

/**
 * Check if user has permission for module.action
 * @param {Object} user - User object with role property
 * @param {string} module - Module name (orders, po, queues, etc.)
 * @param {string} action - Action name (view, create, edit, approve, etc.)
 * @returns {boolean}
 */
export function getRole(user) {
  if (!user) return null;
  if (typeof user === 'string') return user;
  return user.role || user.userRole?.role || null;
}

export function can(user, module, action) {
  const role = getRole(user);
  if (!role) return false;

  // Admin can do everything
  if (role === 'admin') return true;

  // Check if module exists for this role
  const modulePerms = PERMISSIONS[role]?.[module];
  if (!modulePerms) return false;

  // Check if action is in the list
  return modulePerms.includes(action);
}

/**
 * Shorthand for common checks
 */
export const access = {
  canViewOrders: (user) => can(user, 'orders', 'view'),
  canCreateOrder: (user) => can(user, 'orders', 'create'),
  canEditOrder: (user) => can(user, 'orders', 'edit'),

  canCreatePO: (user) => can(user, 'po', 'create'),
  canEditPO: (user) => can(user, 'po', 'edit'),
  canPrintPO: (user) => can(user, 'po', 'print'),
  canApprovePO: (user) => can(user, 'po', 'approve'),

  canViewQueues: (user) => can(user, 'queues', 'view'),

  canDownloadBackup: (user) => can(user, 'backup', 'download'),
  canManageUsers: (user) => getRole(user) === 'admin',
};

/**
 * Approval workflow for POs
 * - Merchandiser: can create/edit, cannot approve
 * - GM/Admin: can approve/unapprove
 */
export const poWorkflow = {
  canCreateDraft: (user) => can(user, 'po', 'create'),
  canEditDraft: (user) => can(user, 'po', 'edit'),
  canApprovePO: (user) => can(user, 'po', 'approve'),
  isDraft: (po) => po?.status === 'draft',
  isApproved: (po) => po?.status === 'approved',
};
