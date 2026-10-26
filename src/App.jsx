import React, { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/authContext'
import { can } from './lib/permissions'
import Layout from './components/layout/Layout'
import WindowManager from './components/ui/WindowManager'
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Orders = lazy(() => import('./pages/Orders'))
const Purchasing = lazy(() => import('./pages/Purchasing'))
const Buyers = lazy(() => import('./pages/Buyers'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const Library = lazy(() => import('./pages/Library'))
const Settings = lazy(() => import('./pages/Settings'))
const UsersAndRights = lazy(() => import('./pages/UsersAndRights'))
const SamplingApprovals = lazy(() => import('./pages/SamplingApprovals'))
const Parcels = lazy(() => import('./pages/Parcels'))
const Shipping = lazy(() => import('./pages/Shipping'))
const Reports = lazy(() => import('./pages/Reports'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Production = lazy(() => import('./pages/Production'))
import { loadSetting } from './lib/settingsStore'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      const isCreds = this.state.error?.message?.includes('VITE_SUPABASE')
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', maxWidth: 600 }}>
          <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 18, marginBottom: 12 }}>
            {isCreds ? 'Configuration Required' : 'Runtime Error'}
          </div>
          <pre style={{ background: '#fef2f2', padding: 16, borderRadius: 8, color: '#991b1b', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
            {this.state.error?.message}
          </pre>
          {!isCreds && (
            <pre style={{ background: '#f1f5f9', padding: 16, borderRadius: 8, color: '#475569', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, marginTop: 8 }}>
              {this.state.error?.stack}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

function FullScreenLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff', fontFamily: 'var(--font, system-ui, sans-serif)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 34, height: 34, border: '3px solid #e5e7eb', borderTopColor: '#1746e8', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Opening Nizamia OMS...</div>
      </div>
    </div>
  )
}

function PageLoader() {
  return <div role="status" aria-live="polite" style={{ padding: 24, fontSize: 12, color: '#64748b' }}>Loading page…</div>
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireRight({ module, action = 'view', children }) {
  const { userRole, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!module || can(userRole, module, action)) return children
  return (
    <div style={{ padding: 28, fontFamily: 'var(--font, system-ui, sans-serif)' }}>
      <div style={{ maxWidth: 520, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 22, boxShadow: '0 10px 30px rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Access restricted</div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>Your user rights do not allow this module. Contact Admin if you need access.</div>
      </div>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    loadSetting('ui_group_row', { background:'#fdf6e3', text:'#111827' }).then(v => {
      document.documentElement.style.setProperty('--app-group-row-bg', v?.background || '#fdf6e3')
      document.documentElement.style.setProperty('--app-group-row-text', v?.text || '#111827')
    }).catch(() => {})
  }, [])
  return (
    <AuthProvider>
      <WindowManager>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}><Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="orders/*" element={<RequireRight module="orders"><Orders /></RequireRight>} />
            <Route path="purchasing/*" element={<RequireRight module="purchasing"><Purchasing /></RequireRight>} />
            <Route path="buyers" element={<RequireRight module="buyers">{null}</RequireRight>} />
            <Route path="suppliers" element={<RequireRight module="suppliers">{null}</RequireRight>} />
            <Route path="sampling" element={<RequireRight module="sampling"><SamplingApprovals /></RequireRight>} />
            <Route path="parcels" element={<RequireRight module="parcels"><Parcels /></RequireRight>} />
            <Route path="production" element={<RequireRight module="orders"><Production /></RequireRight>} />
            <Route path="tasks" element={<RequireRight module="tasks"><Tasks /></RequireRight>} />
            <Route path="reports" element={<RequireRight module="reports"><Reports /></RequireRight>} />
            <Route path="shipping" element={<RequireRight module="shipping"><Shipping /></RequireRight>} />
            <Route path="library" element={<RequireRight module="library">{null}</RequireRight>} />
            <Route path="settings" element={<RequireRight module="settings"><Settings /></RequireRight>} />
            <Route path="settings/users" element={<RequireRight module="settings"><UsersAndRights /></RequireRight>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes></Suspense>
      </ErrorBoundary>
      </WindowManager>
    </AuthProvider>
  )
}
