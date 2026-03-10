import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, X } from 'lucide-react'
import { PROCESSES } from '../../../lib/utils'

export default function Step9Processes({ orderId, onSaved }) {
  const [ticked, setTicked] = useState([])
  const [custom, setCustom] = useState([])
  const [newCustom, setNewCustom] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (orderId) load() }, [orderId])

  async function load() {
    const { data } = await supabase.from('order_processes').select('*').eq('order_id', orderId).order('sort_order')
    if (data) {
      setTicked(data.filter(p => !p.is_custom).map(p => p.process_name))
      setCustom(data.filter(p => p.is_custom).map(p => p.process_name))
    }
  }

  const toggle = (p) => setTicked(t => t.includes(p) ? t.filter(x => x !== p) : [...t, p])

  const addCustom = () => {
    if (!newCustom.trim()) return
    setCustom(c => [...c, newCustom.trim()])
    setNewCustom('')
  }

  const removeCustom = (idx) => setCustom(c => c.filter((_, i) => i !== idx))

  const handleSave = async () => {
    if (!orderId) return
    setSaving(true)
    await supabase.from('order_processes').delete().eq('order_id', orderId)
    const rows = [
      ...ticked.map((p, i) => ({ order_id: orderId, process_name: p, is_custom: false, sort_order: i })),
      ...custom.map((p, i) => ({ order_id: orderId, process_name: p, is_custom: true, sort_order: ticked.length + i })),
    ]
    if (rows.length) await supabase.from('order_processes').insert(rows)
    await supabase.from('orders').update({ step_processes: true }).eq('id', orderId)
    onSaved(orderId, { step_processes: true })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Processes</div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 16 }}>
        Select all processes required for this order. Ticked processes will generate Work Orders in Purchasing.
      </div>

      {/* Process grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 20 }}>
        {PROCESSES.map(p => (
          <label key={p} className="checkbox-wrap" style={{
            padding: '8px 12px', borderRadius: 6,
            background: ticked.includes(p) ? '#f0f0ee' : 'transparent',
            border: `1px solid ${ticked.includes(p) ? 'var(--border-dark)' : 'transparent'}`,
            cursor: 'pointer', transition: 'all 0.1s',
          }}>
            <input type="checkbox" checked={ticked.includes(p)} onChange={() => toggle(p)} />
            <span style={{ fontSize: 12 }}>{p}</span>
          </label>
        ))}
      </div>

      {/* Custom processes */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Custom Processes (order-level)</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input className="input" style={{ flex: 1 }} placeholder="Add custom process..." value={newCustom}
            onChange={e => setNewCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()} />
          <button className="btn btn-secondary" onClick={addCustom}><Plus size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {custom.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: '#f7f7f5', border: '1px solid var(--border-dark)',
              borderRadius: 4, padding: '3px 8px', fontSize: 12,
            }}>
              {p}
              <button onClick={() => removeCustom(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', display: 'flex', padding: 0 }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="form-group">
        <label>Notes / Special Instructions</label>
        <textarea className="textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any process-specific instructions..." />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-accent" onClick={handleSave} disabled={saving || !orderId}>
          {saving ? 'Saving...' : 'Save Processes'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
          {ticked.length + custom.length} process{ticked.length + custom.length !== 1 ? 'es' : ''} selected
        </span>
      </div>
    </div>
  )
}
