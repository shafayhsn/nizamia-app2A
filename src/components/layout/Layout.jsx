import React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/orders': 'Orders',
  '/purchasing': 'Purchasing',
  '/buyers': 'Buyers',
  '/suppliers': 'Suppliers',
  '/library': 'Library',
  '/shipping': 'Booking & Shipping',
}

export default function Layout() {
  const loc = useLocation()
  const base = '/' + loc.pathname.split('/')[1]
  const title = TITLES[base] || 'Nizamia OMS'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar />
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
