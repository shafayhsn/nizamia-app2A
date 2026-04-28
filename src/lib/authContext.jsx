// src/lib/authContext.jsx
// F3: Auth Context — Manages current user state and permissions

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

    const { data: userData, error } = await supabase
      .from('users')
      .select('id, email, role, is_active')
      .eq('id', authUser.id)
      .single()

    if (error || !userData) {
      console.warn('No App-2A users row found for auth user:', authUser.id, error?.message)
      setUser(null)
      setUserRole(null)
      return null
    }

    if (userData.is_active === false) {
      alert('This user is inactive. Contact Admin.')
      await supabase.auth.signOut()
      setUser(null)
      setUserRole(null)
      return null
    }

    const appUser = normalizeAppUser(userData)
    setUser(appUser)
    setUserRole(appUser) // keep full row, not just the role string
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
    <AuthContext.Provider value={{ user, userRole, loading, logout, refreshUser }}>
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
