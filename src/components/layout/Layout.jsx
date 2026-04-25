import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, ShoppingBag, ShoppingCart, Users, Truck, ClipboardCheck, Send, CalendarDays, BookOpen, Settings, Wrench, Bell, Cloud, ChevronLeft, Printer, FileText, UserCircle } from 'lucide-react'
import logoFull from '../../assets/nizamia-logo-full.png'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/purchasing', label: 'Purchasing', icon: ShoppingCart },
  { to: '/buyers', label: 'Buyers', icon: Users },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/sampling', label: 'Sampling & Approvals', icon: ClipboardCheck },
  { to: '/parcels', label: 'Parcels', icon: Send },
  { to: '/shipping', label: 'Booking & Shipping', icon: CalendarDays },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function ClockStrip() {
  const [now, setNow] = React.useState(new Date())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  const fmt = (tz) => now.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
  return (
    <div className="topbar-left">
      <span><b>Karachi</b> {fmt('Asia/Karachi')}</span>
      <span><b>London</b> {fmt('Europe/London')}</span>
      <span><b>New York</b> {fmt('America/New_York')}</span>
      <span><b>Dubai</b> {fmt('Asia/Dubai')}</span>
    </div>
  )
}

export default function Layout() {
  const day = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <img src={logoFull} alt="Nizamia" className="brand-logo" />
          <button className="collapse-btn" title="Collapse"><ChevronLeft size={18} /></button>
        </div>
        <nav className="side-nav">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-bottom">
          <NavLink to="/settings" className="side-link"><Wrench size={20} /><span>Production Tools</span></NavLink>
          <div className="quick-icons"><Printer size={18} /><FileText size={18} /><Wrench size={18} /><UserCircle size={18} /></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <ClockStrip />
          <div className="topbar-right">
            <span className="rate">$ 278.50 ↑</span><span className="rate">€302.10 ↑</span><span className="rate">£355.00 ↑</span>
            <span className="week-pill">W17</span><span>{day}</span><b>02:00 PM</b><span className="online"><Cloud size={16} /> Online</span><Bell size={18} />
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  )
}
