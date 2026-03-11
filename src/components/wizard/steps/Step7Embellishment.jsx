import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, Upload, X } from 'lucide-react'

const TECHNIQUES = ['Screen Print','Embroidery','Heat Transfer','Woven Label','Rubber Print','Foil Print','Paint Splatter','Appliqué','Other']
const PLACEMENTS = ['Left Chest','Right Chest','Center Chest','Back','Sleeve Left','Sleeve Right','Collar','Hem','Pocket','Custom']

export default function Step7Embellishment({ orderId, onSaved, registerSave }) {
  const [items,   setItems]   = useState([])
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [colors,  setColors]  = useState([]) // from PO Matrix
  const imgRefs = useRef({})

  useEffect(() => {
    if (!orderId) return
    load()
    // Load colours from PO matrix
    supabase.from('size_groups').select('id').eq('order_id', orderId)
      .then(async ({ data: sgs }) => {
        const allColors = []
        for (const sg of (sgs || [])) {
          const { data: cls } = await supabase.from('size_group_colors').select('color_name').eq('size_group_id', sg.id)
          cls?.forEach(c => { if (!allColors.includes(c.color_name)) allColors.push(c.color_name) })
        }
        setColors(['All', ...allColors])
      })
  }, [orderId])

  async function load() {
    const { data } = await supabase.from('embellishments').select('*').eq('order_id', orderId).order('created_at')
    setItems((data || []).map(d => ({ ...d, _tempId: d.id, imagePreview: d.artwork_url || null })))
  }

  const add = () => setItems(i => [...i, {
    _new: true, _tempId: Math.random().toString(36).slice(2),
    order_id: orderId, description: '', technique: 'Screen Print',
    placement: 'Left Chest', dimensions: '', artwork_ref: '',
    colors_used: '', applies_to: ['All'], approval_status: 'Pending',
    notes: '', imagePreview: null, artwork_url: null,
  }])

  const upd = (idx, k, v) => setItems(its => { const n = [...its]; n[idx] = { ...n[idx], [k]: v }; return n })

  const remove = async (idx) => {
    const item = items[idx]
    if (item.id) await supabase.from('embellishments').delete().eq('id', item.id)
    setItems(its => its.filter((_, i) => i !== idx))
  }

  const handleImage = (idx, file) => {
    if (!file || file.size > 2 * 1024 * 1024) return
    const reader = new FileReader()
    reader.onload = (e) => { upd(idx, 'imagePreview', e.target.result); upd(idx, 'artwork_url', e.target.result) }
    reader.readAsDataURL(file)
  }


  // Refs so doSave always has latest state without re-registering
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const doSave = useCallback(async () => {
    if (!orderId) return
    await supabase.from('embellishments').delete().eq('order_id', orderId)
    const rows = itemsRef.current.filter(i => i.description?.trim()).map(({ _new, _tempId, imagePreview, ...rest }) => ({ ...rest }))
    if (rows.length) await supabase.from('embellishments').insert(rows)
    await supabase.from('orders').update({ step_embellishment: true }).eq('id', orderId)
    onSaved(orderId, { step_embellishment: true })
  }, [items, orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch {}
    setSaving(false)
    load()
  }

  const inp = { width: '100%', height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff' }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }

  const statusColor = { Pending: '#f59e0b', Approved: '#16a34a', Rejected: '#dc2626' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Embellishments</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Artwork, prints, embroidery and decorative details</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={add}><Plus size={12} /> Add</button>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          No embellishments for this order. Click Add to begin.
        </div>
      ) : items.map((item, idx) => (
        <div key={item._tempId || idx} style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
          {/* Card header */}
          <div style={{ padding: '10px 14px', background: '#fafaf8', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1, color: item.description ? '#0d0d0d' : '#9ca3af' }}>
              {item.description || `Embellishment ${idx + 1}`}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: statusColor[item.approval_status] + '18', color: statusColor[item.approval_status], border: `1px solid ${statusColor[item.approval_status]}44` }}>
              {item.approval_status}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(idx)}><Trash2 size={11} /></button>
          </div>

          <div style={{ padding: '12px 14px', display: 'flex', gap: 14 }}>
            {/* Artwork image */}
            <div style={{ flexShrink: 0 }}>
              {item.imagePreview ? (
                <div style={{ position: 'relative', width: 80, height: 80 }}>
                  <img src={item.imagePreview} alt="" style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fafafa' }} />
                  <button onClick={() => { upd(idx, 'imagePreview', null); upd(idx, 'artwork_url', null) }} style={{ position: 'absolute', top: -5, right: -5, background: '#0d0d0d', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={9} color="#fff" />
                  </button>
                </div>
              ) : (
                <div onClick={() => imgRefs.current[idx]?.click()} style={{ width: 80, height: 80, border: '1.5px dashed #d1d5db', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafafa' }}>
                  <Upload size={14} color="#d1d5db" />
                  <span style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>Artwork</span>
                </div>
              )}
              <input type="file" accept="image/*" style={{ display: 'none' }} ref={el => imgRefs.current[idx] = el} onChange={e => handleImage(idx, e.target.files?.[0])} />
            </div>

            {/* Fields */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Description *</label>
                <input style={inp} value={item.description || ''} onChange={e => upd(idx, 'description', e.target.value)} placeholder="e.g. Chest Logo" />
              </div>
              <div>
                <label style={lbl}>Technique</label>
                <select style={sel} value={item.technique || 'Screen Print'} onChange={e => upd(idx, 'technique', e.target.value)}>
                  {TECHNIQUES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Placement</label>
                <select style={sel} value={item.placement || 'Left Chest'} onChange={e => upd(idx, 'placement', e.target.value)}>
                  {PLACEMENTS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Dimensions</label>
                <input style={inp} value={item.dimensions || ''} onChange={e => upd(idx, 'dimensions', e.target.value)} placeholder="8×6 cm" />
              </div>
              <div>
                <label style={lbl}>Artwork Ref</label>
                <input style={inp} value={item.artwork_ref || ''} onChange={e => upd(idx, 'artwork_ref', e.target.value)} placeholder="ART-001" />
              </div>
              <div>
                <label style={lbl}>Colours Used</label>
                <input style={inp} value={item.colors_used || ''} onChange={e => upd(idx, 'colors_used', e.target.value)} placeholder="Pantone 485 C, White" />
              </div>
              <div>
                <label style={lbl}>Applies To</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 4 }}>
                  {colors.map(c => {
                    const on = (item.applies_to || ['All']).includes(c)
                    return (
                      <button key={c} onClick={() => {
                        const cur = item.applies_to || ['All']
                        if (c === 'All') { upd(idx, 'applies_to', ['All']); return }
                        const next = on ? cur.filter(x => x !== c) : [...cur.filter(x => x !== 'All'), c]
                        upd(idx, 'applies_to', next.length ? next : ['All'])
                      }} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', background: on ? '#0d0d0d' : '#f0f0ee', color: on ? '#fff' : '#6b7280' }}>
                        {c}
                      </button>
                    )
                  })}
                  {colors.length === 0 && <span style={{ fontSize: 10, color: '#9ca3af' }}>Add PO Matrix colours first</span>}
                </div>
              </div>
              <div>
                <label style={lbl}>Approval Status</label>
                <select style={{ ...sel, fontWeight: 600, color: statusColor[item.approval_status] }} value={item.approval_status || 'Pending'} onChange={e => upd(idx, 'approval_status', e.target.value)}>
                  {['Pending', 'Approved', 'Rejected'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <input style={inp} value={item.notes || ''} onChange={e => upd(idx, 'notes', e.target.value)} placeholder="Any special instructions..." />
              </div>
            </div>
          </div>
        </div>
      ))}

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !orderId}>
            {saving ? 'Saving...' : 'Save Embellishments'}
          </button>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
        </div>
      )}
    </div>
  )
}
