const KEY = 'nzm_tab_notices_v1'
export const TAB_NOTICE_EVENT = 'app2a:tab-notice-updated'

function readStore() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
function writeStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch {}
}
function notify(page, tab) {
  try {
    window.dispatchEvent(new CustomEvent(TAB_NOTICE_EVENT, { detail: { page, tab, updatedAt: Date.now() } }))
  } catch {}
}
function ensure(store, page, tab) {
  if (!store[page]) store[page] = {}
  if (!store[page][tab]) store[page][tab] = { updatedAt: 0, seenAt: 0 }
  return store[page][tab]
}
export function markTabUpdated(page, tab) {
  const store = readStore()
  const row = ensure(store, page, tab)
  row.updatedAt = Date.now()
  writeStore(store)
  notify(page, tab)
}
export function markTabSeen(page, tab) {
  const store = readStore()
  const row = ensure(store, page, tab)
  row.seenAt = Date.now()
  writeStore(store)
}
export function hasTabUnseen(page, tab) {
  const store = readStore()
  const row = ensure(store, page, tab)
  return (row.updatedAt || 0) > (row.seenAt || 0)
}
export function getPageTabNoticeMap(page, tabs = []) {
  return Object.fromEntries(tabs.map(tab => [tab, hasTabUnseen(page, tab)]))
}
