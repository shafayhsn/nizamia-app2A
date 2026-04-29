import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { MODULES, ACTIONS } from '../lib/permissions'

const actionLabels = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' }

export default function RolesPermissions() {
  const [roles, setRoles] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [perms, setPerms] = useState({})
  const [newRoleName, setNewRoleName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const selectedRole = useMemo(() => roles.find(r => r.id === selectedId), [roles, selectedId])
  const adminLocked = selectedRole?.name === 'admin'

  useEffect(() => { loadRoles() }, [])
  useEffect(() => { if (selectedId) loadPermissions(selectedId) }, [selectedId])

  function blankPerms(full = false) {
    const obj = {}
    MODULES.forEach(m => { obj[m.key] = { view: full, create: full, edit: full, delete: full } })
    return obj
  }

  async function loadRoles() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('roles').select('id, name, created_at').order('name')
      if (error) throw error
      const list = data || []
      setRoles(list)
      setSelectedId(prev => prev || list.find(r => r.name === 'merchandiser')?.id || list[0]?.id || '')
    } catch (err) {
      alert(`Error loading roles: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadPermissions(roleId) {
    const role = roles.find(r => r.id === roleId)
    if (role?.name === 'admin') {
      setPerms(blankPerms(true))
      return
    }
    const { data, error } = await supabase.from('permissions').select('*').eq('role_id', roleId)
    if (error) {
      alert(`Error loading permissions: ${error.message}`)
      return
    }
    const next = blankPerms(false)
    ;(data || []).forEach(row => {
      next[row.module] = {
        view: !!row.can_view,
        create: !!row.can_create,
        edit: !!row.can_edit,
        delete: !!row.can_delete,
      }
    })
    setPerms(next)
  }

  async function addRole() {
    const name = newRoleName.trim().toLowerCase().replace(/\s+/g, '_')
    if (!name) return alert('Enter role name.')
    if (name === 'admin') return alert('Admin role already exists and is locked.')
    setSaving(true)
    try {
      const { data, error } = await supabase.from('roles').insert({ name }).select('id, name, created_at').single()
      if (error) throw error
      await Promise.all(MODULES.map(m => supabase.from('permissions').insert({ role_id: data.id, module: m.key })))
      setNewRoleName('')
      await loadRoles()
      setSelectedId(data.id)
    } catch (err) {
      alert(`Error adding role: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function toggle(module, action) {
    if (adminLocked) return
    setPerms(prev => ({
      ...prev,
      [module]: { ...(prev[module] || {}), [action]: !prev[module]?.[action] }
    }))
  }

  async function savePermissions() {
    if (!selectedId || adminLocked) return
    setSaving(true)
    try {
      const rows = MODULES.map(m => ({
        role_id: selectedId,
        module: m.key,
        can_view: !!perms[m.key]?.view,
        can_create: !!perms[m.key]?.create,
        can_edit: !!perms[m.key]?.edit,
        can_delete: !!perms[m.key]?.delete,
      }))
      const { error } = await supabase.from('permissions').upsert(rows, { onConflict: 'role_id,module' })
      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      alert(`Error saving permissions: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const styles = {
    wrap: { display: 'grid', gridTemplateColumns: '230px 1fr', gap: 16, minHeight: 440 },
    side: { border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, background: '#fafafa' },
    roleBtn: active => ({ width: '100%', textAlign: 'left', border: '1px solid ' + (active ? '#111827' : '#e5e7eb'), background: active ? '#111827' : '#fff', color: active ? '#fff' : '#111827', borderRadius: 10, padding: '10px 12px', fontWeight: 800, fontSize: 13, marginBottom: 8, cursor: 'pointer' }),
    input: { width: '100%', height: 34, border: '1px solid #e5e7eb', borderRadius: 9, padding: '0 10px', fontSize: 13, boxSizing: 'border-box' },
    btn: { height: 34, border: 'none', background: '#111827', color: '#fff', borderRadius: 9, padding: '0 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: .35 },
    td: { padding: 10, borderBottom: '1px solid #f1f5f9' },
  }

  if (loading) return <div style={{ padding: 24 }}>Loading roles...</div>

  return (
    <div style={styles.wrap}>
      <div style={styles.side}>
        <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 900, marginBottom: 10, textTransform: 'uppercase' }}>Roles</div>
        {roles.map(r => (
          <button key={r.id} style={styles.roleBtn(r.id === selectedId)} onClick={() => setSelectedId(r.id)}>
            {r.name === 'admin' ? 'Admin 🔒' : r.name}
          </button>
        ))}
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 12, paddingTop: 12 }}>
          <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="New role name" style={styles.input} />
          <button onClick={addRole} disabled={saving} style={{ ...styles.btn, width: '100%', marginTop: 8 }}>{saving ? 'Saving...' : '+ Add Role'}</button>
        </div>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
        <div style={{ height: 50, padding: '0 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 900, color: '#111827' }}>{selectedRole?.name || 'Select role'}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{adminLocked ? 'Admin always has full access and cannot be edited.' : 'Tick permissions for this role.'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 900 }}>Saved</span>}
            <button onClick={savePermissions} disabled={saving || adminLocked} style={{ ...styles.btn, opacity: adminLocked ? .45 : 1 }}>{saving ? 'Saving...' : 'Save Permissions'}</button>
          </div>
        </div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Module</th>
              {ACTIONS.map(a => <th key={a} style={{ ...styles.th, textAlign: 'center' }}>{actionLabels[a]}</th>)}
            </tr>
          </thead>
          <tbody>
            {MODULES.map(m => (
              <tr key={m.key}>
                <td style={{ ...styles.td, fontWeight: 800 }}>{m.label}</td>
                {ACTIONS.map(a => (
                  <td key={a} style={{ ...styles.td, textAlign: 'center' }}>
                    <input type="checkbox" checked={!!perms[m.key]?.[a]} disabled={adminLocked} onChange={() => toggle(m.key, a)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
