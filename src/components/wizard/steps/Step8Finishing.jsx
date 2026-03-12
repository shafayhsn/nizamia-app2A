import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, AlertTriangle } from 'lucide-react'

const PACK_TYPES = ['Solid Pack', 'By Color + Ratio', 'By Destination', 'By Brand-Label', 'Custom']
const HANG_FLAT  = ['Flat', 'Hanger', 'Folded']
const CHECKLIST_ITEMS = [
  'Thread Trimming', 'Final Pressing', 'Button / Rivet Check', 'Label Placement QC',
  'Measurement Check', 'Polybag + Hangtag', 'Carton Labelling', 'Final Count Verified',
]

export default function Step8Finishing({ orderId, orderData, onSaved, registerSave }) {
  const [enabled,   setEnabled]   = useState(false)
  const [tolerance, setTol]       = useState(5)
  const [configs,   setConfigs]   = useState([])
  const [carton,    setCarton]    = useState({ l: '', w: '', h: '', weight: '', pcs_per_ctn: '' })
  const [checklist, setChecklist] = useState({})
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  const totalOrderQty = orderData?.total_qty || 0

  useEffect(() => {
    if (!orderId) return
    supabase.from('finishing').select('*').eq('order_id', orderId).maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setEnabled(true)
        setTol(data.tolerance_pct || 5)
        setCarton({
          l:          data.carton_length_cm  || '',
          w:          data.carton_width_cm   || '',
          h:          data.carton_height_cm  || '',
          weight:     data.gross_weight_kg   || '',
          pcs_per_ctn: data.pcs_per_carton   || '',
        })
        const c = typeof data.configs   === 'string' ? JSON.parse(data.configs)   : (data.configs   || [])
        const k = typeof data.checklist === 'string' ? JSON.parse(data.checklist) : (data.checklist || {})
        setConfigs(c.map(x => ({ ...x, _tempId: x._tempId || Math.random().toString(36).slice(2) })))
        setChecklist(k)
      })
  }, [orderId])

  const addConfig = () => setConfigs(cs => [...cs, {
    _tempId: Math.random().toString(36).slice(2),
    pack_type: 'Solid Pack', color_names: '', sizes: 'All',
    ratio: '', hang_flat: 'Flat', polybag: true,
    pcs_per_ctn: '', cartons: '',
  }])

  const updConfig = (idx, k, v) => setConfigs(cs => { const n = [...cs]; n[idx] = { ...n[idx], [k]: v }; return n })

  // Computed totals — pure, no side effects
  const packedTotal = configs.reduce((s, c) => {
    const t = (parseInt(c.pcs_per_ctn) || 0) * (parseInt(c.cartons) || 0)
    return s + t
  }, 0)
  const diff     = packedTotal - totalOrderQty
  const pct      = totalOrderQty > 0 ? (Math.abs(diff) / totalOrderQty) * 100 : 0
  const withinTol = pct <= tolerance
  const hasQty   = totalOrderQty > 0 && configs.length > 0

  const cbm = (carton.l && carton.w && carton.h)
    ? ((parseFloat(carton.l) * parseFloat(carton.w) * parseFloat(carton.h)) / 1000000).toFixed(4)
    : null


  // Refs so doSave always has latest state without re-registering
  const configsRef = useRef(configs)
  const cartonRef = useRef(carton)
  const toleranceRef = useRef(tolerance)
  const checklistRef = useRef(checklist)
  const enabledRef = useRef(enabled)
  useEffect(() => { configsRef.current = configs }, [configs])
  useEffect(() => { cartonRef.current = carton }, [carton])
  useEffect(() => { toleranceRef.current = tolerance }, [tolerance])
  useEffect(() => { checklistRef.current = checklist }, [checklist])
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  const doSave = useCallback(async () => {
    if (!orderId) return
    const payload = {
      order_id:         orderId,
      packing_method:   configsRef.current[0]?.hang_flat || 'Flat',
      carton_type:      configsRef.current[0]?.pack_type || 'Solid Pack',
      pcs_per_carton:   parseInt(cartonRef.current.pcs_per_ctn) || null,
      carton_length_cm: parseFloat(cartonRef.current.l)      || null,
      carton_width_cm:  parseFloat(cartonRef.current.w)       || null,
      carton_height_cm: parseFloat(cartonRef.current.h)       || null,
      gross_weight_kg:  parseFloat(cartonRef.current.weight)  || null,
      tolerance_pct:    toleranceRef.current,
      configs:          configsRef.current,
      checklist:        checklistRef.current,
    }
    const { data: ex } = await supabase.from('finishing').select('id').eq('order_id', orderId).maybeSingle()
    if (ex) await supabase.from('finishing').update(payload).eq('order_id', orderId)
    else     await supabase.from('finishing').insert([payload])
    await supabase.from('orders').update({ step_finishing: enabledRef.current }).eq('id', orderId)
    onSaved(orderId, { step_finishing: enabledRef.current })
  }, [orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch {}
    setSaving(false)
  }

  const inp = { height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff' }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Finishing & Packing</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Configure packing configurations and carton details</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>Tolerance ±</span>
            <input style={{ ...inp, width: 48, textAlign: 'center' }} type="number" value={tolerance} onChange={e => setTol(parseInt(e.target.value) || 5)} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>%</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <div onClick={() => setEnabled(e => !e)} style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? '#0d0d0d' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
              <div style={{ position: 'absolute', top: 3, left: enabled ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? '#0d0d0d' : '#9ca3af' }}>{enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
      </div>

      {!enabled ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          Toggle to configure finishing and packing.
        </div>
      ) : (
        <>
          {/* Packing Configs */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Packing Configurations</div>
            {configs.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr>
                      {['Pack Type', 'Colours', 'Sizes', 'Ratio', 'Hang/Flat', 'Polybag', 'Pcs/Ctn', 'Cartons', 'Total Pcs', ''].map(h => (
                        <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 5px 8px', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((c, idx) => {
                      const tot = (parseInt(c.pcs_per_ctn) || 0) * (parseInt(c.cartons) || 0)
                      return (
                        <tr key={c._tempId || idx}>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 110 }}>
                            <select style={{ ...sel, width: '100%' }} value={c.pack_type || 'Solid Pack'} onChange={e => updConfig(idx, 'pack_type', e.target.value)}>
                              {PACK_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 110 }}>
                            <input style={{ ...inp, width: '100%' }} value={c.color_names || ''} onChange={e => updConfig(idx, 'color_names', e.target.value)} placeholder="All or specify" />
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 70 }}>
                            <input style={{ ...inp, width: '100%' }} value={c.sizes || ''} onChange={e => updConfig(idx, 'sizes', e.target.value)} placeholder="All" />
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', width: 90 }}>
                            <input style={{ ...inp, width: '100%' }} value={c.ratio || ''} onChange={e => updConfig(idx, 'ratio', e.target.value)} placeholder="1:2:2:1" />
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', width: 80 }}>
                            <select style={sel} value={c.hang_flat || 'Flat'} onChange={e => updConfig(idx, 'hang_flat', e.target.value)}>
                              {HANG_FLAT.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', textAlign: 'center', width: 55 }}>
                            <input type="checkbox" checked={!!c.polybag} onChange={e => updConfig(idx, 'polybag', e.target.checked)} style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', width: 70 }}>
                            <input style={{ ...inp, textAlign: 'right', width: '100%' }} type="number" value={c.pcs_per_ctn || ''} onChange={e => updConfig(idx, 'pcs_per_ctn', e.target.value)} placeholder="12" />
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', width: 70 }}>
                            <input style={{ ...inp, textAlign: 'right', width: '100%' }} type="number" value={c.cartons || ''} onChange={e => updConfig(idx, 'cartons', e.target.value)} />
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee', width: 80, textAlign: 'right', fontWeight: 700, fontSize: 12 }}>
                            {tot > 0 ? tot.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '3px 4px', borderBottom: '1px solid #f0f0ee' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setConfigs(cs => cs.filter((_, i) => i !== idx))}><Trash2 size={11} /></button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={addConfig}><Plus size={12} /> Add Config</button>

            {/* Tolerance bar — no side effects */}
            {hasQty && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 7, background: withinTol ? '#f0fdf4' : '#fef2f2', border: `1px solid ${withinTol ? '#bbf7d0' : '#fecaca'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                {!withinTol && <AlertTriangle size={14} color="#dc2626" />}
                <span style={{ fontSize: 12, fontWeight: 600, color: withinTol ? '#16a34a' : '#dc2626' }}>
                  {withinTol ? `Within ±${tolerance}% tolerance` : `Over packed — exceeds ±${tolerance}%`}
                </span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  {packedTotal.toLocaleString()} packed / {totalOrderQty.toLocaleString()} ordered
                  {diff !== 0 && ` (${diff > 0 ? '+' : ''}${diff.toLocaleString()} pcs, ${pct.toFixed(1)}%)`}
                </span>
              </div>
            )}
          </div>

          {/* Carton details */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Carton Dimensions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {[['L (cm)', 'l'], ['W (cm)', 'w'], ['H (cm)', 'h'], ['Gross kg', 'weight'], ['Pcs/Ctn', 'pcs_per_ctn']].map(([label, key]) => (
                <div key={key}>
                  <label style={lbl}>{label}</label>
                  <input style={{ ...inp, width: '100%' }} type="number" value={carton[key] || ''} onChange={e => setCarton(c => ({ ...c, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            {cbm && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
                CBM per carton: <strong>{cbm} m³</strong>
                {carton.pcs_per_ctn && <span style={{ marginLeft: 12 }}>Total CBM: <strong>{(parseFloat(cbm) * (parseInt(carton.pcs_per_ctn) || 1)).toFixed(4)} m³</strong></span>}
              </div>
            )}
          </div>

          {/* Finishing checklist */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Finishing Checklist</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {CHECKLIST_ITEMS.map(item => (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 5, background: checklist[item] ? '#f0fdf4' : '#fafal8', border: `1px solid ${checklist[item] ? '#bbf7d0' : '#f0f0ee'}`, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={!!checklist[item]} onChange={e => setChecklist(c => ({ ...c, [item]: e.target.checked }))} style={{ cursor: 'pointer' }} />
                  <span style={{ fontSize: 11, fontWeight: checklist[item] ? 600 : 400, color: checklist[item] ? '#15803d' : '#374151' }}>{item}</span>
                </label>
              ))}
            </div>
          </div>


        </>
      )}
    </div>
  )
}
