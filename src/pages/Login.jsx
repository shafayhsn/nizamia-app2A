import React, { useState } from 'react'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/authContext'

export default function Login() {
  const { login } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const resolveEmail = async (value) => {
    const input = value.trim()
    if (input.includes('@')) return input.toLowerCase()

    const username = input.toLowerCase()
    const { data, error } = await supabase
      .from('users')
      .select('email, username, is_active')
      .ilike('username', username)
      .maybeSingle()

    if (error) throw new Error('Username login needs the users.username column. Run the included migration first.')
    if (!data?.email) throw new Error('Invalid username or password.')
    if (data.is_active === false) throw new Error('This user is inactive. Contact Admin.')
    return data.email.toLowerCase()
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!identifier.trim() || !password) {
      setError('Email/username and password are required.')
      return
    }
    setLoading(true)
    try {
      const email = await resolveEmail(identifier)
      await login(email, password, remember)
    } catch (err) {
      setError(err.message || 'Invalid email/username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-shell">
        <div className="login-art">
          <div className="login-art-text">
            <div className="login-art-kicker">Nizamia</div>
            <div className="login-art-title">Speed up your work<br />with our Web App</div>
          </div>
        </div>
        <form className="login-panel" onSubmit={submit}>
          <div className="login-mark"><LockKeyhole size={38} strokeWidth={2.4} /></div>
          <h1>Get Started Now</h1>
          <p>Please log in to your account to continue.</p>

          <label>Email or Username</label>
          <input
            className="login-input"
            type="text"
            autoComplete="username"
            placeholder="Enter email or username..."
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoFocus
          />

          <div className="login-row-label">
            <label>Password</label>
          </div>
          <div className="login-password-wrap">
            <input
              className="login-input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} aria-label="Show password">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <label className="login-check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Remember me on this device</span>
          </label>

          {error && <div className="login-error">{error}</div>}
          <button className="login-button" type="submit" disabled={loading}>{loading ? 'Logging in...' : 'Log in'}</button>
        </form>
      </div>
    </div>
  )
}
