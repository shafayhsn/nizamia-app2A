import React, { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { version as webVersion } from '../../package.json'

import { version as macVersion } from '../../desktop/package.json'
import LoginForm from './DesktopLogin'

const REMEMBER_LOGIN_KEY = 'nizamia_app2a_login_identifier'
const REMEMBER_FLAG_KEY = 'nizamia_app2a_remember_login'

export default function Login() {
  const navigate = useNavigate()
  const { user, loading, login, offlineSetupRequired } = useAuth()
  const remembered = useMemo(() => localStorage.getItem(REMEMBER_FLAG_KEY) === 'yes', [])
  const [identifier, setIdentifier] = useState(() => remembered ? (localStorage.getItem(REMEMBER_LOGIN_KEY) || '') : '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(remembered)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  if (!loading && user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    const cleanIdentifier = identifier.trim()
    if (!cleanIdentifier || !password) {
      setError('Please enter username/email and password.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await login(cleanIdentifier, password)
      if (result?.error) throw result.error

      if (remember) {
        localStorage.setItem(REMEMBER_FLAG_KEY, 'yes')
        localStorage.setItem(REMEMBER_LOGIN_KEY, cleanIdentifier)
      } else {
        localStorage.removeItem(REMEMBER_FLAG_KEY)
        localStorage.removeItem(REMEMBER_LOGIN_KEY)
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(location.protocol === 'app2a:' ? (err?.message || 'Local sign-in failed.') : 'Invalid username/email or password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <LoginForm
      identifier={identifier} setIdentifier={setIdentifier}
      password={password} setPassword={setPassword}
      remember={remember} setRemember={setRemember}
      showPassword={showPassword} setShowPassword={setShowPassword}
      busy={busy} error={error} setError={setError} handleSubmit={handleSubmit}
      offlineSetupRequired={offlineSetupRequired}
      version={location.protocol === 'app2a:' ? macVersion : webVersion}
    />
  )
}
