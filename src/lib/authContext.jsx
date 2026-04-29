// src/lib/authContext.jsx
// App-table login gate for Nizamia OMS + DB role permissions

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { MODULES } from './permissions'

const AuthContext = createContext(null)
const AUTH_TIMEOUT_MS = 5000
const APP_USER_KEY = 'nizamia_app2a_user'

function withTimeout(promise, ms = AUTH_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Auth request timed out.')), ms)),
  ])
}

function emptyPermissionMap() {
  return MODULES.reduce((acc, m) => {
    acc[m.key] = { view: false, create: false, edit: false, delete: false }
    return acc
  }, {})
}

function fullPermissionMap() {
  return MODULES.reduce((acc, m) => {
    acc[m.key] = { view: true, create: true, edit: true, delete: true }
    return acc
  }, {})
}

function mapPermissionRows(rows = []) {
  const out = emptyPermissionMap()
  rows.forEach(r => {
    if (!r?.module) return
    out[r.module] = {
      view: !!r.can_view,
      create: !!r.can_create,
      edit: !!r.can_edit,
      delete: !!r.can_delete,
    }
  })
  return out
}

async function loadRolePermissions(userData) {
  const role = userData?.role || userData?.roles?.name || null
  if (role === 'admin') return fullPermissionMap()
  const roleId = userData?.role_id || userData?.roles?.id
  if (!roleId) return null
  const { data, error } = await withTimeout(
    supabase.from('permissions').select('module, can_view, can_create, can_edit, can_delete').eq('role_id', roleId)
  ).catch(error => ({ data: null, error }))
  if (error) {
    console.warn('Permission load failed:', error.message)
    return null
  }
  return mapPermissionRows(data || [])
}

async function normalizeAppUser(userData) {
  if (!userData) return null
  const roleName = userData.role || userData.roles?.name || 'merchandiser'
  const username = userData.username || userData.name || userData.display_name || ''
  const permissions = await loadRolePermissions({ ...userData, role: roleName })
  return {
    id: userData.id,
    email: userData.email,
    username,
    displayName: username || userData.email,
    role: roleName,
    role_id: userData.role_id || userData.roles?.id || null,
    is_active: userData.is_active !== false,
    permissions,
  }
}

function safeSaveSession(appUser) {
  if (!appUser) localStorage.removeItem(APP_USER_KEY)
  else localStorage.setItem(APP_USER_KEY, JSON.stringify(appUser))
}

function safeReadSession() {
  try {
    const raw = localStorage.getItem(APP_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    localStorage.removeItem(APP_USER_KEY)
    return null
  }
}

async function fetchUserById(id) {
  if (!id) return { data: null, error: null }
  const columns = 'id, email, username, role, role_id, is_active, roles(id, name)'
  const basicColumns = 'id, email, username, role, is_active'
  const res = await withTimeout(supabase.from('users').select(columns).eq('id', id).maybeSingle()).catch(error => ({ data: null, error }))
  if (!res.error) return res
  return withTimeout(supabase.from('users').select(basicColumns).eq('id', id).maybeSingle()).catch(error => ({ data: null, error }))
}

async function findUserByIdentifier(identifier) {
  const clean = String(identifier || '').trim()
  if (!clean) return { data: null, error: null }

  const hasAt = clean.includes('@')
  const emailValue = clean.toLowerCase()
  const loginColumns = 'id, email, username, role, role_id, is_active, password_hash, roles(id, name)'
  const basicColumns = 'id, email, username, role, is_active, password_hash'

  const run = async (field, value) => {
    const res = await withTimeout(supabase.from('users').select(loginColumns).eq(field, value).maybeSingle()).catch(error => ({ data: null, error }))
    if (!res.error) return res
    return withTimeout(supabase.from('users').select(basicColumns).eq(field, value).maybeSingle()).catch(error => ({ data: null, error }))
  }

  if (hasAt) return run('email', emailValue)
  const byUsername = await run('username', clean)
  if (!byUsername.error && byUsername.data) return byUsername
  return { data: null, error: byUsername.error || null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const setAppUser = useCallback((appUser) => {
    setUser(appUser)
    setUserRole(appUser)
    safeSaveSession(appUser)
  }, [])

  const refreshUser = useCallback(async () => {
    const saved = safeReadSession()
    if (!saved?.id) return null
    const { data, error } = await fetchUserById(saved.id)
    if (error || !data || data.is_active === false) {
      setAppUser(null)
      return null
    }
    const appUser = await normalizeAppUser(data)
    setAppUser(appUser)
    return appUser
  }, [setAppUser])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const saved = safeReadSession()
        if (!cancelled && saved?.id) {
          setUser(saved)
          setUserRole(saved)
          await refreshUser()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [refreshUser])

  const login = async (identifier, password) => {
    const cleanIdentifier = String(identifier || '').trim()
    const cleanPassword = String(password || '')
    if (!cleanIdentifier || !cleanPassword) return { user: null, error: new Error('Username/email and password are required.') }

    const { data, error } = await findUserByIdentifier(cleanIdentifier)
    if (error || !data) return { user: null, error: new Error('Invalid username/email or password.') }
    if (data.is_active === false) return { user: null, error: new Error('This user is inactive.') }
    const storedPassword = data.password_hash ?? ''
    if (String(storedPassword || '') !== cleanPassword) return { user: null, error: new Error('Invalid username/email or password.') }

    const appUser = await normalizeAppUser(data)
    setAppUser(appUser)
    return { user: appUser, error: null }
  }

  const logout = async () => {
    setAppUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, userRole, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
