// src/lib/authContext.jsx
// App-table login gate for Nizamia OMS

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)
const AUTH_TIMEOUT_MS = 5000
const APP_USER_KEY = 'nizamia_app2a_user'

function withTimeout(promise, ms = AUTH_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Auth request timed out.')), ms)),
  ])
}

function normalizeAppUser(userData) {
  if (!userData) return null
  const username = userData.username || userData.name || userData.display_name || ''
  return {
    id: userData.id,
    email: userData.email,
    username,
    displayName: username || userData.email,
    role: userData.role,
    is_active: userData.is_active !== false,
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
  const columns = 'id, email, username, role, is_active'
  const basicColumns = 'id, email, role, is_active'
  const res = await withTimeout(supabase.from('users').select(columns).eq('id', id).maybeSingle()).catch(error => ({ data: null, error }))
  if (!res.error) return res
  const msg = String(res.error?.message || '').toLowerCase()
  if (msg.includes('username') || msg.includes('display_name') || msg.includes('name')) {
    return withTimeout(supabase.from('users').select(basicColumns).eq('id', id).maybeSingle())
  }
  return res
}

async function findUserByIdentifier(identifier) {
  const clean = String(identifier || '').trim()
  if (!clean) return { data: null, error: null }

  const hasAt = clean.includes('@')
  const emailValue = clean.toLowerCase()
  const loginColumns = 'id, email, username, role, is_active, password_hash'
  const basicColumns = 'id, email, role, is_active, password_hash'

  if (hasAt) {
    const byEmail = await withTimeout(supabase.from('users').select(loginColumns).eq('email', emailValue).maybeSingle()).catch(error => ({ data: null, error }))
    if (!byEmail.error) return byEmail
    const msg = String(byEmail.error?.message || '').toLowerCase()
    if (msg.includes('username') || msg.includes('display_name') || msg.includes('name')) {
      return withTimeout(supabase.from('users').select(basicColumns).eq('email', emailValue).maybeSingle())
    }
    return byEmail
  }

  const byUsername = await withTimeout(supabase.from('users').select(loginColumns).eq('username', clean).maybeSingle()).catch(error => ({ data: null, error }))
  if (!byUsername.error && byUsername.data) return byUsername

  // Helpful fallback: allow email login even if user typed an email-like value without @ or username column is not applied yet.
  if (byUsername.error) {
    const msg = String(byUsername.error?.message || '').toLowerCase()
    if (!(msg.includes('username') || msg.includes('schema cache') || msg.includes('does not exist'))) return byUsername
  }

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
    const appUser = normalizeAppUser(data)
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

    const appUser = normalizeAppUser(data)
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
