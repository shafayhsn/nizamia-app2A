import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, X, Check } from 'lucide-react'
import { PROCESSES } from '../../../lib/utils'

export default function Step9Processes({ orderId, onSaved, registerSave }) {
  const [ticked,    setTicked]    = useState([])
  const [custom,    setCustom]    = useState([])
  const [newCustom, setNewCustom] = useState('')
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  useEffect(() => { if (orderId) load() }, [orderId])

  async function load() {
    const { data } = await supabase.from('order_processes').select('*').eq('order_id', orderId).order('sort_order')
    if (data) {
      setTicked(data.filter(p => !p.is_custom).map(p => p.process_name))
      setCustom(data.filter(p => p.is_custom).map(p => p.process_name))
    }
    // Load notes from order
    const { data: ord } = await supabase.from('orders').select('notes').eq('id', orderId).single()
    if (ord?.notes) setNotes(ord.notes)
  }

  const toggle = (p) => setTicked(t => t.includes(p) ? t.filter(x => x !== p) : [...t, p])

  const addCustom = () => {
    if (!newCustom.trim()) return
    setCustom(c => [...c, newCustom.trim()])
    setNewCustom('')
  }


  // Refs so doSave always has latest state without re-registering
  const tickedRef = useRef(ticked)
  const customRef = useRef(custom)
  const notesRef = useRef(notes)
  useEffect(() => { tickedRef.current = ticked }, [ticked])
  useEffect(() => { customRef.current = custom }, [custom])
  useEffect(() => { notesRef.current = notes }, [notes])

  const doSave = useCallback(async () => {
    if (!orderId) return
    await supabase.from('order_processes').delete().eq('order_id', orderId)
    const rows = [
      ...tickedRef.current.map((p, i) => ({ order_id: orderId, process_name: p, is_custom: false, sort_order: i })),
      ...customRef.current.map((p, i) => ({ order_id: orderId, process_name: p, is_custom: true, sort_order: tickedRef.current.length + i })),
    ]
    if (rows.length) await supabase.from('order_processes').insert(rows)
    await supabase.from('orders').update({ step_processes: true, notesRef.current }).eq('id', orderId)
    onSaved(orderId, { step_processes: true, notesRef.current })
  }, [orderId, ticked, custom, notes])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch {}
    setSaving(false)
  }

  const total = ticked.length + custom.length

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Processes</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          Select all processes required. Ticked processes will generate Work Orders in Purchasing.
        </div>
      </div>

      {/* Process grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 20 }}>
        {PROCESSES.map(p => {
          const on = ticked.includes(p)
          return (
            <label key={p} onClick={() => toggle(p)} style={{
              padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
              background: on ? '#1a1a2e' : '#fafaf8',
              border: `1px solid ${on ? '#1a1a2e' : '#e8e8e6'}`,
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.1s', userSelect: 'none',
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                background: on ? '#fff' : 'transparent',
                border: `1.5px solid ${on ? '#fff' : '#d1d5db'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {on && <Check size={9} strokeWidth={3} color="#1a1a2e" />}
              </div>
              <span style={{ fontSize: 11, fontWeight: on ? 600 : 400, color: on ? '#fff' : '#374151' }}>{p}</span>
            </label>
          )
        })}
      </div>

      {/* Custom processes */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Custom Processes</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none' }}
            placeholder="Add custom process..."
            value={newCustom}
            onChange={e => setNewCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
          />
          <button className="btn btn-secondary" onClick={addCustom}><Plus size={14} /></button>
        </div>
        {custom.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {custom.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: 5, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: '#92400e',
              }}>
                {p}
                <button onClick={() => setCustom(c => c.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: '#b45309' }}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes / Special Instructions</label>
        <textarea
          style={{ width: '100%', height: 80, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', resize: 'vertical' }}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any process-specific instructions or notes..."
        />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !orderId}>
          {saving ? 'Saving...' : 'Save Processes'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          {total} process{total !== 1 ? 'es' : ''} selected
        </span>
      </div>
    </div>
  )
}
