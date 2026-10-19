import React, { useEffect, useState, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/authContext'
import { can, normalizeModule } from '../../lib/permissions'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import DeadlinesTracker from '../ui/DeadlinesTracker'
import OrderWizard from '../wizard/OrderWizard'
import { Minus, ChevronUp, X } from 'lucide-react'

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
  const [orderWindow,setOrderWindow] = useState(null)
  const [orderMinimized,setOrderMinimized] = useState(false)
  useEffect(()=>{
    const open=e=>{const detail=e.detail||{};setOrderWindow(prev=>prev || {order:detail.order||null,initialStep:detail.initialStep||1});setOrderMinimized(false)}
    window.addEventListener('app2a-open-order-window',open)
    return()=>window.removeEventListener('app2a-open-order-window',open)
  },[])
  const closeOrderWindow=()=>{setOrderWindow(null);setOrderMinimized(false);window.dispatchEvent(new Event('app2a-order-window-closed'))}

  const loc = useLocation()
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
          <Suspense fallback={<div role="status" style={{ padding: 24, fontSize: 12, color: "#64748b" }}>Loading page…</div>}><Outlet /></Suspense>
        </main>
      </div>
      {orderWindow && <OrderWizard key={orderWindow.order?.id||'new-order'} order={orderWindow.order} initialStep={orderWindow.initialStep} minimized={orderMinimized} onMinimize={()=>setOrderMinimized(true)} onClose={closeOrderWindow} />}
      {orderWindow && orderMinimized && <div role="region" aria-label="Minimized windows" style={{position:'fixed',right:20,bottom:18,zIndex:700,display:'flex',gap:8,maxWidth:'calc(100vw - 24px)'}}>
        <button onClick={()=>setOrderMinimized(false)} title="Restore Order Wizard" style={{display:'flex',alignItems:'center',gap:8,background:'#fff',border:'1px solid #cbd5e1',borderRadius:9,boxShadow:'0 6px 24px #0002',padding:'10px 12px',cursor:'pointer',fontSize:12,fontWeight:700,color:'#111827'}}><ChevronUp size={15}/>{orderWindow.order?`Edit Order · ${orderWindow.order.style_number||''}`:'New Order'}</button>
        <button onClick={closeOrderWindow} title="Close minimized window (unsaved changes may be lost)" style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:8,cursor:'pointer'}}><X size={14}/></button>
      </div>}
      <DeadlinesTracker open={deadlinesOpen} onClose={() => setDeadlinesOpen(false)} />
    </div>
  )
}
