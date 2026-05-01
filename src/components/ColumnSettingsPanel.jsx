import React, { useState } from 'react'
import { X } from 'lucide-react'
import { saveShippingViewPrefs, resetShippingViewPrefs } from '../lib/shippingViewPrefs'

export default function ColumnSettingsPanel({ tab, allColumns, onSave, onClose }) {
  const [visible, setVisible] = useState(() => {
    const prefs = JSON.parse(localStorage.getItem('app2a.shipping.viewPrefs') || '{}')
    return prefs[tab]?.visibleColumns || []
  })

  const handleToggle = (colId) => {
    setVisible(prev => {
      if (prev.includes(colId)) {
        return prev.filter(id => id !== colId)
      } else {
        return [...prev, colId]
      }
    })
  }

  const handleSave = () => {
    const pinned = ['checkbox', allColumns[1]?.id] // checkbox + first substantive column
    const hidden = allColumns
      .map(c => c.id)
      .filter(id => !visible.includes(id) && !pinned.includes(id))

    saveShippingViewPrefs(tab, {
      pinnedColumns: pinned,
      visibleColumns: visible,
      hiddenColumns: hidden,
    })
    onSave?.()
    onClose()
  }

  const handleReset = () => {
    resetShippingViewPrefs(tab)
    onSave?.()
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.34)', zIndex: 99, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: 'min(520px, 94vw)', maxHeight: '88vh', overflow: 'hidden', background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(15,23,42,0.22)', border: '1px solid #eef0f4', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 58, borderBottom: '1px solid #eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>Column Settings</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '18px', overflowY: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 12 }}>Visible Columns</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {allColumns.map(col => (
                <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 0' }}>
                  <input
                    type="checkbox"
                    checked={visible.includes(col.id)}
                    onChange={() => handleToggle(col.id)}
                    disabled={col.id === 'checkbox'} // Checkbox always visible
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: '#374151' }}>{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #eef0f4', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={handleReset}
            style={{
              padding: '8px 14px',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              color: '#374151',
            }}
          >
            Reset to Default
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 14px',
              background: '#2383e2',
              border: 'none',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            Save Columns
          </button>
        </div>
      </div>
    </div>
  )
}
