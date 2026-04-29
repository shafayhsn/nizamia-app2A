// src/lib/authContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

function normalizeAppUser(userData) {
  if (!userData) return null
  return { id: userData.id, email: userData.email, username: userData.username || userData.email?.split('@')[0], role: userData.role, is_active: userData.is_active !== false }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadAppUser = useCallback(async (authUser) => {
    if (!authUser?.id) { setUser(null); setUserRole(null); return null }

    const selectUser = async (field, value) => {
      let res = await supabase.from('users').select('id, email, username, role, is_active').eq(field, value).maybeSingle()
      if (res.error?.message?.toLowerCase?.().includes('username')) {
        res = await supabase.from('users').select('id, email, role, is_active').eq(field, value).maybeSingle()
      }
      return res
    }

    let { data: userData, error } = await selectUser('id', authUser.id)
    if ((!userData || error) && authUser.email) {
      const byEmail = await selectUser('email', authUser.email)
      userData = byEmail.data; error = byEmail.error
    }
    if (error || !userData) { console.warn('No Nizamia OMS users row found:', authUser.id, authUser.email, error?.message); setUser(null); setUserRole(null); return null }
    if (userData.is_active === false) { alert('This user is inactive. Contact Admin.'); await supabase.auth.signOut(); setUser(null); setUserRole(null); return null }
    const appUser = normalizeAppUser(userData)
    setUser(appUser); setUserRole(appUser); return appUser
  }, [])

  useEffect(() => {
    const initAuth = async () => { try { const { data: { session } } = await supabase.auth.getSession(); await loadAppUser(session?.user) } catch (err) { console.error('Auth init error:', err) } finally { setLoading(false) } }
    initAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => { setLoading(true); try { await loadAppUser(session?.user) } finally { setLoading(false) } })
    return () => subscription?.unsubscribe()
  }, [loadAppUser])

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('Invalid email/username or password.')
    const { data: { session } } = await supabase.auth.getSession()
    const appUser = await loadAppUser(session?.user)
    if (!appUser) throw new Error('No active Nizamia OMS user profile found for this login.')
    return appUser
  }

  const logout = async () => { await supabase.auth.signOut(); setUser(null); setUserRole(null) }
  const refreshUser = async () => { const { data: { session } } = await supabase.auth.getSession(); return loadAppUser(session?.user) }

  return <AuthContext.Provider value={{ user, userRole, loading, login, logout, refreshUser }}>{children}</AuthContext.Provider>
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context }
