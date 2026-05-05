// src/pages/UsersAndRights.jsx
// App-2A Users Management — simple app users + role assignment

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/authContext'
import { Plus, KeyRound, ShieldSlash } from 'lucide-react'

const USER_COLUMNS = 'id, email, username, role, role_id, is_active, is_restricted, restricted_reason, restricted_at, created_at'

function getRole(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  return value.role || null
}

function UsersAndRights() {
  const { user, userRole, loading: authLoading, login, logout, refreshUser } = useAuth()
  const currentRole = getRole(userRole) || getRole(user)
  const isAdmin = currentRole === 'admin'

  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRoleId, setNewRoleId] = useState('')
  const [saving, setSaving] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const merchRole = roles.find(r => r.name === 'merchandiser')
  const adminRole = roles.find(r => r.name === 'admin')

  const handleAdminLogin = async () => {
    const email = loginEmail.trim()
    if (!email || !loginPassword) return setLoginError('Email/username and password are required.')
    setLoginLoading(true)
    setLoginError('')
    try {
      const result = await login(email, loginPassword)
      if (result?.error) throw result.error
      if (getRole(result?.user) !== 'admin') setLoginError('Login successful, but this user is not an admin.')
    } catch (err) {
      setLoginError(err.message || 'Login failed.')
    } finally {
      setLoginLoading(false)
    }
  }

  const fetchRoles = async () => {
    const { data, error } = await supabase.from('roles').select('id, name').order('name')
    if (error) throw error
    setRoles(data || [])
    if (!newRoleId) setNewRoleId((data || []).find(r => r.name === 'merchandiser')?.id || (data || [])[0]?.id || '')
    return data || []
  }

  const fetchUsers = async () => {
    if (!isAdmin) { setUsers([]); setLoading(false); return }
    setLoading(true)
    try {
      await fetchRoles()
      const { data, error } = await supabase.from('users').select(USER_COLUMNS).order('created_at', { ascending: false })
      if (error) throw error
      setUsers((data || []).map(u => ({ ...u, username: u.username || '', roleName: u.role || 'merchandiser' })))
    } catch (err) {
      console.error('Fetch users error:', err)
      alert(`Error loading users: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (!authLoading) fetchUsers() }, [authLoading, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveUserProfile = async () => {
    const email = newUserEmail.trim().toLowerCase()
    const username = newUsername.trim()
    const password = newPassword.trim()
    const selectedRole = roles.find(r => r.id === newRoleId) || merchRole
    if (!email || !username || !password) return alert('Email, username and password are required.')
    if (!selectedRole) return alert('Create roles first.')

    setSaving(true)
    try {
      const { error } = await supabase.from('users').insert({
        email,
        username,
        password_hash: password,
        role: selectedRole.name,
        role_id: selectedRole.id,
        is_active: true,
      })
      if (error) throw error
      alert(`User created: ${username}\nRole: ${selectedRole.name}`)
      setNewUserEmail(''); setNewUsername(''); setNewPassword(''); setNewRoleId(merchRole?.id || '')
      setShowCreateForm(false)
      fetchUsers()
    } catch (err) {
      alert(`Error saving user profile: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (userId, currentActive) => {
    if (userId === user?.id && currentActive) return alert('You cannot deactivate your own admin user while logged in.')
    const { error } = await supabase.from('users').update({ is_active: !currentActive }).eq('id', userId)
    if (error) return alert(`Error updating user: ${error.message}`)
    fetchUsers()
  }

  const handleChangePassword = async (targetUser) => {
    if (!isAdmin) return alert('Only admins can change passwords.')
    const pw1 = window.prompt(`New password for ${targetUser.username || targetUser.email}:`)
    if (pw1 === null) return
    if (String(pw1).length < 6) return alert('Password must be at least 6 characters.')
    const pw2 = window.prompt('Confirm new password:')
    if (pw2 === null) return
    if (pw1 !== pw2) return alert('Passwords do not match.')
    const { error } = await supabase.from('users').update({ password_hash: pw1 }).eq('id', targetUser.id)
    if (error) return alert(`Error changing password: ${error.message}`)
    alert('Password updated successfully.')
  }

  const handleToggleRestrict = async (targetUser) => {
    if (!isAdmin) return alert('Only admins can restrict users.')
    if (targetUser.id === user?.id) return alert('You cannot restrict your own logged-in admin user.')
    if (targetUser.is_restricted) {
      if (!window.confirm(`Unrestrict ${targetUser.username || targetUser.email}?`)) return
      const { error } = await supabase.from('users').update({ is_restricted: false, restricted_reason: null, restricted_at: null }).eq('id', targetUser.id)
      if (error) return alert(`Error unrestricting user: ${error.message}`)
      fetchUsers(); return
    }
    const reason = window.prompt(`Reason for temporarily restricting ${targetUser.username || targetUser.email}:`) || 'Restricted by admin'
    const { error } = await supabase.from('users').update({ is_restricted: true, restricted_reason: reason, restricted_at: new Date().toISOString() }).eq('id', targetUser.id)
    if (error) return alert(`Error restricting user: ${error.message}`)
    fetchUsers()
  }

  const handleChangeRole = async (targetUser, roleId) => {
    const role = roles.find(r => r.id === roleId)
    if (!role) return
    if (targetUser.id === user?.id && role.name !== 'admin') return alert('You cannot remove admin role from your own logged-in user.')
    const { error } = await supabase.from('users').update({ role: role.name, role_id: role.id }).eq('id', targetUser.id)
    if (error) return alert(`Error updating role: ${error.message}`)
    if (targetUser.id === user?.id) await refreshUser()
    fetchUsers()
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
    badgeDefault: { background: '#dcfce7', color: '#166534' },
    selectRole: { padding: '6px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '12px', fontFamily: 'inherit', minWidth: '140px' },
    button: { padding: '8px 16px', borderRadius: '4px', border: 'none', fontSize: '12px', fontWeight: '500', cursor: 'pointer' },
    buttonPrimary: { background: '#111827', color: '#fff' },
    buttonSecondary: { background: '#e5e5e5', color: '#333' },
    form: { display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 160px auto auto', gap: '12px', alignItems: 'end', marginBottom: '20px' },
    input: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
    note: { fontSize: '12px', color: '#6b7280', lineHeight: 1.6, marginTop: '10px' },
    error: { fontSize: '12px', color: '#dc2626', fontWeight: 700, marginTop: 10 },
  }

  const getBadgeStyle = (role) => ({ ...styles.badge, ...(role === 'admin' ? styles.badgeAdmin : styles.badgeDefault) })

  if (authLoading) return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Checking access...</div>
  if (!user) return (
    <div style={styles.container}><div style={{ ...styles.card, maxWidth: 460 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Admin Login</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Login with your App-2A admin email/username and password.</div>
      <input type="text" placeholder="Admin email or username" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} style={{ ...styles.input, marginBottom: 10 }} />
      <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin() }} style={{ ...styles.input, marginBottom: 12 }} />
      <button style={{ ...styles.button, ...styles.buttonPrimary }} onClick={handleAdminLogin} disabled={loginLoading}>{loginLoading ? 'Logging in...' : 'Login'}</button>
      {loginError && <div style={styles.error}>{loginError}</div>}
    </div></div>
  )
  if (!isAdmin) return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}><p>Access Denied. Only admins can manage users.</p><p style={{ fontSize: 12 }}>Current role: {currentRole || 'not found'}</p><button style={{ ...styles.button, ...styles.buttonSecondary }} onClick={logout}>Logout</button></div>
  if (loading) return <div style={styles.container}>Loading users...</div>

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>Users & Rights</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={{ ...styles.button, ...styles.buttonPrimary }} onClick={() => setShowCreateForm(!showCreateForm)}><Plus size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Add User</button>
          </div>
        </div>

        {showCreateForm && <div><div style={styles.form}>
          <input type="email" placeholder="Email address" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} style={styles.input} />
          <input type="text" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} style={styles.input} />
          <input type="password" placeholder="Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={styles.input} />
          <select value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)} style={styles.selectRole}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <button style={{ ...styles.button, ...styles.buttonPrimary }} onClick={handleSaveUserProfile} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button style={{ ...styles.button, ...styles.buttonSecondary }} onClick={() => setShowCreateForm(false)}>Cancel</button>
        </div><div style={styles.note}>Create users here only. No Supabase Auth setup required. Users can log in with either email or username.</div></div>}

        <table style={styles.table}><thead><tr><th style={styles.th}>Email</th><th style={styles.th}>Username</th><th style={styles.th}>Role</th><th style={styles.th}>Status</th><th style={styles.th}>Created</th><th style={styles.th}>Actions</th></tr></thead>
          <tbody>{users.length === 0 ? <tr><td colSpan="6" style={{ ...styles.td, textAlign: 'center', color: '#9ca3af' }}>No users yet</td></tr> : users.map((u) => (
            <tr key={u.id}>
              <td style={styles.td}>{u.email}</td><td style={styles.td}>{u.username || '—'}</td>
              <td style={styles.td}><select value={u.role_id || roles.find(r => r.name === u.roleName)?.id || ''} onChange={(e) => handleChangeRole(u, e.target.value)} style={styles.selectRole}>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
              <td style={styles.td}><span style={getBadgeStyle(u.roleName)}>{u.is_restricted ? 'Restricted' : (u.is_active ? 'Active' : 'Inactive')}</span>{u.is_restricted && <div style={{ fontSize:10, color:'#b91c1c', marginTop:4 }}>{u.restricted_reason || 'Restricted'}</div>}</td>
              <td style={styles.td}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
              <td style={styles.td}><div style={{ display:'flex', gap:6, flexWrap:'wrap' }}><button title="Change Password" style={{ ...styles.button, ...styles.buttonSecondary, padding:'7px 9px' }} onClick={() => handleChangePassword(u)}><KeyRound size={14} /></button><button title={u.is_restricted ? 'Unrestrict User' : 'Restrict User'} style={{ ...styles.button, ...styles.buttonSecondary, padding:'7px 9px' }} onClick={() => handleToggleRestrict(u)}><ShieldSlash size={14} /></button><button style={{ ...styles.button, ...styles.buttonSecondary }} onClick={() => handleToggleActive(u.id, u.is_active)}>{u.is_active ? 'Deactivate' : 'Activate'}</button></div></td>
            </tr>))}</tbody>
        </table>

        <div style={styles.note}>Roles are managed in Settings → Roles & Permissions. Admin stays full access.</div>
      </div>
    </div>
  )
}

export default UsersAndRights
