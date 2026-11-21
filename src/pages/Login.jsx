import React, { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { version as webVersion } from '../../package.json'

import LoginForm from './DesktopLogin'

const REMEMBER_LOGIN_KEY = 'nizamia_app2a_login_identifier'
const REMEMBER_FLAG_KEY = 'nizamia_app2a_remember_login'

export default function Login() {
  const navigate = useNavigate()
  const destination = useLocation().state?.openBulkBOM ? '/library?tab=trim-packages' : '/dashboard'
  const { user, loading, login } = useAuth()
  const remembered = useMemo(() => localStorage.getItem(REMEMBER_FLAG_KEY) === 'yes', [])
  const [identifier, setIdentifier] = useState(() => remembered ? (localStorage.getItem(REMEMBER_LOGIN_KEY) || '') : '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(remembered)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) navigate(destination, { replace: true })
  }, [user, navigate, destination])

  if (!loading && user) return <Navigate to={destination} replace />

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
      navigate(destination, { replace: true })
    } catch (err) {
      setError('Invalid username/email or password.')
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
      version={webVersion}
    />
  )
}
