import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { saveShippingViewPrefs, resetShippingViewPrefs } from '../lib/shippingViewPrefs'

function currentUserKey() {
  try {
    const raw = localStorage.getItem('app2a.auth.user') || localStorage.getItem('app2a_user') || '{}'
    const u = JSON.parse(raw)
    return u?.id || u?.username || u?.email || 'user'
  } catch { return 'user' }
}
function prefKey(tab) { return `app2a.tableView.${currentUserKey()}.${tab || 'table'}` }

export default function ColumnSettingsPanel({ tab, allColumns, onSave, onClose }) {
  const initial = useMemo(() => {
    try {
      const global = JSON.parse(localStorage.getItem(prefKey(tab)) || 'null')
      if (global?.visible && global?.order) return { visible: global.visible, order: global.order }
    } catch {}
    try {
      const legacy = JSON.parse(localStorage.getItem('app2a.shipping.viewPrefs') || '{}')
      const ids = allColumns.map(c => c.id)
      return { visible: legacy[tab]?.visibleColumns || ids, order: legacy[tab]?.columnOrder || ids }
    } catch { return { visible: allColumns.map(c => c.id), order: allColumns.map(c => c.id) } }
  }, [tab, allColumns])

  const [visible, setVisible] = useState(initial.visible || [])
  const [order, setOrder] = useState(initial.order?.length ? initial.order : allColumns.map(c => c.id))
  const [dragKey, setDragKey] = useState(null)
  const columnMap = Object.fromEntries(allColumns.map(c => [c.id, c]))
  const orderedIds = order.filter(id => columnMap[id]).concat(allColumns.map(c=>c.id).filter(id=>!order.includes(id)))

  const handleToggle = (colId) => setVisible(prev => prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId])
  const moveKey = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return
    const next = orderedIds.filter(id => id !== fromKey)
    const idx = next.indexOf(toKey)
    next.splice(idx < 0 ? next.length : idx, 0, fromKey)
    setOrder(next)
  }

  const handleSave = () => {
    const pinned = ['checkbox', allColumns[1]?.id].filter(Boolean)
    const hidden = allColumns.map(c => c.id).filter(id => !visible.includes(id) && !pinned.includes(id))
    localStorage.setItem(prefKey(tab), JSON.stringify({ visible, order: orderedIds }))
    saveShippingViewPrefs(tab, { pinnedColumns: pinned, visibleColumns: visible, hiddenColumns: hidden, columnOrder: orderedIds })
    onSave?.({ visible, order: orderedIds })
    onClose()
  }

  const handleReset = () => {
    localStorage.removeItem(prefKey(tab))
    resetShippingViewPrefs(tab)
    onSave?.()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.34)', zIndex: 99, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: 'min(520px, 94vw)', maxHeight: '88vh', overflow: 'hidden', background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(15,23,42,0.22)', border: '1px solid #eef0f4', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 58, borderBottom: '1px solid #eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
          <div><div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>Column Settings</div><div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>Drag fields to reorder. Saved per user.</div></div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '18px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {orderedIds.map(id => {
              const col = columnMap[id]
              if (!col) return null
              return <label key={id} draggable onDragStart={() => setDragKey(id)} onDragOver={e => e.preventDefault()} onDrop={() => moveKey(dragKey, id)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'grab', padding: '9px 10px', border:'1px solid #eef0f4', borderRadius:10, background:dragKey===id?'#f9fafb':'#fff' }}>
                <span style={{ color:'#9ca3af', fontWeight:900 }}>⋮⋮</span>
                <input type="checkbox" checked={visible.includes(id)} onChange={() => handleToggle(id)} disabled={id === 'checkbox'} style={{ cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: '#374151', fontWeight:700 }}>{col.label}</span>
              </label>
            })}
          </div>
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #eef0f4', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={handleReset} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Reset</button>
          <button onClick={handleSave} style={{ padding: '8px 14px', background: '#2383e2', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#fff' }}>Save Columns</button>
        </div>
      </div>
    </div>
  )
}
