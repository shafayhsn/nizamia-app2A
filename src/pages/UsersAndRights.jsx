import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/authContext'
import { Plus } from 'lucide-react'

function getRole(value) { return typeof value === 'string' ? value : value?.role || null }

export default function UsersAndRights({ embedded = false }) {
  const { user, userRole, loading: authLoading, refreshUser } = useAuth()
  const currentRole = getRole(userRole) || getRole(user)
  const isAdmin = String(currentRole || '').toLowerCase() === 'admin'
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newUserRole, setNewUserRole] = useState('admin')
  const [saving, setSaving] = useState(false)

  const fetchUsers = async () => {
    if (!isAdmin) { setUsers([]); setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase.from('users').select('id, email, username, role, is_active, created_at').order('created_at', { ascending: false })
      if (error) throw error
      setUsers(data || [])
    } catch (err) { alert(`Error loading users: ${err.message}`) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (!authLoading) fetchUsers() }, [authLoading, isAdmin])

  const handleSaveUserProfile = async () => {
    const id = newUserId.trim()
    const email = newUserEmail.trim().toLowerCase()
    const username = newUsername.trim().toLowerCase()
    const role = newUserRole.trim()
    if (!id || !email || !username || !role) { alert('Auth User ID, Email, Username and Role are required.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('users').upsert({ id, email, username, role, is_active: true })
      if (error) throw error
      alert(`User profile saved: ${username}\nRole: ${role}`)
      setNewUserId(''); setNewUserEmail(''); setNewUsername(''); setNewUserRole('admin'); setShowCreateForm(false); fetchUsers(); refreshUser?.()
    } catch (err) { alert(`Error saving user profile: ${err.message}`) }
    finally { setSaving(false) }
  }

  const handleToggleActive = async (userId, currentActive) => {
    if (userId === user?.id && currentActive) { alert('You cannot deactivate your own logged-in user.'); return }
    const { error } = await supabase.from('users').update({ is_active: !currentActive }).eq('id', userId)
    if (error) alert(`Error updating user: ${error.message}`); else fetchUsers()
  }

  const updateField = async (userId, patch) => {
    if (userId === user?.id && patch.role && String(patch.role).toLowerCase() !== 'admin') { alert('You cannot remove admin role from your own logged-in user.'); return }
    const { error } = await supabase.from('users').update(patch).eq('id', userId)
    if (error) alert(`Error updating user: ${error.message}`); else { fetchUsers(); refreshUser?.() }
  }

  if (authLoading) return <div className="empty-state"><p>Checking access...</p></div>
  if (!isAdmin) return <div className="empty-state"><p>Access denied. Only admin role can manage users.</p><p>Current role: {currentRole || 'not found'}</p></div>
  if (loading) return <div className="empty-state"><p>Loading users...</p></div>

  return <div className={embedded ? 'users-embedded' : 'page-content'}>
    {!embedded && <div className="section-header"><div><h1>User Management</h1><div className="page-subtitle">Users, usernames and fully custom roles</div></div></div>}
    <div className="card card-pad">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontWeight:800 }}>Users & Rights</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(!showCreateForm)}><Plus size={14} /> Add User Profile</button>
      </div>
      {showCreateForm && <div className="user-create-grid">
        <input className="input" placeholder="Auth User ID (UUID)" value={newUserId} onChange={e => setNewUserId(e.target.value)} />
        <input className="input" type="email" placeholder="Email address" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
        <input className="input" placeholder="Manual username" value={newUsername} onChange={e => setNewUsername(e.target.value)} />
        <input className="input" placeholder="Custom role e.g. admin, purchase-manager" value={newUserRole} onChange={e => setNewUserRole(e.target.value)} />
        <button className="btn btn-primary" onClick={handleSaveUserProfile} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        <button className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
        <div className="settings-note">Create the login user first in Supabase Authentication, then paste Auth User ID here. Username is manual and used for login.</div>
      </div>}
      <div className="table-wrap"><table><thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        {users.length === 0 ? <tr><td colSpan="6" style={{ textAlign:'center', color:'#999' }}>No users yet</td></tr> : users.map(u => <tr key={u.id}>
          <td><input className="input" defaultValue={u.username || ''} onBlur={e => { const v=e.target.value.trim().toLowerCase(); if (v !== (u.username || '')) updateField(u.id, { username:v }) }} /></td>
          <td>{u.email}</td>
          <td><input className="input" defaultValue={u.role || ''} onBlur={e => { const v=e.target.value.trim(); if (v !== (u.role || '')) updateField(u.id, { role:v }) }} /></td>
          <td><span className={`badge ${u.is_active ? 'badge-active' : 'badge-cancelled'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
          <td><button className="btn btn-secondary btn-sm" onClick={() => handleToggleActive(u.id, u.is_active)}>{u.is_active ? 'Deactivate' : 'Activate'}</button></td>
        </tr>)}
      </tbody></table></div>
      <div className="settings-note"><strong>Custom roles:</strong> write any role name. Keep at least one user as <strong>admin</strong> because admin access is still protected by that role name.</div>
    </div>
  </div>
}
