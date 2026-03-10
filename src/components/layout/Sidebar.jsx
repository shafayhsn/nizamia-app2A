import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Package, Users, Truck,
  BookOpen, ChevronLeft, ChevronRight, Wrench, Settings
} from 'lucide-react'
import ToolsTray from '../tools/ToolsTray'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/orders', icon: ShoppingBag, label: 'Orders' },
  { to: '/purchasing', icon: Package, label: 'Purchasing' },
  { to: '/buyers', icon: Users, label: 'Buyers' },
  { to: '/suppliers', icon: Truck, label: 'Suppliers' },
  { to: '/library', icon: BookOpen, label: 'Library' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const loc = useLocation()

  return (
    <>
      <aside style={{
        width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
        minWidth: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
        height: '100vh', background: '#fff',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s, min-width 0.2s',
        overflow: 'hidden', position: 'relative', zIndex: 10,
        flexShrink: 0,
      }}>

        {/* Logo */}
        <div style={{
          height: 'var(--topbar-h)', display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 16px' : '0 16px',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
        }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
              <div style={{
                width: 26, height: 26, background: '#0d0d0d', borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>N</span>
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.2 }}>Nizamia</div>
                <div style={{ fontSize: 9, color: 'var(--text-light)', letterSpacing: '1px', textTransform: 'uppercase' }}>OMS</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div style={{
              width: 26, height: 26, background: '#0d0d0d', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>N</span>
            </div>
          )}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-light)', padding: 2, display: 'flex', flexShrink: 0,
            }}>
              <ChevronLeft size={15} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0', overflow: 'hidden' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center',
              gap: 10, padding: collapsed ? '9px 0' : '9px 14px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              textDecoration: 'none', margin: '1px 6px', borderRadius: 6,
              fontSize: 13, fontWeight: isActive ? 600 : 400,
              color: isActive ? '#fff' : 'var(--text-mid)',
              background: isActive ? '#0d0d0d' : 'transparent',
              transition: 'background 0.1s, color 0.1s',
            })}
              title={collapsed ? label : undefined}
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                  {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '8px 6px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button onClick={() => setToolsOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? '9px 0' : '9px 14px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'none', border: 'none', cursor: 'pointer',
            width: '100%', borderRadius: 6, color: 'var(--text-mid)',
            fontSize: 13, fontWeight: 400,
          }} title={collapsed ? 'Production Tools' : undefined}>
            <Wrench size={16} strokeWidth={1.8} />
            {!collapsed && <span>Production Tools</span>}
          </button>

          {collapsed && (
            <button onClick={() => setCollapsed(false)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '9px 0', background: 'none', border: 'none',
              cursor: 'pointer', width: '100%', borderRadius: 6, color: 'var(--text-light)',
            }}>
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </aside>

      <ToolsTray open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </>
  )
}
