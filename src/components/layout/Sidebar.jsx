import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/authContext'
import { can } from '../../lib/permissions'
import {
  ShoppingBag, ShoppingCart, Users, Truck,
  BookOpen, ChevronLeft, ChevronRight, Wrench, Settings,
  UserCircle, ClipboardCheck, Send, CalendarCheck, CalendarDays, LogOut,
} from 'lucide-react'
import ToolsTray from '../tools/ToolsTray'
import nizamiaLogoFull from '../../assets/nizamia-logo-full.png'
import nizamiaLogoMark from '../../assets/nizamia-logo-mark.png'

const NAV_GROUPS = [
  {
    heading: 'Supply Chain',
    items: [
      { to: '/orders', icon: ShoppingBag, label: 'Orders', module: 'orders' },
      { to: '/purchasing', icon: ShoppingCart, label: 'Purchasing', module: 'purchasing' },
      { to: '/sampling', icon: ClipboardCheck, label: 'Sampling & Approvals', module: 'sampling' },
      { to: '/parcels', icon: Send, label: 'Parcels', module: 'parcels' },
      { to: '/shipping', icon: CalendarCheck, label: 'Booking & Shipping', module: 'shipping' },
    ],
  },
  {
    heading: 'Database',
    items: [
      { to: '/buyers', icon: Users, label: 'Buyers', module: 'buyers' },
      { to: '/suppliers', icon: Truck, label: 'Suppliers', module: 'suppliers' },
      { to: '/library', icon: BookOpen, label: 'Library', module: 'library' },
    ],
  },
]

const SB_HOVER  = '#f3f4f6'
const SB_ACTIVE = '#1a1a2e'
const SB_TEXT   = '#2E2E2E'
const SB_BORDER = '#ebebeb'

export default function Sidebar({ onOpenDeadlines }) {
  const [collapsed, setCollapsed] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const navigate = useNavigate()
  const { user, userRole, logout } = useAuth()
  const currentName = user?.username || user?.displayName || user?.email || 'User'

  const disabledItem = (Icon, label, key) => (
    <div key={key || label} title="No permission" style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '9px 0' : '8px 12px',
      justifyContent: collapsed ? 'center' : 'flex-start', margin: '1px 0', borderRadius: 7,
      fontSize: 13, fontWeight: 400, color: '#c4c7cf', background: 'transparent', cursor: 'not-allowed', opacity: 0.82,
    }}>
      <Icon size={16} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
    </div>
  )

  const navBtn = (icon, label, onClick) => (
    <button onClick={onClick} title={collapsed ? label : undefined} style={{
      display: 'flex', alignItems: 'center',
      gap: 10, padding: collapsed ? '9px 0' : '8px 12px',
      justifyContent: collapsed ? 'center' : 'flex-start',
      background: 'none', border: 'none', cursor: 'pointer',
      width: '100%', borderRadius: 7, color: SB_TEXT,
      fontSize: 13, fontWeight: 400, fontFamily: 'var(--font)',
    }}
      onMouseEnter={e => e.currentTarget.style.background = SB_HOVER}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {React.createElement(icon, { size: 16, strokeWidth: 1.8, style: { flexShrink: 0 } })}
      {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
    </button>
  )

  return (
    <>
      <aside style={{
        width: collapsed ? 56 : 200,
        minWidth: collapsed ? 56 : 200,
        height: '100vh', background: '#fff',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s, min-width 0.2s',
        overflow: 'hidden', flexShrink: 0,
        borderRight: `1px solid ${SB_BORDER}`,
      }}>

        {/* Logo */}
        <div style={{
          height: collapsed ? 54 : 62, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 10px' : '0 14px', borderBottom: `1px solid ${SB_BORDER}`,
          flexShrink: 0, justifyContent: 'center', position: 'relative',
        }}>
          <div onClick={() => navigate('/dashboard')} title="Dashboard" style={collapsed ? {
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            width: '100%', minWidth: 0, overflow: 'hidden',
          } : {
            position: 'absolute', left: 0, right: 38, top: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            minWidth: 0, overflow: 'hidden',
          }}>
            <img
              src={collapsed ? nizamiaLogoMark : nizamiaLogoFull}
              alt="Nizamia"
              style={collapsed ? {
                width: 32, height: 32, objectFit: 'contain', display: 'block',
              } : {
                width: 122, height: 'auto', maxHeight: 32, objectFit: 'contain', objectPosition: 'center', display: 'block',
              }}
            />
          </div>
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: SB_TEXT, padding: 3, display: 'flex', borderRadius: 4,
            }}>
              <ChevronLeft size={15} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px 6px', overflow: 'hidden' }}>
          {NAV_GROUPS.map(group => (
            <div key={group.heading} style={{ marginBottom: collapsed ? 3 : 10 }}>
              {!collapsed && (
                <div style={{
                  fontSize: 10, fontWeight: 800, color: '#9ca3af',
                  textTransform: 'uppercase', letterSpacing: 0.45,
                  padding: '8px 12px 4px',
                }}>
                  {group.heading}
                </div>
              )}

              {group.items.map(({ to, action, icon: Icon, label, module }) => {
                const allowed = !module || can(userRole, module, 'view')

                if (action === 'tools') {
                  return allowed ? navBtn(Icon, label, () => setToolsOpen(true)) : disabledItem(Icon, label)
                }

                return allowed ? (
                  <NavLink key={to} to={to} title={collapsed ? label : undefined} style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center',
                    gap: 10, padding: collapsed ? '9px 0' : '8px 12px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    textDecoration: 'none', margin: '1px 0', borderRadius: 7,
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#fff' : SB_TEXT,
                    background: isActive ? SB_ACTIVE : 'transparent',
                    transition: 'background 0.1s, color 0.1s',
                  })}
                    onMouseEnter={e => { if (!e.currentTarget.getAttribute('aria-current')) e.currentTarget.style.background = SB_HOVER }}
                    onMouseLeave={e => { if (!e.currentTarget.getAttribute('aria-current')) e.currentTarget.style.background = 'transparent' }}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
                        {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
                      </>
                    )}
                  </NavLink>
                ) : disabledItem(Icon, label, to)
              })}
            </div>
          ))}
        </nav>

        {/* Bottom tools */}
        <div style={{ padding: '8px', borderTop: `1px solid ${SB_BORDER}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div title={currentName} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: collapsed ? '8px 0' : '8px 10px', justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: 8, background: '#f9fafb', border: '1px solid #f1f5f9', marginBottom: 6 }}>
            <UserCircle size={16} strokeWidth={1.8} style={{ flexShrink: 0, color: '#6b7280' }} />
            {!collapsed && <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.35 }}>Logged in</div>
              <div style={{ fontSize: 12, color: '#111827', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentName}</div>
            </div>}
            {!collapsed && (
              <button onClick={logout} title="Logout" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280',
                padding: 5, display: 'flex', borderRadius: 6, flexShrink: 0,
              }}
                onMouseEnter={e => e.currentTarget.style.background = SB_HOVER}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <LogOut size={15} strokeWidth={1.9} />
              </button>
            )}
          </div>

          {/* Bottom icon row */}
          {!collapsed && (
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '6px 4px 2px' }}>
              {[
                { icon: CalendarDays, label: 'Deadlines', action: onOpenDeadlines },
                { icon: Settings, label: 'Settings', action: () => navigate('/settings'), module: 'settings' },
                { icon: Wrench, label: 'Production Tools', action: () => setToolsOpen(true) },
              ].map(({ icon: Icon, label, action, module }) => {
                const allowed = !module || can(userRole, module, 'view')
                return (
                  <button key={label} title={allowed ? label : 'No permission'} onClick={allowed ? action : undefined} disabled={!allowed} style={{
                    background: 'none', border: 'none', cursor: allowed ? 'pointer' : 'not-allowed',
                    color: allowed ? '#9ca3af' : '#d1d5db', padding: 6, borderRadius: 6, display: 'flex', opacity: allowed ? 1 : .75,
                  }}
                    onMouseEnter={e => { if (allowed) { e.currentTarget.style.background = SB_HOVER; e.currentTarget.style.color = '#374151' } }}
                    onMouseLeave={e => { if (allowed) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' } }}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                  </button>
                )
              })}
            </div>
          )}

          {collapsed && (
            <>
              <div style={{ height: 1, background: SB_BORDER, margin: '2px 6px 6px' }} />
              {[
                { icon: CalendarDays, label: 'Deadlines', action: onOpenDeadlines },
                { icon: Settings, label: 'Settings', action: () => navigate('/settings'), module: 'settings' },
                { icon: Wrench, label: 'Production Tools', action: () => setToolsOpen(true) },
                { icon: LogOut, label: 'Logout', action: logout },
              ].map(({ icon: Icon, label, action, module }) => {
                const allowed = !module || can(userRole, module, 'view')
                return (
                  <button key={label} title={allowed ? label : 'No permission'} onClick={allowed ? action : undefined} disabled={!allowed} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '9px 0', background: 'none', border: 'none',
                    cursor: allowed ? 'pointer' : 'not-allowed', width: '100%', borderRadius: 7,
                    color: allowed ? SB_TEXT : '#d1d5db', opacity: allowed ? 1 : .75,
                  }}
                    onMouseEnter={e => { if (allowed) e.currentTarget.style.background = SB_HOVER }}
                    onMouseLeave={e => { if (allowed) e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                  </button>
                )
              })}
              <button onClick={() => setCollapsed(false)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '9px 0', background: 'none', border: 'none',
                cursor: 'pointer', width: '100%', borderRadius: 7, color: SB_TEXT,
              }}
                onMouseEnter={e => e.currentTarget.style.background = SB_HOVER}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <ChevronRight size={14} />
              </button>
            </>
          )}
        </div>
      </aside>

      <ToolsTray open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </>
  )
}
