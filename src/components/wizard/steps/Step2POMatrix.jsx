import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2 } from 'lucide-react'

export default function Step2POMatrix({ orderId, orderData, onSaved }) {
  const [groups, setGroups] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (orderId) loadGroups() }, [orderId])

  async function loadGroups() {
    const { data: sg } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    if (!sg?.length) { setGroups([newGroup()]); return }
    const groups = await Promise.all(sg.map(async g => {
      const { data: colors } = await supabase.from('size_group_colors').select('*').eq('size_group_id', g.id).order('sort_order')
      const { data: breakdown } = await supabase.from('size_group_breakdown').select('*').eq('size_group_id', g.id)
      const bdMap = {}
      breakdown?.forEach(b => { if (!bdMap[b.color_id]) bdMap[b.color_id] = {}; bdMap[b.color_id][b.size] = b.qty })
      return { ...g, colors: colors || [], breakdown: bdMap }
    }))
    setGroups(groups)
  }

  function newGroup() {
    return {
      _new: true, group_name: 'Group 1', unit_price: '', currency: orderData.currency || 'USD',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [{ _new: true, color_name: '', sort_order: 0 }],
      breakdown: {},
    }
  }

  const addGroup = () => setGroups(g => [...g, { ...newGroup(), group_name: `Group ${g.length + 1}` }])
  const removeGroup = (i) => setGroups(g => g.filter((_, idx) => idx !== i))

  const updateGroup = (i, k, v) => setGroups(g => { const n = [...g]; n[i] = { ...n[i], [k]: v }; return n })

  const addColor = (gi) => setGroups(g => {
    const n = [...g]; n[gi].colors = [...n[gi].colors, { _new: true, color_name: '', sort_order: n[gi].colors.length }]; return n
  })
  const removeColor = (gi, ci) => setGroups(g => { const n = [...g]; n[gi].colors = n[gi].colors.filter((_, i) => i !== ci); return n })
  const updateColor = (gi, ci, v) => setGroups(g => { const n = [...g]; n[gi].colors[ci] = { ...n[gi].colors[ci], color_name: v }; return n })

  const setQty = (gi, colorId, size, qty) => setGroups(g => {
    const n = [...g]
    if (!n[gi].breakdown[colorId]) n[gi].breakdown[colorId] = {}
    n[gi].breakdown[colorId][size] = parseInt(qty) || 0
    return n
  })

  const sizeTotal = (g, size) => g.colors.reduce((s, c) => s + (parseInt(g.breakdown[c.id || c._id]?.[size]) || 0), 0)
  const colorTotal = (g, colorId) => g.sizes.reduce((s, sz) => s + (parseInt(g.breakdown[colorId]?.[sz]) || 0), 0)
  const grandTotal = (g) => g.sizes.reduce((s, sz) => s + sizeTotal(g, sz), 0)

  const handleSizeInput = (gi, v) => {
    const sizes = v.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    updateGroup(gi, 'sizes', sizes)
  }

  const handleSave = async () => {
    if (!orderId) return
    setSaving(true)
    // Delete existing and re-insert
    await supabase.from('size_groups').delete().eq('order_id', orderId)

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi]
      const { data: sg } = await supabase.from('size_groups').insert([{
        order_id: orderId, group_name: g.group_name,
        unit_price: parseFloat(g.unit_price) || null,
        currency: g.currency, sizes: g.sizes, sort_order: gi,
      }]).select().single()

      if (sg) {
        for (let ci = 0; ci < g.colors.length; ci++) {
          const c = g.colors[ci]
          if (!c.color_name) continue
          const { data: sc } = await supabase.from('size_group_colors').insert([{
            size_group_id: sg.id, color_name: c.color_name, sort_order: ci,
          }]).select().single()
          if (sc) {
            const bRows = g.sizes.map(sz => ({
              size_group_id: sg.id, color_id: sc.id, size: sz,
              qty: parseInt(g.breakdown[c.id || c._id || ci]?.[sz]) || 0
            })).filter(r => r.qty > 0)
            if (bRows.length) await supabase.from('size_group_breakdown').insert(bRows)
          }
        }
      }
    }

    await supabase.from('orders').update({ step_po_matrix: true }).eq('id', orderId)
    onSaved(orderId, { step_po_matrix: true })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  return (
    <div>
      {groups.map((g, gi) => (
        <div key={gi} className="card" style={{ marginBottom: 20 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 140 }}>
                <label>Group Name</label>
                <input className="input" value={g.group_name} onChange={e => updateGroup(gi, 'group_name', e.target.value)} />
              </div>
              <div style={{ minWidth: 100 }}>
                <label>Unit Price</label>
                <input className="input" type="number" value={g.unit_price} onChange={e => updateGroup(gi, 'unit_price', e.target.value)} placeholder="0.00" />
              </div>
              <div style={{ minWidth: 80 }}>
                <label>Currency</label>
                <select className="select" value={g.currency} onChange={e => updateGroup(gi, 'currency', e.target.value)}>
                  {['USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label>Sizes (comma-separated)</label>
                <input className="input" value={g.sizes.join(', ')} onChange={e => handleSizeInput(gi, e.target.value)} placeholder="XS, S, M, L, XL" />
              </div>
            </div>
            {groups.length > 1 && (
              <button className="btn btn-ghost btn-sm" onClick={() => removeGroup(gi)}><Trash2 size={12} /></button>
            )}
          </div>

          {/* Matrix */}
          <div style={{ overflowX: 'auto', padding: '0 16px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 130, textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Colour / Wash</th>
                  {g.sizes.map(sz => <th key={sz} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '6px 8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{sz}</th>)}
                  <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-light)', padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {g.colors.map((c, ci) => {
                  const colorKey = c.id || `_${ci}`
                  const total = colorTotal(g, colorKey)
                  return (
                    <tr key={ci}>
                      <td style={{ padding: '4px 0 4px', borderBottom: '1px solid #f0f0ee' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            className="input" style={{ fontSize: 11 }}
                            value={c.color_name}
                            onChange={e => updateColor(gi, ci, e.target.value)}
                            placeholder="Colour name"
                          />
                          {g.colors.length > 1 && (
                            <button className="btn btn-ghost btn-sm" onClick={() => removeColor(gi, ci)}><Trash2 size={10} /></button>
                          )}
                        </div>
                      </td>
                      {g.sizes.map(sz => (
                        <td key={sz} style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', textAlign: 'center' }}>
                          <input
                            type="number"
                            className="input"
                            style={{ width: 64, textAlign: 'center', fontSize: 11 }}
                            value={g.breakdown[colorKey]?.[sz] || ''}
                            onChange={e => setQty(gi, colorKey, sz, e.target.value)}
                            placeholder="0"
                          />
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f0f0ee' }}>
                        {total > 0 ? total.toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr>
                  <td style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-mid)', paddingTop: 8 }}>TOTAL</td>
                  {g.sizes.map(sz => (
                    <td key={sz} style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, paddingTop: 8 }}>
                      {sizeTotal(g, sz) || '—'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, paddingTop: 8 }}>
                    {grandTotal(g).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => addColor(gi)}>
              <Plus size={12} /> Add Colour
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={addGroup}><Plus size={14} /> Add Size Group</button>
        <button className="btn btn-accent" onClick={handleSave} disabled={saving || !orderId}>
          {saving ? 'Saving...' : 'Save Matrix'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
