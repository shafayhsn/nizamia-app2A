import React, { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/authContext'
import { can, normalizeModule } from '../../lib/permissions'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import DeadlinesTracker from '../ui/DeadlinesTracker'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/orders': 'Orders',
  '/purchasing': 'Purchasing',
  '/buyers': 'Buyers',
  '/suppliers': 'Suppliers',
  '/library': 'Library',
  '/shipping': 'Booking & Shipping',
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
  const loc = useLocation()
  const base = '/' + loc.pathname.split('/')[1]
  const title = TITLES[base] || 'Nizamia OMS'
  useModuleActionLock(loc.pathname)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar onOpenDeadlines={() => setDeadlinesOpen(true)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar onOpenDeadlines={() => setDeadlinesOpen(true)} />
        <main style={{ flex: 1, overflow: 'hidden' }}>
          <Outlet />
        </main>
      </div>
      <DeadlinesTracker open={deadlinesOpen} onClose={() => setDeadlinesOpen(false)} />
    </div>
  )
}
