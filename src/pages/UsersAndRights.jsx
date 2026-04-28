// src/pages/UsersAndRights.jsx
// F3: Users & Rights Management — Admin-only user role/profile management

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/authContext'
import { Plus } from 'lucide-react'

function getRole(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  return value.role || null
}

function UsersAndRights() {
  const { user, userRole, loading: authLoading } = useAuth()
  const currentRole = getRole(userRole) || getRole(user)
  const isAdmin = currentRole === 'admin'

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserRole, setNewUserRole] = useState('merchandiser')
  const [saving, setSaving] = useState(false)

  const fetchUsers = async () => {
    if (!isAdmin) {
      setUsers([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role, is_active, created_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data || [])
    } catch (err) {
      console.error('Fetch users error:', err)
      alert(`Error loading users: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading) fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdmin])

  const handleSaveUserProfile = async () => {
    const id = newUserId.trim()
    const email = newUserEmail.trim().toLowerCase()

    if (!id || !email) {
      alert('Auth User ID and Email are required. Create the user in Supabase Auth first, then paste the Auth User ID here.')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('users').upsert({
        id,
        email,
        role: newUserRole,
        is_active: true,
      })

      if (error) throw error

      alert(`User profile saved: ${email}\nRole: ${newUserRole}`)
      setNewUserId('')
      setNewUserEmail('')
      setNewUserRole('merchandiser')
      setShowCreateForm(false)
      fetchUsers()
    } catch (err) {
      alert(`Error saving user profile: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (userId, currentActive) => {
    if (userId === user?.id && currentActive) {
      alert('You cannot deactivate your own admin user while logged in.')
      return
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !currentActive })
        .eq('id', userId)

      if (error) throw error
      fetchUsers()
    } catch (err) {
      alert(`Error updating user: ${err.message}`)
    }
  }

  const handleChangeRole = async (userId, newRole) => {
    if (userId === user?.id && newRole !== 'admin') {
      alert('You cannot remove admin role from your own logged-in user.')
      return
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)

      if (error) throw error
      fetchUsers()
    } catch (err) {
      alert(`Error updating role: ${err.message}`)
    }
  }

  const styles = {
    container: { padding: '24px', background: '#f7f7f5', minHeight: '360px' },
    card: { background: '#fff', border: '1px solid #ebebeb', borderRadius: '6px', padding: '20px', marginBottom: '20px' },
    header: { fontSize: '18px', fontWeight: '600', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
    th: { textAlign: 'left', padding: '10px', borderBottom: '1px solid #e5e5e5', fontWeight: '600', background: '#fafaf8', color: '#666' },
    td: { padding: '12px 10px', borderBottom: '1px solid #f0f0f0' },
    badge: { display: 'inline-block', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' },
    badgeAdmin: { background: '#fee2e2', color: '#991b1b' },
    badgeGM: { background: '#dbeafe', color: '#1e40af' },
    badgeMerchandiser: { background: '#dcfce7', color: '#166534' },
    selectRole: { padding: '6px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit', minWidth: '120px' },
    button: { padding: '8px 16px', borderRadius: '4px', border: 'none', fontSize: '12px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' },
    buttonPrimary: { background: '#111827', color: '#fff' },
    buttonSecondary: { background: '#e5e5e5', color: '#333' },
    form: { display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 160px auto auto', gap: '12px', alignItems: 'end', marginBottom: '20px' },
    input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit', width: '100%' },
    note: { fontSize: '12px', color: '#6b7280', lineHeight: 1.6, marginTop: '10px' },
  }

  const getBadgeStyle = (role) => {
    const roleStyles = { admin: styles.badgeAdmin, gm: styles.badgeGM, merchandiser: styles.badgeMerchandiser }
    return { ...styles.badge, ...(roleStyles[role] || {}) }
  }

  if (authLoading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Checking access...</div>
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
        <p>Access Denied. Only admins can manage users.</p>
      </div>
    )
  }

  if (loading) {
    return <div style={styles.container}>Loading users...</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>Users & Rights</div>
          <button style={{ ...styles.button, ...styles.buttonPrimary }} onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Add User Profile
          </button>
        </div>

        {showCreateForm && (
          <div>
            <div style={styles.form}>
              <input
                type="text"
                placeholder="Auth User ID (UUID)"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                style={styles.input}
              />
              <input
                type="email"
                placeholder="Email address"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                style={styles.input}
              />
              <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} style={styles.selectRole}>
                <option value="admin">Admin</option>
                <option value="gm">GM</option>
                <option value="merchandiser">Merchandiser</option>
              </select>
              <button style={{ ...styles.button, ...styles.buttonPrimary }} onClick={handleSaveUserProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button style={{ ...styles.button, ...styles.buttonSecondary }} onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
            </div>
            <div style={styles.note}>
              Create the login user first in <strong>Supabase → Authentication → Users</strong>, then paste that Auth User ID here. This keeps admin credentials safe in the browser app.
            </div>
          </div>
        )}

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Created</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ ...styles.td, textAlign: 'center', color: '#9ca3af' }}>No users yet</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>
                    <select value={u.role} onChange={(e) => handleChangeRole(u.id, e.target.value)} style={styles.selectRole}>
                      <option value="admin">Admin</option>
                      <option value="gm">GM</option>
                      <option value="merchandiser">Merchandiser</option>
                    </select>
                  </td>
                  <td style={styles.td}>
                    <span style={getBadgeStyle(u.role)}>{u.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td style={styles.td}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  <td style={styles.td}>
                    <button style={{ ...styles.button, ...styles.buttonSecondary }} onClick={() => handleToggleActive(u.id, u.is_active)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={styles.note}>
          <p><strong>Roles:</strong></p>
          <ul style={{ marginLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>Admin:</strong> Full access, can manage users</li>
            <li><strong>GM:</strong> Can create/approve POs, manage orders, download backups</li>
            <li><strong>Merchandiser:</strong> Can create/edit POs and orders, but cannot approve</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default UsersAndRights
