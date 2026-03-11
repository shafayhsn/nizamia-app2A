import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, X, Star } from 'lucide-react'

const PRESET_SIZES = {
  'Tops': ['XXS','XS','S','M','L','XL','XXL','3XL'],
  'Bottoms (numeric)': ['28','30','32','34','36','38','40','42','44'],
  'Bottoms (alpha)': ['XS','S','M','L','XL','XXL'],
  'Kids': ['2Y','4Y','6Y','8Y','10Y','12Y','14Y'],
  'US Women': ['0','2','4','6','8','10','12','14','16'],
  'EU Shoes': ['36','37','38','39','40','41','42','43','44','45'],
}

function tempId() { return Math.random().toString(36).slice(2) }

function newGroup(n) {
  return {
    _tempId: tempId(),
    group_name: `Group ${n}`, unit_price: '', currency: 'USD',
    sizes: ['XS','S','M','L','XL'], base_size: 'M',
    colors: [{ _tempId: tempId(), color_name: '' }],
    breakdown: {},
  }
}

export default function Step2POMatrix({ orderId, orderData, onSaved, registerSave }) {
  const [groups, setGroups]       = useState([newGroup(1)])
  const [saving, setSaving]       = useState(false)
  const [saved,  setSaved]        = useState(false)
  const [sizesMgr, setSizesMgr]   = useState(null) // group index or null
  const [customSize, setCustomSize] = useState('')

  const groupsRef = useRef(groups)
  useEffect(() => { groupsRef.current = groups }, [groups])

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
      return { ...g, _tempId: g.id, colors: (colors||[]).map(c=>({...c,_tempId:c.id})), breakdown }
    }))
    setGroups(loaded)
  }

  const doSave = useCallback(async () => {
    if (!orderId) throw new Error('No order ID')
    const gs = groupsRef.current
    await supabase.from('size_groups').delete().eq('order_id', orderId)
    for (let gi = 0; gi < gs.length; gi++) {
      const g = gs[gi]
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
  }, [orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch(e) { console.error(e) }
    setSaving(false)
  }

  const updGroup = (gi, k, v) => setGroups(gs => gs.map((g,i) => i===gi ? {...g,[k]:v} : g))
  const ck = (c) => c.id || c._tempId

  const setQty = (gi, colorKey, sz, val) => setGroups(gs => gs.map((g,i) => {
    if (i !== gi) return g
    const bd = { ...g.breakdown, [colorKey]: { ...g.breakdown[colorKey], [sz]: parseInt(val)||0 } }
    return { ...g, breakdown: bd }
  }))

  const colorTotal = (g, colorKey) => g.sizes.reduce((s,sz) => s + (parseInt(g.breakdown[colorKey]?.[sz])||0), 0)
  const sizeTotal  = (g, sz) => g.colors.reduce((s,c) => s + (parseInt(g.breakdown[ck(c)]?.[sz])||0), 0)
  const grandTotal = (g) => g.colors.reduce((s,c) => s + colorTotal(g, ck(c)), 0)
  const groupValue = (g) => grandTotal(g) * (parseFloat(g.unit_price)||0)

  // Manage sizes helpers
  const toggleSize = (gi, sz) => setGroups(gs => gs.map((g,i) => {
    if (i !== gi) return g
    const has = g.sizes.includes(sz)
    const sizes = has ? g.sizes.filter(s=>s!==sz) : [...g.sizes, sz]
    const base_size = has && g.base_size === sz ? (sizes[0]||null) : g.base_size
    return { ...g, sizes, base_size }
  }))

  const addCustomSize = (gi) => {
    const s = customSize.trim()
    if (!s) return
    setGroups(gs => gs.map((g,i) => {
      if (i !== gi || g.sizes.includes(s)) return g
      return { ...g, sizes: [...g.sizes, s] }
    }))
    setCustomSize('')
  }

  const inp  = { width:'100%', height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none', background:'#fff', boxSizing:'border-box' }
  const sel  = { ...inp, cursor:'pointer', appearance:'none' }
  const lbl  = { fontSize:11, fontWeight:500, color:'#6b7280', display:'block', marginBottom:4 }
  const cell = { padding:'4px 4px', borderBottom:'1px solid #f0f0ee', textAlign:'center' }

  return (
    <div>
      {groups.map((g, gi) => (
        <div key={g._tempId||gi} style={{ background:'#fff', border:'1px solid #e8e8e6', borderRadius:10, marginBottom:20, overflow:'hidden' }}>

          {/* Group header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f0f0ee', display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap', background:'#fafaf8' }}>
            <div style={{ minWidth:130 }}>
              <label style={lbl}>Group Name</label>
              <input style={inp} value={g.group_name} onChange={e => updGroup(gi,'group_name',e.target.value)} />
            </div>
            <div style={{ minWidth:100 }}>
              <label style={lbl}>Unit Price</label>
              <input style={inp} type="number" step="0.01" value={g.unit_price} onChange={e => updGroup(gi,'unit_price',e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ minWidth:80 }}>
              <label style={lbl}>Currency</label>
              <select style={sel} value={g.currency} onChange={e => updGroup(gi,'currency',e.target.value)}>
                {['USD','EUR','GBP'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ minWidth:90 }}>
              <label style={lbl}>Base Size ★</label>
              <select style={sel} value={g.base_size||''} onChange={e => updGroup(gi,'base_size',e.target.value)}>
                <option value="">—</option>
                {g.sizes.map(sz=><option key={sz}>{sz}</option>)}
              </select>
            </div>
            <div style={{ flex:1, minWidth:160 }}>
              <label style={lbl}>Sizes</label>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                {g.sizes.map(sz=>(
                  <span key={sz} style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, background: sz===g.base_size ? '#1a1a2e' : '#f0f0ee', color: sz===g.base_size ? '#fff' : '#374151' }}>
                    {sz}{sz===g.base_size?' ★':''}
                  </span>
                ))}
                <button onClick={() => setSizesMgr(gi)} style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:4, background:'#eff6ff', color:'#2563eb', border:'none', cursor:'pointer' }}>
                  Manage Sizes
                </button>
              </div>
            </div>
            {groups.length > 1 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setGroups(gs=>gs.filter((_,i)=>i!==gi))}>
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Matrix */}
          <div style={{ overflowX:'auto', padding:'0 16px 16px' }}>
            <table style={{ borderCollapse:'collapse', marginTop:12, minWidth:500 }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left', fontSize:10, fontWeight:600, color:'#9ca3af', padding:'6px 8px 6px 0', textTransform:'uppercase', letterSpacing:'0.8px', minWidth:160 }}>Colour / Wash</th>
                  {g.sizes.map(sz=>(
                    <th key={sz} style={{ textAlign:'center', fontSize:10, fontWeight:600, padding:'6px 4px', textTransform:'uppercase', letterSpacing:'0.5px', color: sz===g.base_size ? '#1a1a2e' : '#9ca3af', minWidth:58 }}>
                      {sz}{sz===g.base_size?' ★':''}
                    </th>
                  ))}
                  <th style={{ textAlign:'right', fontSize:10, fontWeight:600, color:'#9ca3af', padding:'6px 0 6px 8px', textTransform:'uppercase', minWidth:60 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {g.colors.map((c, ci) => {
                  const colorKey = ck(c)
                  const tot = colorTotal(g, colorKey)
                  return (
                    <tr key={colorKey}>
                      <td style={{ padding:'4px 0', borderBottom:'1px solid #f0f0ee' }}>
                        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                          <input style={{ ...inp, fontSize:11 }} value={c.color_name}
                            onChange={e => setGroups(gs => gs.map((grp,i) => {
                              if (i!==gi) return grp
                              const colors = [...grp.colors]
                              colors[ci] = { ...colors[ci], color_name: e.target.value }
                              return { ...grp, colors }
                            }))}
                            placeholder="Colour / wash name" />
                          {g.colors.length > 1 && (
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => setGroups(gs => gs.map((grp,i) => i!==gi ? grp : { ...grp, colors: grp.colors.filter((_,j)=>j!==ci) }))}>
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </td>
                      {g.sizes.map(sz=>(
                        <td key={sz} style={cell}>
                          <input type="number" style={{ ...inp, width:54, textAlign:'center', fontSize:11, padding:'0 4px', background: sz===g.base_size ? '#fafaf8' : '#fff' }}
                            value={g.breakdown[colorKey]?.[sz] || ''}
                            onChange={e => setQty(gi, colorKey, sz, e.target.value)}
                            placeholder="0" />
                        </td>
                      ))}
                      <td style={{ textAlign:'right', fontWeight:700, fontSize:12, padding:'4px 0 4px 8px', borderBottom:'1px solid #f0f0ee' }}>
                        {tot > 0 ? tot.toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ background:'#fafaf8' }}>
                  <td style={{ fontSize:10, fontWeight:700, color:'#6b7280', padding:'8px 0' }}>TOTAL</td>
                  {g.sizes.map(sz=>(
                    <td key={sz} style={{ textAlign:'center', fontWeight:700, fontSize:11, padding:'8px 4px' }}>
                      {sizeTotal(g,sz)||'—'}
                    </td>
                  ))}
                  <td style={{ textAlign:'right', fontWeight:800, fontSize:13, padding:'8px 0 8px 8px' }}>
                    {grandTotal(g).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:10 }}>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setGroups(gs=>gs.map((grp,i)=>i!==gi ? grp : {...grp, colors:[...grp.colors,{_tempId:tempId(),color_name:''}]}))}>
                <Plus size={12}/> Add Colour
              </button>
              <div style={{ marginLeft:'auto', display:'flex', gap:16, alignItems:'center' }}>
                {grandTotal(g) > 0 && (
                  <span style={{ fontSize:12, color:'#6b7280' }}>
                    {grandTotal(g).toLocaleString()} pcs
                    {g.unit_price && <span style={{ fontWeight:700, color:'#1a1a2e', marginLeft:8 }}>{g.currency} {groupValue(g).toLocaleString(undefined,{maximumFractionDigits:0})}</span>}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {groups.length > 1 && (
        <div style={{ background:'#1a1a2e', borderRadius:8, padding:'10px 16px', marginBottom:16, display:'flex', gap:24 }}>
          <div><div style={{ fontSize:9, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px' }}>Total Qty</div><div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{groups.reduce((s,g)=>s+grandTotal(g),0).toLocaleString()} pcs</div></div>
          <div><div style={{ fontSize:9, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px' }}>Order Value</div><div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{groups.reduce((s,g)=>s+groupValue(g),0).toLocaleString(undefined,{maximumFractionDigits:0})} USD</div></div>
        </div>
      )}

      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        <button className="btn btn-secondary" onClick={() => setGroups(gs=>[...gs,newGroup(gs.length+1)])}><Plus size={14}/> Add Size Group</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving||!orderId}>{saving ? 'Saving...' : 'Save Matrix'}</button>
        {saved && <span style={{ fontSize:12, color:'#16a34a', display:'flex', alignItems:'center', gap:4 }}><Check size={13}/> Saved</span>}
      </div>

      {/* ── Manage Sizes Modal ── */}
      {sizesMgr !== null && groups[sizesMgr] && (() => {
        const g = groups[sizesMgr]
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background:'#fff', borderRadius:12, width:520, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(0,0,0,0.2)' }}>

              {/* Header */}
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #f0f0ee', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>Manage Sizes</div>
                  <div style={{ fontSize:11, color:'#9ca3af', marginTop:1 }}>{g.group_name} · {g.sizes.length} size{g.sizes.length!==1?'s':''} selected</div>
                </div>
                <button onClick={() => setSizesMgr(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', display:'flex' }}><X size={16}/></button>
              </div>

              <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>

                {/* Selected sizes with base size picker */}
                {g.sizes.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>Selected · click ★ to set base size</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                      {g.sizes.map(sz => (
                        <div key={sz} style={{ display:'flex', alignItems:'center', gap:0, background: sz===g.base_size ? '#1a1a2e' : '#f0f0ee', borderRadius:6, overflow:'hidden' }}>
                          <button onClick={() => updGroup(sizesMgr,'base_size',sz)} style={{ padding:'4px 6px', background:'none', border:'none', cursor:'pointer', color: sz===g.base_size ? '#fbbf24' : '#9ca3af', display:'flex' }}>
                            <Star size={10} fill={sz===g.base_size ? '#fbbf24' : 'none'}/>
                          </button>
                          <span style={{ fontSize:11, fontWeight:700, color: sz===g.base_size ? '#fff' : '#374151', paddingRight:6 }}>{sz}</span>
                          <button onClick={() => toggleSize(sizesMgr,sz)} style={{ padding:'4px 5px', background:'none', border:'none', cursor:'pointer', color: sz===g.base_size ? 'rgba(255,255,255,0.6)' : '#9ca3af', display:'flex' }}>
                            <X size={9}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preset size groups */}
                {Object.entries(PRESET_SIZES).map(([label, sizes]) => (
                  <div key={label} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:6, display:'flex', alignItems:'center', gap:8 }}>
                      {label}
                      <button onClick={() => setGroups(gs => gs.map((grp,i) => {
                        if (i!==sizesMgr) return grp
                        const merged = [...new Set([...grp.sizes, ...sizes])]
                        return { ...grp, sizes: merged }
                      }))} style={{ fontSize:9, padding:'1px 6px', borderRadius:3, background:'#f0f0ee', border:'none', cursor:'pointer', color:'#6b7280', textTransform:'none', letterSpacing:0, fontWeight:500 }}>
                        Add all
                      </button>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                      {sizes.map(sz => {
                        const on = g.sizes.includes(sz)
                        return (
                          <button key={sz} onClick={() => toggleSize(sizesMgr,sz)} style={{ padding:'4px 10px', borderRadius:5, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: on ? '#1a1a2e' : '#f3f4f6', color: on ? '#fff' : '#374151', transition:'all 0.1s' }}>
                            {sz}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Custom size input */}
                <div style={{ borderTop:'1px solid #f0f0ee', paddingTop:14, marginTop:4 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>Add Custom Size</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <input
                      style={{ flex:1, height:32, padding:'0 10px', border:'1px solid #e5e7eb', borderRadius:6, fontSize:12, fontFamily:'Inter,sans-serif', outline:'none' }}
                      placeholder="e.g. 3XL, 44/46, One Size..."
                      value={customSize}
                      onChange={e => setCustomSize(e.target.value)}
                      onKeyDown={e => e.key==='Enter' && addCustomSize(sizesMgr)}
                    />
                    <button className="btn btn-secondary" onClick={() => addCustomSize(sizesMgr)}><Plus size={14}/> Add</button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding:'12px 20px', borderTop:'1px solid #f0f0ee', display:'flex', justifyContent:'flex-end' }}>
                <button className="btn btn-primary" onClick={() => setSizesMgr(null)}>Done</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
