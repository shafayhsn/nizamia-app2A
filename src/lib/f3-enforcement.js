// src/lib/f3-enforcement.js
// F3: Enforcement helpers for Orders, Purchasing, Suppliers, Buyers, Library

import { can } from './permissions'

/**
 * Enforce permission before action
 * Returns true if allowed, false if denied (alert shown)
 */
export async function enforcePermission(user, appDialogs, module, action, actionName = 'Action') {
  if (!user) {
    await appDialogs.alert('Not Authenticated', 'You must be logged in')
    return false
  }
  
  if (!can(user, module, action)) {
    await appDialogs.alert(
      'Access Denied',
      `You do not have permission to ${actionName.toLowerCase()}. Required: ${module}/${action}`
    )
    return false
  }
  
  return true
}

/**
 * Master data deactivation instead of hard delete
 */
export async function deactivateEntity(supabase, table, id, appDialogs) {
  try {
    const { error } = await supabase
      .from(table)
      .update({ is_active: false })
      .eq('id', id)
    
    if (error) throw error
    return { success: true }
  } catch (err) {
    await appDialogs.alert('Error', `Failed to deactivate: ${err.message}`)
    return { success: false }
  }
}

/**
 * Filter to show only active entities
 */
export function filterActive(entities = []) {
  return entities.filter(e => e.is_active !== false)
}

/**
 * Get PO display info with masking
 */
export function getPODisplayInfo(po) {
  const isApproved = po?.status === 'approved'
  return {
    isApproved,
    statusLabel: isApproved ? 'APPROVED' : 'DRAFT',
    statusColor: isApproved ? '#15803d' : '#b91c1c',
  }
}

/**
 * Mask supplier name in draft POs
 */
export function getMaskedSupplier(supplierName, poStatus) {
  if (poStatus === 'draft') {
    return '****'
  }
  return supplierName || '—'
}
