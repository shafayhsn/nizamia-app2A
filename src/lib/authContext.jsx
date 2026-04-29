// src/lib/authContext.jsx
// F3: Auth Context — Manages current user state, login and permissions

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

function normalizeAppUser(userData) {
  if (!userData) return null
  return {
    id: userData.id,
    email: userData.email,
    role: userData.role,
    is_active: userData.is_active !== false,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadAppUser = useCallback(async (authUser) => {
    if (!authUser?.id) {
      setUser(null)
      setUserRole(null)
      return null
    }

    let { data: userData, error } = await supabase
      .from('users')
      .select('id, email, role, is_active')
      .eq('id', authUser.id)
      .maybeSingle()

    if ((!userData || error) && authUser.email) {
      const byEmail = await supabase
        .from('users')
        .select('id, email, role, is_active')
        .eq('email', authUser.email)
        .maybeSingle()
      userData = byEmail.data
      error = byEmail.error
    }

    if (error || !userData) {
      console.warn('No App-2A users row found for auth user:', authUser.id, authUser.email, error?.message)
      setUser(null)
      setUserRole(null)
      return null
    }

    if (userData.is_active === false) {
      await supabase.auth.signOut()
      setUser(null)
      setUserRole(null)
      return null
    }

    const appUser = normalizeAppUser(userData)
    setUser(appUser)
    setUserRole(appUser)
    return appUser
  }, [])

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await loadAppUser(session?.user)
      } catch (err) {
        console.error('Auth init error:', err)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoading(true)
      try {
        await loadAppUser(session?.user)
      } finally {
        setLoading(false)
      }
    })

    return () => subscription?.unsubscribe()
  }, [loadAppUser])

  const login = async (email, password) => {
    const cleanEmail = String(email || '').trim().toLowerCase()
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    if (error) return { user: null, error }

    const appUser = await loadAppUser(data?.user)
    if (!appUser) {
      await supabase.auth.signOut()
      return { user: null, error: new Error('No active App-2A user profile found for this login.') }
    }

    return { user: appUser, error: null }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserRole(null)
  }

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
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
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
