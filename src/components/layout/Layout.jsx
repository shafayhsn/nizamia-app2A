import React, { useEffect, useState, Suspense, lazy } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/authContext'
import { can, normalizeModule } from '../../lib/permissions'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import DeadlinesTracker from '../ui/DeadlinesTracker'
import OrderWizard from '../wizard/OrderWizard'
import { useWindowManager } from '../ui/WindowManager'
const Buyers = lazy(() => import('../../pages/Buyers'))
const Suppliers = lazy(() => import('../../pages/Suppliers'))
const Library = lazy(() => import('../../pages/Library'))

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

// A mounted Order Wizard registers with the same tray as Buyer/Supplier dialogs.
// Registration is tied to the window ID, not to page navigation or active state.
function OrderWindowTrayEntry({ id, title, active, onRestore, onClose }) {
  const manager = useWindowManager()
  const restoreRef = React.useRef(onRestore)
  const closeRef = React.useRef(onClose)
  restoreRef.current = onRestore
  closeRef.current = onClose
  useEffect(() => {
    if (!manager) return
    manager.register(id, title, () => restoreRef.current(), () => closeRef.current())
    return () => manager.unregister(id)
  }, [manager?.register, manager?.unregister, id, title])
  useEffect(() => {
    if (!manager) return
    if (active) manager.restore(id)
    else manager.minimize(id)
  }, [manager?.restore, manager?.minimize, id, active])
  return null
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
  const { userRole } = useAuth()
  const [visitedPages, setVisitedPages] = useState(() => new Set())
  useEffect(() => {
    const page = loc.pathname.split('/')[1]
    if ((page === 'buyers' || page === 'suppliers' || page === 'library') && can(userRole, page, 'view')) {
      setVisitedPages(prev => new Set([...prev, page]))
    }
  }, [loc.pathname, userRole])
  const base = '/' + loc.pathname.split('/')[1]
  const title = TITLES[base] || 'Nizamia OMS'
  useModuleActionLock(loc.pathname)
  useVerticalViewportFit()

  return (
    <div className="app-shell" style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar onOpenDeadlines={() => setDeadlinesOpen(true)} />
      <div className="app-main-column" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar onOpenDeadlines={() => setDeadlinesOpen(true)} />
        <main className="app-main-area" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Suspense fallback={<div role="status" style={{ padding: 24, fontSize: 12, color: "#64748b" }}>Loading page…</div>}>
            <div style={{display: (base === '/buyers' || base === '/suppliers' || base === '/library') && can(userRole, base.slice(1), 'view') ? 'none' : 'contents'}}><Outlet /></div>

            {visitedPages.has('buyers') && can(userRole, 'buyers', 'view') && <div style={{display:base === '/buyers' ? 'contents' : 'none'}}><Buyers /></div>}
            {visitedPages.has('suppliers') && can(userRole, 'suppliers', 'view') && <div style={{display:base === '/suppliers' ? 'contents' : 'none'}}><Suppliers /></div>}
            {visitedPages.has('library') && can(userRole, 'library', 'view') && <div style={{display:base === '/library' ? 'contents' : 'none'}}><Library /></div>}

          </Suspense>
        </main>
      </div>
      {orderWindows.map(w => <React.Fragment key={w.id}>
        <OrderWindowTrayEntry
          id={`wizard:${w.id}`}
          title={w.order ? `Edit Order · ${w.order.style_number || w.order.id?.slice(0,8) || ''}` : 'New Order'}
          active={activeWindow === w.id}
          onRestore={() => setActiveWindow(w.id)}
          onClose={() => closeOrderWindow(w.id)}
        />
        <OrderWizard
          order={w.order}
          initialStep={w.initialStep}
          minimized={activeWindow !== w.id}
          onMinimize={() => setActiveWindow(null)}
          onClose={() => closeOrderWindow(w.id)}
        />
      </React.Fragment>)}
      <DeadlinesTracker open={deadlinesOpen} onClose={() => setDeadlinesOpen(false)} />
    </div>
  )
}
