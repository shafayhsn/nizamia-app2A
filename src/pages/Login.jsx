import React, { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react'
import { useAuth } from '../lib/authContext'
import nizamiaLogoMark from '../assets/nizamia-logo-mark.png'

const REMEMBER_EMAIL_KEY = 'nizamia_app2a_login_email'
const REMEMBER_FLAG_KEY = 'nizamia_app2a_remember_login'

export default function Login() {
  const navigate = useNavigate()
  const { user, loading, login } = useAuth()
  const remembered = useMemo(() => localStorage.getItem(REMEMBER_FLAG_KEY) === 'yes', [])
  const [name, setName] = useState('')
  const [email, setEmail] = useState(() => remembered ? (localStorage.getItem(REMEMBER_EMAIL_KEY) || '') : '')
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
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !password) {
      setError('Please enter email and password.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await login(cleanEmail, password)
      if (result?.error) throw result.error

      if (remember) {
        localStorage.setItem(REMEMBER_FLAG_KEY, 'yes')
        localStorage.setItem(REMEMBER_EMAIL_KEY, cleanEmail)
      } else {
        localStorage.removeItem(REMEMBER_FLAG_KEY)
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError('Invalid email or password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'var(--font, Inter, system-ui, sans-serif)' }}>
      <div style={{ width: 'min(1120px, 100%)', minHeight: 650, background: '#fff', border: '1px solid #eef0f4', borderRadius: 26, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.10)', display: 'grid', gridTemplateColumns: '1.08fr 0.92fr', overflow: 'hidden' }}>
        <section style={{ margin: 10, borderRadius: 20, overflow: 'hidden', position: 'relative', background: 'radial-gradient(circle at 12% 14%, #11d1d9 0, transparent 28%), radial-gradient(circle at 38% 78%, #0fc0d1 0, transparent 30%), radial-gradient(circle at 82% 12%, #2b7cff 0, transparent 32%), linear-gradient(145deg, #0327b8 0%, #003cdd 46%, #001f99 100%)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.16), transparent 42%, rgba(0,0,0,0.10))' }} />
          <div style={{ position: 'relative', color: '#fff', padding: '48px 52px' }}>
            <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: -0.4, marginBottom: 14 }}>Nizamia</div>
            <div style={{ fontSize: 35, fontWeight: 600, lineHeight: 1.12, letterSpacing: -1.2, maxWidth: 440 }}>Speed up your work<br />with our Web App</div>
          </div>
        </section>

        <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '54px 64px' }}>
          <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360 }}>
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 22 }}>
              <img src={nizamiaLogoMark} alt="Nizamia" style={{ width: 54, height: 54, objectFit: 'contain' }} />
            </div>

            <h1 style={{ margin: 0, color: '#050505', fontSize: 35, lineHeight: 1.05, letterSpacing: -1.5, fontWeight: 800 }}>Get Started Now</h1>
            <p style={{ margin: '12px 0 24px', color: '#9ca3af', fontSize: 13 }}>Please log in to your account to continue.</p>

            <Field label="Name" icon={<UserRound size={15} />}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name..." autoComplete="name" style={inputStyle} />
            </Field>

            <Field label="Email address" icon={<Mail size={15} />}>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="workmail@gmail.com" autoComplete="email" type="email" style={inputStyle} />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <label style={labelStyle}>Password</label>
              <button type="button" onClick={() => setError('Please contact Admin to reset your password.')} style={{ border: 0, background: 'transparent', padding: 0, color: '#111827', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Forgot Password?</button>
            </div>
            <div style={passwordWrapStyle}>
              <Lock size={15} color="#9ca3af" />
              <input value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" autoComplete="current-password" type={showPassword ? 'text' : 'password'} style={{ ...inputStyle, border: 0, padding: '0 4px', height: 38, flex: 1 }} />
              <button type="button" onClick={() => setShowPassword(v => !v)} style={{ border: 0, background: 'transparent', display: 'flex', color: '#9ca3af', cursor: 'pointer', padding: 4 }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, color: '#374151', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1746e8' }} />
              Remember me on this computer
            </label>

            {error && <div style={{ marginTop: 14, padding: '10px 12px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{error}</div>}

            <button type="submit" disabled={busy} style={{ width: '100%', height: 42, border: 0, borderRadius: 10, background: busy ? '#93a8ff' : '#1746e8', color: '#fff', fontSize: 13, fontWeight: 800, marginTop: 22, cursor: busy ? 'default' : 'pointer', boxShadow: '0 9px 18px rgba(23,70,232,0.22)' }}>
              {busy ? 'Logging in...' : 'Log in'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16, color: '#6b7280', fontSize: 12 }}>Use the email and password created in Users Control.</div>
          </form>
        </section>
      </div>

      <style>{`@media (max-width: 860px) { form { max-width: 420px !important; } } @media (max-width: 860px) { div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; } section:first-child { display: none !important; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function Field({ label, icon, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative', marginTop: 7 }}>
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', display: 'flex' }}>{icon}</div>
        {React.cloneElement(children, { style: { ...children.props.style, paddingLeft: 36 } })}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', color: '#111827', fontSize: 12, fontWeight: 800 }
const inputStyle = { width: '100%', height: 38, border: '1px solid #e5e7eb', borderRadius: 10, outline: 'none', padding: '0 12px', fontSize: 12, color: '#111827', background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }
const passwordWrapStyle = { height: 38, border: '1px solid #e5e7eb', borderRadius: 10, display: 'flex', alignItems: 'center', padding: '0 8px 0 12px', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }
