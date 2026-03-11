import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2 } from 'lucide-react'

const TECHNIQUES = ['Screen Print','Embroidery','Heat Transfer','Woven Label','Rubber Print','Foil Print','Paint Splatter','Appliqué']

export default function Step7Embellishment({ orderId, onSaved }) {
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (orderId) load() }, [orderId])

  async function load() {
    const { data } = await supabase.from('embellishments').select('*').eq('order_id', orderId)
    setItems(data || [])
  }

  const add = () => setItems(i => [...i, { _new: true, order_id: orderId, description: '', technique: 'Screen Print', placement: '', applies_to: ['All'], approval_status: 'Pending' }])

  const update = (idx, k, v) => setItems(items => { const n = [...items]; n[idx] = { ...n[idx], [k]: v }; return n })

  const remove = async (idx) => {
    const item = items[idx]
    if (item.id) await supabase.from('embellishments').delete().eq('id', item.id)
    setItems(items.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!orderId) return
    setSaving(true)
    await supabase.from('embellishments').delete().eq('order_id', orderId)
    const rows = items.filter(i => i.description).map(({ _new, id, ...rest }) => ({ ...rest }))
    if (rows.length) await supabase.from('embellishments').insert(rows)
    await supabase.from('orders').update({ step_embellishment: true }).eq('id', orderId)
    onSaved(orderId, { step_embellishment: true })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Embellishments</div>
        <button className="btn btn-secondary btn-sm" onClick={add}><Plus size={12} /> Add</button>
      </div>

      {items.length === 0 ? (
        <div className="empty-state"><p>No embellishments for this order.</p></div>
      ) : items.map((item, idx) => (
        <div key={idx} className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="form-row form-row-3" style={{ marginBottom: 10 }}>
            <div><label>Description</label><input className="input" value={item.description} onChange={e => update(idx, 'description', e.target.value)} placeholder="e.g. Chest Logo Print" /></div>
            <div><label>Technique</label>
              <select className="select" value={item.technique || ''} onChange={e => update(idx, 'technique', e.target.value)}>
                {TECHNIQUES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label>Placement</label><input className="input" value={item.placement || ''} onChange={e => update(idx, 'placement', e.target.value)} placeholder="e.g. Left chest 8×6cm" /></div>
          </div>
          <div className="form-row form-row-3">
            <div><label>Dimensions</label><input className="input" value={item.dimensions || ''} onChange={e => update(idx, 'dimensions', e.target.value)} /></div>
            <div><label>Artwork Ref</label><input className="input" value={item.artwork_ref || ''} onChange={e => update(idx, 'artwork_ref', e.target.value)} placeholder="ART-001" /></div>
            <div><label>Status</label>
              <select className="select" value={item.approval_status || 'Pending'} onChange={e => update(idx, 'approval_status', e.target.value)}>
                {['Pending','Approved','Rejected'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(idx)}><Trash2 size={12} /> Remove</button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn btn-accent" onClick={handleSave} disabled={saving || !orderId}>
          {saving ? 'Saving...' : 'Save Embellishments'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
