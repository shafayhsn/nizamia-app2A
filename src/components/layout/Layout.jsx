import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, ClipboardList, ShoppingCart, Users, Truck, Package, Settings, LogOut, BookOpen, Send, FlaskConical } from 'lucide-react'
import { useAuth } from '../../lib/authContext'
import logoMark from '../../assets/nizamia-logo-mark.png'
import Login from '../../pages/Login'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/purchasing', label: 'Purchasing', icon: ShoppingCart },
  { to: '/buyers', label: 'Buyers', icon: Users },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/sampling', label: 'Sampling', icon: FlaskConical },
  { to: '/parcels', label: 'Parcels', icon: Package },
  { to: '/shipping', label: 'Shipping', icon: Send },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Layout() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    return (
      <div className="startup-screen">
        <div className="startup-spinner" />
        <div>Opening Nizamia OMS...</div>
      </div>
    )
  }

  if (!user) return <Login />

  const username = user.username || user.email?.split('@')[0] || 'User'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <img src={logoMark} onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <div>
            <div className="brand-name">Nizamia OMS</div>
            <div className="brand-sub">Operations</div>
          </div>
        </div>
        <nav className="side-nav">
          {nav.map(item => {
            const Icon = item.icon
            return <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={16} /><span>{item.label}</span></NavLink>
          })}
        </nav>
        <div className="sidebar-user">
          <div className="user-avatar">{username.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="user-name">{username}</div>
            <div className="user-role">{user.role || 'custom role'}</div>
          </div>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <button className="btn btn-secondary btn-sm" onClick={logout}><LogOut size={14} /> Logout</button>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
