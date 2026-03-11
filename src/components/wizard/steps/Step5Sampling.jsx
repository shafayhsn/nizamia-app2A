import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check } from 'lucide-react'
import { generateSampleNumber, SAMPLE_TYPES } from '../../../lib/utils'

export default function Step5Sampling({ orderId, onSaved, registerSave }) {
  const [samples, setSamples] = useState([])
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => { if (orderId) load() }, [orderId])

  async function load() {
    const { data } = await supabase.from('samples').select('*').eq('order_id', orderId).order('created_at')
    setSamples(data || [])
  }

  const addSample = async () => {
    if (!orderId) return
    const num = await generateSampleNumber()
    const { data } = await supabase.from('samples').insert([{
      order_id: orderId, sample_number: num, sample_type: 'Proto', status: 'Pending',
    }]).select().single()
    if (data) {
      setSamples(s => [...s, data])
      await supabase.from('orders').update({ step_sampling: true }).eq('id', orderId)
      onSaved(orderId, { step_sampling: true })
    }
  }

  const updLocal = (id, k, v) => setSamples(s => s.map(x => x.id === id ? { ...x, [k]: v } : x))

  const remove = async (id) => {
    await supabase.from('samples').delete().eq('id', id)
    setSamples(s => s.filter(x => x.id !== id))
  }


  // Refs so doSave always has latest state without re-registering
  const samplesRef = useRef(samples)
  useEffect(() => { samplesRef.current = samples }, [samples])

  const doSave = useCallback(async () => {
    if (!orderId || !samplesRef.current.length) return
    for (const s of samplesRef.current) {
      const { id, created_at, order_id, sample_number, ...rest } = s
      await supabase.from('samplesRef.current').update(rest).eq('id', id)
    }
    await supabase.from('orders').update({ step_sampling: true }).eq('id', orderId)
    onSaved(orderId, { step_sampling: true })
  }, [samples, orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch {}
    setSaving(false)
  }

  const inp = { height: 28, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff' }
  const statusColor = { Pending: '#f59e0b', Requested: '#3b82f6', Received: '#8b5cf6', Approved: '#16a34a', Rejected: '#dc2626' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Sample Requests</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Track samples — numbers auto-generated</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={addSample} disabled={!orderId}>
          <Plus size={12} /> Request Sample
        </button>
      </div>

      {samples.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          No samples yet. Click "Request Sample" to begin.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
            <thead>
              <tr>
                {['Sample No.', 'Type', 'Colour', 'Size', 'Requested', 'Due Date', 'Status', 'Notes', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 6px 10px', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.map(s => (
                <tr key={s.id}>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0ee' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#0d0d0d' }}>{s.sample_number}</span>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 110 }}>
                    <select style={{ ...inp, width: '100%', cursor: 'pointer' }} value={s.sample_type || 'Proto'} onChange={e => updLocal(s.id, 'sample_type', e.target.value)}>
                      {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 100 }}>
                    <input style={{ ...inp, width: '100%' }} value={s.color || ''} onChange={e => updLocal(s.id, 'color', e.target.value)} placeholder="Colour" />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 55 }}>
                    <input style={{ ...inp, width: 48 }} value={s.size || ''} onChange={e => updLocal(s.id, 'size', e.target.value)} placeholder="M" />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 130 }}>
                    <input style={{ ...inp, width: '100%' }} type="date" value={s.requested_date || ''} onChange={e => updLocal(s.id, 'requested_date', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 130 }}>
                    <input style={{ ...inp, width: '100%' }} type="date" value={s.due_date || ''} onChange={e => updLocal(s.id, 'due_date', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 110 }}>
                    <select style={{ ...inp, width: '100%', cursor: 'pointer', fontWeight: 600, color: statusColor[s.status] || '#374151' }}
                      value={s.status || 'Pending'} onChange={e => updLocal(s.id, 'status', e.target.value)}>
                      {['Pending', 'Requested', 'Received', 'Approved', 'Rejected'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 130 }}>
                    <input style={{ ...inp, width: '100%' }} value={s.comments || ''} onChange={e => updLocal(s.id, 'comments', e.target.value)} placeholder="Notes..." />
                  </td>
                  <td style={{ padding: '4px 0 4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(s.id)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {samples.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !orderId}>
            {saving ? 'Saving...' : 'Save Samples'}
          </button>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
        </div>
      )}
    </div>
  )
}
