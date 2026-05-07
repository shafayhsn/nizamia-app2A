// src/lib/poApproval.js
// F3: PO Approval & Printing Logic

import { can } from './permissions'

/**
 * Check if user can approve a PO
 */
export function canApprovePO(user) {
  return can(user, 'po', 'approve')
}

/**
 * Check if PO is in draft status
 */
export function isDraftPO(po) {
  return po?.status === 'draft'
}

/**
 * Check if PO is approved
 */
export function isApprovedPO(po) {
  return po?.status === 'approved'
}

/**
 * Get display status badge for PO
 */
export function getPOStatusBadge(po) {
  if (isDraftPO(po)) {
    return {
      label: 'DRAFT',
      style: { background: '#fef2f2', color: '#991b1b' },
    }
  }
  if (isApprovedPO(po)) {
    return {
      label: 'APPROVED',
      style: { background: '#dcfce7', color: '#166534' },
    }
  }
  return {
    label: 'UNKNOWN',
    style: { background: '#f3f4f6', color: '#6b7280' },
  }
}

/**
 * CRITICAL: Apply masking rules for PO printing
 * - If draft: mask supplier name
 * - If approved: show real supplier
 */
export function getMaskedSupplierForPrint(supplier, poStatus) {
  if (isDraftPO({ status: poStatus })) {
    return '****' // Mask in draft
  }
  return supplier || '—'
}

/**
 * Process PO item for printing with approval logic
 * Applies masking and status indicators
 */
export function processPOItemForPrint(item, poStatus) {
  return {
    ...item,
    supplier_name: getMaskedSupplierForPrint(item.supplier_name, poStatus),
    po_status: poStatus,
  }
}

/**
 * Get approval button state
 */
export function getApprovalButtonState(po, user) {
  return {
    canApprove: canApprovePO(user) && isDraftPO(po),
    canUnapprove: canApprovePO(user) && isApprovedPO(po),
    isDraft: isDraftPO(po),
    isApproved: isApprovedPO(po),
  }
}
