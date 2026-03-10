import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2 } from 'lucide-react'
import { generateSampleNumber, formatDate, SAMPLE_TYPES } from '../../../lib/utils'

export default function Step5Sampling({ orderId, onSaved }) {
  const [samples, setSamples] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (orderId) load() }, [orderId])

  async function load() {
    const { data } = await supabase.from('samples').select('*').eq('order_id', orderId).order('created_at')
    setSamples(data || [])
  }

  const addSample = async () => {
    const num = await generateSampleNumber()
    const { data } = await supabase.from('samples').insert([{
      order_id: orderId, sample_number: num, sample_type: 'Proto', status: 'Pending'
    }]).select().single()
    if (data) setSamples(s => [...s, data])
    await supabase.from('orders').update({ step_sampling: true }).eq('id', orderId)
    onSaved(orderId, { step_sampling: true })
  }

  const update = async (id, k, v) => {
    setSamples(s => s.map(x => x.id === id ? { ...x, [k]: v } : x))
    await supabase.from('samples').update({ [k]: v }).eq('id', id)
  }

  const remove = async (id) => {
    await supabase.from('samples').delete().eq('id', id)
    setSamples(s => s.filter(x => x.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Sample Requests</div>
        <button className="btn btn-primary btn-sm" onClick={addSample}><Plus size={12} /> Request Sample</button>
      </div>

      {samples.length === 0 ? (
        <div className="empty-state"><p>No samples requested yet.</p></div>
      ) : (
        <table>
          <thead><tr>
            <th>Sample No.</th><th>Type</th><th>Colour</th><th>Size</th>
            <th>Due Date</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {samples.map(s => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{s.sample_number}</td>
                <td>
                  <select className="select" style={{ fontSize: 11, height: 26 }} value={s.sample_type || ''} onChange={e => update(s.id, 'sample_type', e.target.value)}>
                    {SAMPLE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td><input className="input" style={{ fontSize: 11, height: 26 }} value={s.color || ''} onChange={e => update(s.id, 'color', e.target.value)} placeholder="Colour" /></td>
                <td><input className="input" style={{ fontSize: 11, height: 26, width: 60 }} value={s.size || ''} onChange={e => update(s.id, 'size', e.target.value)} /></td>
                <td><input className="input" type="date" style={{ fontSize: 11, height: 26 }} value={s.due_date || ''} onChange={e => update(s.id, 'due_date', e.target.value)} /></td>
                <td>
                  <select className="select" style={{ fontSize: 11, height: 26 }} value={s.status || 'Pending'} onChange={e => update(s.id, 'status', e.target.value)}>
                    {['Pending','Requested','Received','Approved','Rejected'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => remove(s.id)}><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
