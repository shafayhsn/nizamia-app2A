import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Package, Users, Truck,
  BookOpen, ChevronLeft, ChevronRight, Wrench
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

const SB = '#ffffff'
const SB_HOVER = '#f9fafb'
const SB_ACTIVE = '#1a1a2e'
const SB_TEXT = '#6b7280'
const SB_TEXT_ACTIVE = '#ffffff'
const SB_BORDER = '#ebebeb'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)

  return (
    <>
      <aside style={{
        width: collapsed ? 56 : 220,
        minWidth: collapsed ? 56 : 220,
        height: '100vh',
        background: SB,
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s, min-width 0.2s',
        overflow: 'hidden', flexShrink: 0,
      }}>

        {/* Logo */}
        <div style={{
          height: 48, display: 'flex', alignItems: 'center',
          padding: '0 14px',
          borderBottom: `1px solid ${SB_BORDER}`,
          flexShrink: 0,
          justifyContent: collapsed ? 'center' : 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <div style={{
              width: 28, height: 28,
              background: '#1a1a2e',
              borderRadius: 7,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>N</span>
            </div>
            {!collapsed && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', whiteSpace: 'nowrap', lineHeight: 1.2 }}>Nizamia</div>
                <div style={{ fontSize: 9, color: SB_TEXT, letterSpacing: '1px', textTransform: 'uppercase' }}>OMS</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: SB_TEXT, padding: 2, display: 'flex', flexShrink: 0,
              borderRadius: 4,
            }}>
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center',
              gap: 10,
              padding: collapsed ? '9px 0' : '8px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              textDecoration: 'none',
              margin: '1px 0',
              borderRadius: 7,
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? SB_TEXT_ACTIVE : SB_TEXT,
              background: isActive ? SB_ACTIVE : 'transparent',
              transition: 'background 0.1s, color 0.1s',
            })}
              onMouseEnter={e => { if (!e.currentTarget.style.background.includes('0.15')) e.currentTarget.style.background = SB_HOVER }}
              onMouseLeave={e => { if (!e.currentTarget.style.background.includes('0.15')) e.currentTarget.style.background = 'transparent' }}
              title={collapsed ? label : undefined}
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
                  {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '8px', borderTop: `1px solid ${SB_BORDER}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button onClick={() => setToolsOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? '9px 0' : '8px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: 'none', border: 'none', cursor: 'pointer',
            width: '100%', borderRadius: 7, color: SB_TEXT,
            fontSize: 13, fontWeight: 400,
          }}
            onMouseEnter={e => e.currentTarget.style.background = SB_HOVER}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title={collapsed ? 'Production Tools' : undefined}
          >
            <Wrench size={16} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Production Tools</span>}
          </button>

          {collapsed && (
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
          )}
        </div>
      </aside>

      <ToolsTray open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </>
  )
}
