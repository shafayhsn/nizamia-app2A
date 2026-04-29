// src/lib/authContext.jsx
// Auth Context — startup-safe login gate for Nizamia OMS

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)
const AUTH_TIMEOUT_MS = 5000

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

async function findUserProfileBy(field, value) {
  const richColumns = 'id, email, username, name, display_name, role, is_active'
  const fallbackColumns = 'id, email, role, is_active'
  const rich = await withTimeout(
    supabase.from('users').select(richColumns).eq(field, value).maybeSingle()
  ).catch(err => ({ data: null, error: err }))

  if (!rich.error) return rich

  const msg = String(rich.error?.message || '')
  if (msg.includes('column') || msg.includes('schema cache')) {
    return await withTimeout(
      supabase.from('users').select(fallbackColumns).eq(field, value).maybeSingle()
    )
  }

  return rich
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadAppUser = useCallback(async (authUser) => {
    if (!authUser?.id && !authUser?.email) {
      setUser(null)
      setUserRole(null)
      return null
    }

    try {
      let userData = null
      let error = null

      if (authUser?.id) {
        const res = await findUserProfileBy('id', authUser.id)
        userData = res.data
        error = res.error
      }

      if ((!userData || error) && authUser.email) {
        const byEmail = await findUserProfileBy('email', authUser.email)
        userData = byEmail.data
        error = byEmail.error
      }

      if (error || !userData) {
        console.warn('No Nizamia OMS users row found for auth user:', authUser.id, authUser.email, error?.message)
        setUser(null)
        setUserRole(null)
        return null
      }

      if (userData.is_active === false) {
        await withTimeout(supabase.auth.signOut(), 3000).catch(() => null)
        setUser(null)
        setUserRole(null)
        return null
      }

      const appUser = normalizeAppUser(userData)
      setUser(appUser)
      setUserRole(appUser)
      return appUser
    } catch (err) {
      console.error('User profile load error:', err)
      setUser(null)
      setUserRole(null)
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const initAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession())
        if (!cancelled) await loadAppUser(session?.user)
      } catch (err) {
        console.error('Auth init error:', err)
        if (!cancelled) {
          setUser(null)
          setUserRole(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    initAuth()

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(true)
      setTimeout(async () => {
        try {
          await loadAppUser(session?.user)
        } finally {
          setLoading(false)
        }
      }, 0)
    })

    return () => {
      cancelled = true
      data?.subscription?.unsubscribe?.()
    }
  }, [loadAppUser])

  const login = async (identifier, password) => {
    const cleanIdentifier = String(identifier || '').trim()
    const isEmail = cleanIdentifier.includes('@')
    let loginEmail = cleanIdentifier.toLowerCase()

    if (!isEmail) {
      const profile = await findUserProfileBy('username', cleanIdentifier)
      if (profile.error || !profile.data?.email) {
        return { user: null, error: new Error('No active user found for this username.') }
      }
      loginEmail = String(profile.data.email).trim().toLowerCase()
    }

    const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email: loginEmail, password }))
    if (error) return { user: null, error }

    const appUser = await loadAppUser(data?.user)
    if (!appUser) {
      await withTimeout(supabase.auth.signOut(), 3000).catch(() => null)
      return { user: null, error: new Error('No active Nizamia OMS user profile found for this login.') }
    }

    return { user: appUser, error: null }
  }

  const logout = async () => {
    await withTimeout(supabase.auth.signOut(), 3000).catch(() => null)
    setUser(null)
    setUserRole(null)
  }

  const refreshUser = async () => {
    const { data: { session } } = await withTimeout(supabase.auth.getSession())
    return loadAppUser(session?.user)
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
