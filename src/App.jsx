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

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 12 }}>Runtime Error</div>
          <pre style={{ background: '#fef2f2', padding: 16, borderRadius: 8, color: '#991b1b', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
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
          <Route path="library" element={<Library />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
