// src/pages/Settings.jsx
// F3: Users & Rights Management
// Admin-only page for user management

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/authContext'
import { access } from '../lib/permissions'
import { Plus, Trash2, Check, X } from 'lucide-react'

function UsersAndRights() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserRole, setNewUserRole] = useState('merchandiser')
  const [creating, setCreating] = useState(false)

  // Admin-only check
  if (!access.canManageUsers(user)) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
        <p>Access Denied. Only admins can manage users.</p>
      </div>
    )
  }

  // Load users
  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('users')
        .select('id, email, role, is_active, created_at')
        .order('created_at', { ascending: false })
      setUsers(data || [])
    } catch (err) {
      console.error('Fetch users error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async () => {
    if (!newUserEmail.trim()) {
      alert('Email required')
      return
    }

    setCreating(true)
    try {
      // Create auth user
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: newUserEmail,
        password: Math.random().toString(36).slice(-12), // Generate temp password
        email_confirm: true,
      })

      if (authErr) throw authErr

      // Create user record in users table
      const { error: dbErr } = await supabase.from('users').insert({
        id: authData.user.id,
        email: newUserEmail,
        role: newUserRole,
        is_active: true,
      })

      if (dbErr) throw dbErr

      alert(`User created: ${newUserEmail}\nRole: ${newUserRole}`)
      setNewUserEmail('')
      setNewUserRole('merchandiser')
      setShowCreateForm(false)
      fetchUsers()
    } catch (err) {
      alert(`Error creating user: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (userId, currentActive) => {
    try {
      await supabase
        .from('users')
        .update({ is_active: !currentActive })
        .eq('id', userId)
      fetchUsers()
    } catch (err) {
      alert(`Error updating user: ${err.message}`)
    }
  }

  const handleChangeRole = async (userId, newRole) => {
    try {
      await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)
      fetchUsers()
    } catch (err) {
      alert(`Error updating role: ${err.message}`)
    }
  }

  const styles = {
    container: {
      padding: '24px',
      background: '#f7f7f5',
      minHeight: '100vh',
    },
    card: {
      background: '#fff',
      border: '1px solid #ebebeb',
      borderRadius: '6px',
      padding: '20px',
      marginBottom: '20px',
    },
    header: {
      fontSize: '18px',
      fontWeight: '600',
      marginBottom: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
    },
    th: {
      textAlign: 'left',
      padding: '10px',
      borderBottom: '1px solid #e5e5e5',
      fontWeight: '600',
      background: '#fafaf8',
      color: '#666',
    },
    td: {
      padding: '12px 10px',
      borderBottom: '1px solid #f0f0f0',
    },
    badge: {
      display: 'inline-block',
      padding: '4px 10px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    badgeAdmin: {
      background: '#fee2e2',
      color: '#991b1b',
    },
    badgeGM: {
      background: '#dbeafe',
      color: '#1e40af',
    },
    badgeMerchandiser: {
      background: '#dcfce7',
      color: '#166534',
    },
    selectRole: {
      padding: '6px',
      borderRadius: '4px',
      border: '1px solid #ddd',
      fontSize: '12px',
      fontFamily: 'inherit',
      minWidth: '120px',
    },
    button: {
      padding: '8px 16px',
      borderRadius: '4px',
      border: 'none',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    buttonPrimary: {
      background: '#2383e2',
      color: '#fff',
    },
    buttonDanger: {
      background: '#ef4444',
      color: '#fff',
      padding: '4px 8px',
    },
    buttonSecondary: {
      background: '#e5e5e5',
      color: '#333',
    },
    form: {
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-end',
      marginBottom: '20px',
    },
    input: {
      padding: '8px 12px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      fontSize: '13px',
      fontFamily: 'inherit',
      flex: 1,
      maxWidth: '300px',
    },
  }

  const getBadgeStyle = (role) => {
    const base = styles.badge
    const roleStyles = {
      admin: styles.badgeAdmin,
      gm: styles.badgeGM,
      merchandiser: styles.badgeMerchandiser,
    }
    return { ...base, ...roleStyles[role] }
  }

  if (loading) {
    return <div style={styles.container}>Loading users...</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>Users & Rights</div>
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Create User
          </button>
        </div>

        {showCreateForm && (
          <div style={styles.form}>
            <input
              type="email"
              placeholder="Email address"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              style={styles.input}
            />
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
              style={styles.selectRole}
            >
              <option value="admin">Admin</option>
              <option value="gm">GM</option>
              <option value="merchandiser">Merchandiser</option>
            </select>
            <button
              style={{ ...styles.button, ...styles.buttonPrimary }}
              onClick={handleCreateUser}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </button>
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
                <td colSpan="5" style={{ ...styles.td, textAlign: 'center', color: '#9ca3af' }}>
                  No users yet
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>
                    <select
                      value={u.role}
                      onChange={(e) => handleChangeRole(u.id, e.target.value)}
                      style={styles.selectRole}
                    >
                      <option value="admin">Admin</option>
                      <option value="gm">GM</option>
                      <option value="merchandiser">Merchandiser</option>
                    </select>
                  </td>
                  <td style={styles.td}>
                    <span style={getBadgeStyle(u.role)}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td style={styles.td}>
                    <button
                      style={{ ...styles.button, ...styles.buttonSecondary, marginRight: '6px' }}
                      onClick={() => handleToggleActive(u.id, u.is_active)}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ marginTop: '20px', fontSize: '12px', color: '#9ca3af' }}>
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
