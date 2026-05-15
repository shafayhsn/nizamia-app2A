// src/lib/softDelete.js
// F3: Soft Delete Utilities
// Instead of hard delete, use is_active flag

/**
 * Prevent hard deletes for protected entities
 * Call this in delete handlers for:
 * - suppliers
 * - buyers
 * - library items
 */
export function blockHardDelete(entityType) {
  console.warn(`Hard delete of ${entityType} is disabled. Use deactivate instead.`)
  return {
    blocked: true,
    message: `${entityType} records cannot be deleted. Please deactivate instead.`,
  }
}

/**
 * Deactivate an entity instead of deleting
 * Updates is_active = false in database
 */
export async function deactivateEntity(supabase, table, id) {
  try {
    const { error } = await supabase
      .from(table)
      .update({ is_active: false })
      .eq('id', id)
    
    if (error) throw error
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Reactivate a deactivated entity
 */
export async function reactivateEntity(supabase, table, id) {
  try {
    const { error } = await supabase
      .from(table)
      .update({ is_active: true })
      .eq('id', id)
    
    if (error) throw error
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Filter to show only active entities
 * Use in dropdowns and lists
 */
export function filterActiveEntities(entities = []) {
  return entities.filter(e => e.is_active !== false)
}

/**
 * Get both active and inactive for admin view
 */
export function filterEntitiesByStatus(entities = [], status = 'active') {
  if (status === 'active') {
    return entities.filter(e => e.is_active !== false)
  }
  if (status === 'inactive') {
    return entities.filter(e => e.is_active === false)
  }
  return entities // All
}
