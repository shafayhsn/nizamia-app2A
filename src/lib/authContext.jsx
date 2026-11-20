import { staffWorkflow } from './staffRoles'
// src/lib/authContext.jsx
// App-table login gate for Nizamia OMS + DB role permissions

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { resetEditSession } from './syncTracker'
import { supabase } from './supabase'
import { accountRequest } from './accounts'
import { MODULES } from './permissions'

const AuthContext = createContext(null)
const IS_DESKTOP = typeof location !== 'undefined' && location.protocol === 'app2a:'
const desktopRequest=async(action,fields={})=>{const response=await fetch('/api/offline/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...fields})});const result=await response.json();if(!response.ok)throw Error(result.error||'Local authentication failed');return result.data}
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
  const role = userData?.role || null
  if (role === 'admin') return fullPermissionMap()
  const roleId = userData?.role_id
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
  const roleName = userData.role || 'merchandiser'
  const username = userData.username || userData.name || userData.display_name || ''
  const permissions = staffWorkflow(roleName) ? emptyPermissionMap() : await loadRolePermissions({ ...userData, role: roleName })
  return {
    id: userData.id,
    email: userData.email,
    username,
    displayName: username || userData.email,
    role: roleName,
    role_id: userData.role_id || null,
    is_active: userData.is_active !== false,
    is_restricted: userData.is_restricted === true,
    restricted_reason: userData.restricted_reason || '',
    permissions,
  }
}

function safeSaveSession(appUser) {
  if (!appUser) localStorage.removeItem(APP_USER_KEY)
  else localStorage.setItem(APP_USER_KEY, JSON.stringify(appUser))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offlineSetupRequired,setOfflineSetupRequired]=useState(false)

  const setAppUser = useCallback((appUser) => {
    setUser(appUser)
    setUserRole(appUser)
    safeSaveSession(appUser)
  }, [])

  const refreshUser = useCallback(async () => {
    if(IS_DESKTOP){const result=await desktopRequest('status');setOfflineSetupRequired(result.setupRequired);setUser(result.user);setUserRole(result.user);return result.user}
    const profile = await accountRequest('accountProfile').catch(()=>null)
    const appUser = await normalizeAppUser(profile?.user)
    setAppUser(appUser)
    return appUser
  }, [setAppUser])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        if(!cancelled)await refreshUser()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [refreshUser])

  const login = async (identifier, password) => {
    resetEditSession()
    if(IS_DESKTOP){try{const result=await desktopRequest('login',{username:identifier,password});setUser(result.user);setUserRole(result.user);setOfflineSetupRequired(false);return {user:result.user,error:null}}catch(error){return {user:null,error}}}
    const cleanIdentifier = String(identifier || '').trim()
    const cleanPassword = String(password || '')
    if (!cleanIdentifier || !cleanPassword) return { user: null, error: new Error('Username/email and password are required.') }

    try {
      await accountRequest('login',{identifier:cleanIdentifier,password:cleanPassword})
      const {user: verifiedUser}=await accountRequest('accountProfile').catch(()=>{
        throw Error('Password accepted, but the sign-in session could not be loaded. Open the test link in a separate browser tab and try again.')
      })
      const appUser=await normalizeAppUser(verifiedUser)
      if(!appUser)throw Error('Password accepted, but the account profile could not be loaded.')
      setAppUser(appUser)
      return {user:appUser,error:null}
    }catch(error){return {user:null,error}}
  }

  const logout = async () => {
    resetEditSession()
    if(IS_DESKTOP){await desktopRequest('logout');setUser(null);setUserRole(null);return}
    await fetch('/api/oms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})}).catch(()=>{})
    setAppUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, userRole, loading, login, logout, refreshUser, offlineSetupRequired }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
