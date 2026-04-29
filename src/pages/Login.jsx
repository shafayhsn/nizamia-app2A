import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ onLoginSuccess }) {
  const [input, setInput] = useState('') // email or username
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // First, try to find user by email or username
      const { data: users, error: fetchError } = await supabase
        .from('users')
        .select('id, email, username, password_hash, role, is_active')
        .or(`email.eq.${input},username.eq.${input}`)
        .single()

      if (fetchError || !users) {
        setError('User not found')
        setLoading(false)
        return
      }

      if (!users.is_active) {
        setError('This account is inactive')
        setLoading(false)
        return
      }

      // Simple password check (in production, use bcrypt)
      // For now, we'll store plain text or hashed password
      const isValidPassword = users.password_hash === password
      if (!isValidPassword) {
        setError('Incorrect password')
        setLoading(false)
        return
      }

      // Store user session in localStorage
      localStorage.setItem('nzm_user_session', JSON.stringify({
        id: users.id,
        email: users.email,
        username: users.username || users.email,
        role: users.role,
        loggedInAt: new Date().toISOString()
      }))

      // Call success callback
      onLoginSuccess({
        id: users.id,
        email: users.email,
        username: users.username || users.email,
        role: users.role
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f7f7f5',
      fontFamily: 'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 8,
        padding: '48px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        width: '100%',
        maxWidth: 380
      }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 600,
          marginBottom: 8,
          color: '#1a1a2e',
          textAlign: 'center'
        }}>
          Nizamia OMS
        </h1>
        <p style={{
          fontSize: 13,
          color: '#6b7280',
          textAlign: 'center',
          marginBottom: 32
        }}>
          Order Management System
        </p>

        <form onSubmit={handleLogin}>
          {error && (
            <div style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              padding: '12px 14px',
              marginBottom: 20,
              fontSize: 13,
              color: '#991b1b'
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#6b7280',
              marginBottom: 6,
              letterSpacing: 0.5
            }}>
              Email or Username
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter your email or username"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                backgroundColor: loading ? '#f3f4f6' : 'white'
              }}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#6b7280',
              marginBottom: 6,
              letterSpacing: 0.5
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 13,
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                backgroundColor: loading ? '#f3f4f6' : 'white'
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !input || !password}
            style={{
              width: '100%',
              padding: '10px 14px',
              backgroundColor: loading || !input || !password ? '#d1d5db' : '#2383e2',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading || !input || !password ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!loading && input && password) e.target.style.backgroundColor = '#1e6bb8'
            }}
            onMouseLeave={(e) => {
              if (!loading && input && password) e.target.style.backgroundColor = '#2383e2'
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p style={{
          fontSize: 11,
          color: '#9ca3af',
          textAlign: 'center',
          marginTop: 20
        }}>
          Contact admin for login credentials
        </p>
      </div>
    </div>
  )
}
