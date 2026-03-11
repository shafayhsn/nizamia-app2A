import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check } from 'lucide-react'

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL']
const ALL_SIZES = ['XXS','XS','S','M','L','XL','XXL','3XL','4XL','5XL','6XL','7XL','8XL','28','30','32','34','36','38','40','42','44','0','2','4','6','8','10','12','14','16','18','20']

function newGroup(n) {
  return {
    _tempId: Math.random().toString(36).slice(2),
    group_name: `Group ${n}`, unit_price: '', currency: 'USD',
    sizes: [...DEFAULT_SIZES], base_size: 'M',
    colors: [{ _tempId: Math.random().toString(36).slice(2), color_name: '' }],
    breakdown: {},
  }
}

export default function Step2POMatrix({ orderId, orderData, onSaved, registerSave }) {
  const [groups, setGroups] = useState([newGroup(1)])
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [showSizesMgr, setShowSizesMgr] = useState(null) // group index

  useEffect(() => { if (orderId) loadGroups() }, [orderId])

  async function loadGroups() {
    const { data: sg } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    if (!sg?.length) return
    const loaded = await Promise.all(sg.map(async g => {
      const { data: colors } = await supabase.from('size_group_colors').select('*').eq('size_group_id', g.id).order('sort_order')
      const { data: bd }     = await supabase.from('size_group_breakdown').select('*').eq('size_group_id', g.id)
      const breakdown = {}
      bd?.forEach(b => {
        if (!breakdown[b.color_id]) breakdown[b.color_id] = {}
        breakdown[b.color_id][b.size] = b.qty
      })
      return {
        ...g, _tempId: g.id,
        colors: (colors || []).map(c => ({ ...c, _tempId: c.id })),
        breakdown,
      }
    }))
    setGroups(loaded)
  }


  // Refs so doSave always has latest state without re-registering
  const groupsRef = useRef(groups)
  useEffect(() => { groupsRef.current = groups }, [groups])

  const doSave = useCallback(async () => {
    if (!orderId) throw new Error('No order ID')
    await supabase.from('size_groups').delete().eq('order_id', orderId)
    for (let gi = 0; gi < groupsRef.current.length; gi++) {
      const g = groupsRef.current[gi]
      const { data: sg } = await supabase.from('size_groups').insert([{
        order_id: orderId, group_name: g.group_name,
        unit_price: parseFloat(g.unit_price) || null,
        currency: g.currency, sizes: g.sizes,
        base_size: g.base_size || null, sort_order: gi,
      }]).select().single()
      if (!sg) continue
      for (let ci = 0; ci < g.colors.length; ci++) {
        const c = g.colors[ci]
        if (!c.color_name?.trim()) continue
        const { data: sc } = await supabase.from('size_group_colors').insert([{
          size_group_id: sg.id, color_name: c.color_name, sort_order: ci,
        }]).select().single()
        if (!sc) continue
        const bRows = g.sizes.map(sz => ({
          size_group_id: sg.id, color_id: sc.id, size: sz,
          qty: parseInt(g.breakdown[c._tempId]?.[sz]) || 0,
        })).filter(r => r.qty > 0)
        if (bRows.length) await supabase.from('size_group_breakdown').insert(bRows)
      }
    }
    await supabase.from('orders').update({ step_po_matrix: true }).eq('id', orderId)
    onSaved(orderId, { step_po_matrix: true })
  }, [groups, orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch {}
    setSaving(false)
  }

  // Helpers
  const updGroup = (gi, k, v) => setGroups(gs => { const n=[...gs]; n[gi]={...n[gi],[k]:v}; return n })

  const colorKey = (c) => c.id || c._tempId

  const setQty = (gi, ck, sz, val) => setGroups(gs => {
    const n = gs.map((g,i) => {
      if (i !== gi) return g
      const bd = { ...g.breakdown }
      if (!bd[ck]) bd[ck] = {}
      bd[ck] = { ...bd[ck], [sz]: parseInt(val) || 0 }
      return { ...g, breakdown: bd }
    })
    return n
  })

  const colorTotal = (g, ck) => g.sizes.reduce((s,sz) => s + (parseInt(g.breakdown[ck]?.[sz])||0), 0)
  const sizeTotal  = (g, sz) => g.colors.reduce((s,c)  => s + (parseInt(g.breakdown[colorKey(c)]?.[sz])||0), 0)
  const grandTotal = (g) => g.colors.reduce((s,c) => s + colorTotal(g, colorKey(c)), 0)
  const groupValue = (g) => grandTotal(g) * (parseFloat(g.unit_price) || 0)

  const inp  = { width:'100%', height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fff' }
  const sel  = { ...inp, cursor:'pointer' }
  const lbl  = { fontSize:11, fontWeight:500, color:'#6b7280', display:'block', marginBottom:4 }
  const cell = { padding:'4px 4px', borderBottom:'1px solid #f0f0ee', textAlign:'center' }

  return (
    <div>
      {groups.map((g, gi) => (
        <div key={g._tempId || gi} style={{ background:'#fff', border:'1px solid #e8e8e6', borderRadius:10, marginBottom:20, overflow:'hidden' }}>

          {/* Group header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f0f0ee', display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap', background:'#fafaf8' }}>
            <div style={{ minWidth:130 }}>
              <label style={lbl}>Group Name</label>
              <input style={inp} value={g.group_name}
                onChange={e => updGroup(gi,'group_name',e.target.value)} />
            </div>
            <div style={{ minWidth:100 }}>
              <label style={lbl}>Unit Price</label>
              <input style={inp} type="number" step="0.01" value={g.unit_price}
                onChange={e => updGroup(gi,'unit_price',e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ minWidth:80 }}>
              <label style={lbl}>Currency</label>
              <select style={sel} value={g.currency} onChange={e => updGroup(gi,'currency',e.target.value)}>
                {['USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ minWidth:90 }}>
              <label style={lbl}>Base Size</label>
              <select style={sel} value={g.base_size || ''} onChange={e => updGroup(gi,'base_size',e.target.value)}>
                <option value="">—</option>
                {g.sizes.map(sz => <option key={sz}>{sz}</option>)}
              </select>
            </div>
            {/* Sizes display + manage */}
            <div style={{ flex:1, minWidth:160 }}>
              <label style={lbl}>Sizes</label>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                {g.sizes.map(sz => (
                  <span key={sz} style={{
                    fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4,
                    background: sz === g.base_size ? '#1a1a2e' : '#f0f0ee',
                    color: sz === g.base_size ? '#fff' : '#374151',
                  }}>
                    {sz}{sz === g.base_size ? ' ★' : ''}
                  </span>
                ))}
                <button onClick={() => setShowSizesMgr(gi)} style={{
                  fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:4,
                  background:'#eff6ff', color:'#2563eb', border:'none', cursor:'pointer',
                }}>Manage Sizes</button>
              </div>
            </div>
            {groups.length > 1 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setGroups(gs => gs.filter((_,i)=>i!==gi))}>
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Matrix */}
          <div style={{ overflowX:'auto', padding:'0 16px 16px' }}>
            <table style={{ borderCollapse:'collapse', marginTop:12, minWidth:500 }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left', fontSize:10, fontWeight:600, color:'#9ca3af', padding:'6px 8px 6px 0', textTransform:'uppercase', letterSpacing:'0.8px', minWidth:140 }}>Colour / Wash</th>
                  {g.sizes.map(sz => (
                    <th key={sz} style={{ textAlign:'center', fontSize:10, fontWeight:600, padding:'6px 4px', textTransform:'uppercase', letterSpacing:'0.5px',
                      color: sz === g.base_size ? '#1a1a2e' : '#9ca3af', minWidth:60 }}>
                      {sz}{sz === g.base_size ? ' ★' : ''}
                    </th>
                  ))}
                  <th style={{ textAlign:'right', fontSize:10, fontWeight:600, color:'#9ca3af', padding:'6px 0 6px 8px', textTransform:'uppercase', minWidth:60 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {g.colors.map((c, ci) => {
                  const ck = colorKey(c)
                  const tot = colorTotal(g, ck)
                  return (
                    <tr key={ck}>
                      <td style={{ padding:'4px 0', borderBottom:'1px solid #f0f0ee' }}>
                        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                          <input style={{ ...inp, fontSize:11 }} value={c.color_name}
                            onChange={e => setGroups(gs => {
                              const n=[...gs]; n[gi].colors[ci]={...n[gi].colors[ci],color_name:e.target.value}; return n
                            })}
                            placeholder="Colour / wash name" />
                          {g.colors.length > 1 && (
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => setGroups(gs => { const n=[...gs]; n[gi].colors=n[gi].colors.filter((_,i)=>i!==ci); return n })}>
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </td>
                      {g.sizes.map(sz => (
                        <td key={sz} style={cell}>
                          <input type="number" style={{ ...inp, width:58, textAlign:'center', fontSize:11, padding:'0 4px',
                            background: sz === g.base_size ? '#fafaf8' : '#fff' }}
                            value={g.breakdown[ck]?.[sz] || ''}
                            onChange={e => setQty(gi, ck, sz, e.target.value)}
                            placeholder="0" />
                        </td>
                      ))}
                      <td style={{ textAlign:'right', fontWeight:700, fontSize:12, padding:'4px 0 4px 8px', borderBottom:'1px solid #f0f0ee' }}>
                        {tot > 0 ? tot.toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr style={{ background:'#fafaf8' }}>
                  <td style={{ fontSize:10, fontWeight:700, color:'#6b7280', padding:'8px 0' }}>TOTAL</td>
                  {g.sizes.map(sz => (
                    <td key={sz} style={{ textAlign:'center', fontWeight:700, fontSize:11, padding:'8px 4px' }}>
                      {sizeTotal(g,sz) || '—'}
                    </td>
                  ))}
                  <td style={{ textAlign:'right', fontWeight:800, fontSize:13, padding:'8px 0 8px 8px' }}>
                    {grandTotal(g).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10, flexWrap:'wrap' }}>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setGroups(gs => { const n=[...gs]; n[gi].colors=[...n[gi].colors,{_tempId:Math.random().toString(36).slice(2),color_name:''}]; return n })}>
                <Plus size={12} /> Add Colour
              </button>
              {/* Group value + total */}
              <div style={{ marginLeft:'auto', display:'flex', gap:16, alignItems:'center' }}>
                {grandTotal(g) > 0 && (
                  <span style={{ fontSize:12, color:'#6b7280' }}>
                    {grandTotal(g).toLocaleString()} pcs
                    {g.unit_price && (
                      <span style={{ fontWeight:700, color:'#1a1a2e', marginLeft:8 }}>
                        {g.currency} {groupValue(g).toLocaleString(undefined,{maximumFractionDigits:0})}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Grand total bar */}
      {groups.length > 1 && (
        <div style={{ background:'#1a1a2e', borderRadius:8, padding:'10px 16px', marginBottom:16, display:'flex', gap:24 }}>
          <div>
            <div style={{ fontSize:9, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px' }}>Total Qty</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>
              {groups.reduce((s,g)=>s+grandTotal(g),0).toLocaleString()} pcs
            </div>
          </div>
          <div>
            <div style={{ fontSize:9, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px' }}>Order Value</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>
              {groups.reduce((s,g)=>s+groupValue(g),0).toLocaleString(undefined,{maximumFractionDigits:0})} USD
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        <button className="btn btn-secondary" onClick={() => setGroups(gs => [...gs, newGroup(gs.length+1)])}>
          <Plus size={14} /> Add Size Group
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !orderId}>
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Matrix'}
        </button>
        {saved && <span style={{ fontSize:12, color:'#16a34a', display:'flex', alignItems:'center', gap:4 }}><Check size={13}/> Saved</span>}
      </div>

      {/* Manage Sizes Modal */}
      {showSizesMgr !== null && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:10, padding:24, minWidth:360, boxShadow:'0 16px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>
              Manage Sizes — {groups[showSizesMgr]?.group_name}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
              {ALL_SIZES.map(sz => {
                const on = groups[showSizesMgr]?.sizes.includes(sz)
                return (
                  <button key={sz} onClick={() => {
                    setGroups(gs => {
                      const n=[...gs]
                      const cur = n[showSizesMgr].sizes
                      n[showSizesMgr] = { ...n[showSizesMgr], sizes: on ? cur.filter(s=>s!==sz) : [...cur,sz] }
                      return n
                    })
                  }} style={{
                    padding:'4px 10px', borderRadius:5, fontSize:11, fontWeight:600,
                    background: on ? '#1a1a2e' : '#f3f4f6',
                    color: on ? '#fff' : '#374151',
                    border:'none', cursor:'pointer',
                  }}>{sz}</button>
                )
              })}
            </div>
            <button className="btn btn-primary" onClick={() => setShowSizesMgr(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
