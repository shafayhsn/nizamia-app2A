import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Purchasing from './pages/Purchasing'
import Buyers from './pages/Buyers'
import Suppliers from './pages/Suppliers'
import Library from './pages/Library'
import Settings from './pages/Settings'
import SamplingApprovals from './pages/SamplingApprovals'
import Parcels from './pages/Parcels'
import Shipping from './pages/Shipping'

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

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="orders/*" element={<Orders />} />
          <Route path="purchasing/*" element={<Purchasing />} />
          <Route path="buyers" element={<Buyers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="sampling" element={<SamplingApprovals />} />
          <Route path="parcels" element={<Parcels />} />
          <Route path="shipping" element={<Shipping />} />
          <Route path="library" element={<Library />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
