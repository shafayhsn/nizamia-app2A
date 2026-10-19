import React, { useEffect, useState, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/authContext'
import { can, normalizeModule } from '../../lib/permissions'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import DeadlinesTracker from '../ui/DeadlinesTracker'
import OrderWizard from '../wizard/OrderWizard'
import { ChevronUp, X } from 'lucide-react'
import WindowManager from '../ui/WindowManager'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/orders': 'Orders',
  '/purchasing': 'Purchasing',
  '/buyers': 'Buyers',
  '/suppliers': 'Suppliers',
  '/library': 'Library',
  '/shipping': 'Booking & Shipping',
  '/reports': 'Reports',
  '/tasks': 'Tasks',
}


function useVerticalViewportFit() {
  useEffect(() => {
    const apply = () => {
      const h = window.innerHeight || document.documentElement.clientHeight || 900
      const mode = h < 680 ? 'tight' : h < 780 ? 'short' : 'normal'
      document.body.setAttribute('data-vfit', mode)
      document.documentElement.style.setProperty('--app-real-vh', `${h}px`)
    }
    apply()
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    return () => {
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [])
}

function moduleFromPath(pathname) {
  const first = String(pathname || '').split('/').filter(Boolean)[0] || 'dashboard'
  return normalizeModule(first)
}

function actionFromButton(btn) {
  const raw = `${btn.getAttribute('data-permission-action') || ''} ${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''} ${btn.textContent || ''}`.toLowerCase().trim()
  if (!raw) return null
  if (/\b(cancel|close|ok|today|refresh|reload|search|filter|view|hide|show|print|export|download|preview|program|invoice|convert|find|logout)\b/.test(raw)) return null
  if (/\b(delete|remove|deactivate|trash)\b/.test(raw)) return 'delete'
  if (/\b(edit|save|update|apply|activate|reset|assign|dispatch|send|approve|unlock|proceed|toggle|change)\b/.test(raw)) return 'edit'
  if (/\b(new|add|create|duplicate|copy|upload|import)\b/.test(raw)) return 'create'
  return null
}

function useModuleActionLock(pathname) {
  const { userRole } = useAuth()
  useEffect(() => {
    const module = moduleFromPath(pathname)
    const root = document.querySelector('main')
    if (!root || !userRole) return

    let raf = 0
    const apply = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        root.querySelectorAll('button').forEach(btn => {
          const action = actionFromButton(btn)
          const blocked = action && !can(userRole, module, action)
          if (blocked) {
            if (btn.dataset.permissionBlocked !== 'true') {
              btn.dataset.originalTitle = btn.getAttribute('title') || ''
              btn.dataset.originalOpacity = btn.style.opacity || ''
              btn.dataset.originalCursor = btn.style.cursor || ''
            }
            btn.dataset.permissionBlocked = 'true'
            btn.disabled = true
            btn.setAttribute('title', 'No permission')
            btn.style.opacity = '0.45'
            btn.style.cursor = 'not-allowed'
          } else if (btn.dataset.permissionBlocked === 'true') {
            btn.dataset.permissionBlocked = ''
            btn.disabled = false
            const originalTitle = btn.dataset.originalTitle || ''
            if (originalTitle) btn.setAttribute('title', originalTitle)
            else btn.removeAttribute('title')
            btn.style.opacity = btn.dataset.originalOpacity || ''
            btn.style.cursor = btn.dataset.originalCursor || ''
          }
        })
      })
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    const block = (e) => {
      const btn = e.target?.closest?.('button[data-permission-blocked="true"]')
      if (btn) { e.preventDefault(); e.stopPropagation() }
    }
    root.addEventListener('click', block, true)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      root.removeEventListener('click', block, true)
    }
  }, [pathname, userRole])
}

export default function Layout() {
  const [deadlinesOpen, setDeadlinesOpen] = useState(false)
  // Each wizard is a separate mounted React instance. Hiding one never replaces its state.
  const [orderWindows, setOrderWindows] = useState([])
  const [activeWindow, setActiveWindow] = useState(null)
  const orderWindowsRef = React.useRef([])
  useEffect(() => { orderWindowsRef.current = orderWindows }, [orderWindows])
  useEffect(() => {
    const open = e => {
      const detail = e.detail || {}
      const id = detail.order?.id ? `order:${detail.order.id}` : 'order:new'
      const existing = orderWindowsRef.current.find(w => w.id === id)
      if (existing) { setActiveWindow(id); return }
      if (orderWindowsRef.current.length >= 3) {
        window.alert('You already have 3 Order Wizard windows open. Close one before opening another. Your existing work has been kept.')
        return
      }
      setOrderWindows(prev => [...prev, { id, order: detail.order || null, initialStep: detail.initialStep || 1 }])
      setActiveWindow(id)
    }
    window.addEventListener('app2a-open-order-window', open)
    return () => window.removeEventListener('app2a-open-order-window', open)
  }, [])
  const closeOrderWindow = id => {
    setOrderWindows(prev => prev.filter(w => w.id !== id))
    setActiveWindow(prev => prev === id ? null : prev)
    window.dispatchEvent(new Event('app2a-order-window-closed'))
  }

  const loc = useLocation()
  const base = '/' + loc.pathname.split('/')[1]
  const title = TITLES[base] || 'Nizamia OMS'
  useModuleActionLock(loc.pathname)
  useVerticalViewportFit()

  return (
    <WindowManager><div className="app-shell" style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar onOpenDeadlines={() => setDeadlinesOpen(true)} />
      <div className="app-main-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar onOpenDeadlines={() => setDeadlinesOpen(true)} />
        <main className="app-main-area" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Suspense fallback={<div role="status" style={{ padding: 24, fontSize: 12, color: "#64748b" }}>Loading page…</div>}><Outlet /></Suspense>
        </main>
      </div>
      {orderWindows.map(w => <OrderWizard
        key={w.id}
        order={w.order}
        initialStep={w.initialStep}
        minimized={activeWindow !== w.id}
        onMinimize={() => setActiveWindow(null)}
        onClose={() => closeOrderWindow(w.id)}
      />)}
      {orderWindows.some(w => w.id !== activeWindow) && <div role="region" aria-label="Minimized windows" style={{position:'fixed',right:20,bottom:18,zIndex:700,display:'flex',gap:8,maxWidth:'calc(100vw - 24px)',flexWrap:'wrap',justifyContent:'flex-end'}}>
        {orderWindows.filter(w => w.id !== activeWindow).map(w => <div key={w.id} style={{display:'flex',gap:4}}>
          <button onClick={() => setActiveWindow(w.id)} title="Restore Order Wizard" style={{display:'flex',alignItems:'center',gap:8,background:'#fff',border:'1px solid #cbd5e1',borderRadius:9,boxShadow:'0 6px 24px #0002',padding:'10px 12px',cursor:'pointer',fontSize:12,fontWeight:700,color:'#111827'}}><ChevronUp size={15}/>{w.order ? `Edit Order · ${w.order.style_number || w.order.id?.slice(0,8) || ''}` : 'New Order'}</button>
          <button onClick={() => { if (window.confirm('Close this Order Wizard? Unsaved changes may be lost.')) closeOrderWindow(w.id) }} title="Close minimized window" style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:8,cursor:'pointer'}}><X size={14}/></button>
        </div>)}
      </div>}
      <DeadlinesTracker open={deadlinesOpen} onClose={() => setDeadlinesOpen(false)} />
    </div></WindowManager>
  )
}
