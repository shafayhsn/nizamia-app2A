import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, AlertTriangle, X, Settings2 } from 'lucide-react'

const PACK_TYPES = ['By Colour', 'By Ratio', 'By Destination', 'By Store', 'By Brand Label', 'By Artwork', 'Custom']
const HANG_FLAT  = ['Flat Packed', 'Hanger', 'Folded']

function tempId() { return Math.random().toString(36).slice(2) }

// ── Pack Config Modal ─────────────────────────────────────────────────────────
function PackConfigModal({ pack, packIdx, poData, useCuttingQty, orderQty, cuttingQty, onClose, onSave }) {
  const [config, setConfig] = useState(pack.config || {})
  const totalQty = useCuttingQty ? cuttingQty : orderQty
  const packType = pack.pack_type

  const updConfig = (k, v) => setConfig(c => ({ ...c, [k]: v }))

  const renderByColour = () => (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Assign quantity per colour for this pack.</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>Colour</th>
          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Qty</th>
        </tr></thead>
        <tbody>
          {poData.colors.map(c => (
            <tr key={c.name}>
              <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12 }}>{c.name}</td>
              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 100 }}>
                <input type="number" style={{ width: '100%', height: 28, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, textAlign: 'right', fontFamily: 'Inter,sans-serif', outline: 'none' }}
                  value={config[c.name] || ''}
                  onChange={e => updConfig(c.name, parseInt(e.target.value)||0)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
        Assigned: <strong>{Object.values(config).reduce((s,v)=>s+(parseInt(v)||0),0).toLocaleString()}</strong> / {totalQty.toLocaleString()} pcs
      </div>
    </div>
  )

  const renderByRatio = () => (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Set ratio per size. System distributes the total accordingly.</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>Size</th>
          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Ratio</th>
        </tr></thead>
        <tbody>
          {poData.allSizes.map(s => (
            <tr key={s.size}>
              <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12 }}>{s.size}</td>
              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 100 }}>
                <input type="number" style={{ width: '100%', height: 28, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, textAlign: 'right', fontFamily: 'Inter,sans-serif', outline: 'none' }}
                  value={config[s.size] || ''}
                  onChange={e => updConfig(s.size, parseInt(e.target.value)||0)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const renderLabel = (label) => (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>Enter the {label} name and quantity for this pack.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>{label}</label>
          <input style={{ width: '100%', height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none' }}
            value={config.label || ''} onChange={e => updConfig('label', e.target.value)} placeholder={`e.g. ${label} name`} />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Qty</label>
          <input type="number" style={{ width: '100%', height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, textAlign: 'right', fontFamily: 'Inter,sans-serif', outline: 'none' }}
            value={config.qty || ''} onChange={e => updConfig('qty', parseInt(e.target.value)||0)} />
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Configure Pack — {packType}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{pack.pack_name || 'Pack'} · Total: {totalQty.toLocaleString()} pcs</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {packType === 'By Colour'      && renderByColour()}
          {packType === 'By Ratio'       && renderByRatio()}
          {packType === 'By Destination' && renderLabel('Destination')}
          {packType === 'By Store'       && renderLabel('Store')}
          {packType === 'By Brand Label' && renderLabel('Brand Label')}
          {packType === 'By Artwork'     && renderLabel('Artwork')}
          {packType === 'Custom'         && renderLabel('Description')}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { onSave(packIdx, config); onClose() }}>Save Config</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Step8 ────────────────────────────────────────────────────────────────
export default function Step8Finishing({ orderId, orderData, onSaved, registerSave }) {
  const [enabled,       setEnabled]       = useState(false)
  const [useCuttingQty, setUseCuttingQty] = useState(false)
  const [packs,         setPacks]         = useState([])
  const [configModal,   setConfigModal]   = useState(null) // { packIdx }
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [poData,        setPoData]        = useState({ colors: [], allSizes: [] })
  const [finishingId,   setFinishingId]   = useState(null)

  const orderQty   = orderData?.total_qty || 0
  const excessPct  = parseFloat(orderData?.excess_cutting_pct) || 0
  const cuttingQty = Math.ceil(orderQty * (1 + excessPct / 100))
  const activeQty  = useCuttingQty ? cuttingQty : orderQty

  const enabledRef       = useRef(enabled)
  const useCuttingQtyRef = useRef(useCuttingQty)
  const packsRef         = useRef(packs)
  const finishingIdRef   = useRef(finishingId)
  useEffect(() => { enabledRef.current       = enabled       }, [enabled])
  useEffect(() => { useCuttingQtyRef.current = useCuttingQty }, [useCuttingQty])
  useEffect(() => { packsRef.current         = packs         }, [packs])
  useEffect(() => { finishingIdRef.current   = finishingId   }, [finishingId])

  useEffect(() => {
    if (!orderId) return
    loadAll()
    loadPoData()
  }, [orderId])

  async function loadAll() {
    const { data: fin } = await supabase.from('finishing').select('*').eq('order_id', orderId).maybeSingle()
    if (fin) {
      setEnabled(true)
      setUseCuttingQty(!!fin.use_cutting_qty)
      setFinishingId(fin.id)
      const { data: fp } = await supabase.from('finishing_packs').select('*').eq('finishing_id', fin.id).order('sort_order')
      setPacks((fp || []).map(p => ({ ...p, _tempId: p.id })))
    }
  }

  async function loadPoData() {
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    if (!sgs?.length) return
    const { data: colors } = await supabase.from('size_group_colors').select('*').in('size_group_id', sgs.map(g => g.id))
    const { data: bd }     = await supabase.from('size_group_breakdown').select('*').in('size_group_id', sgs.map(g => g.id))
    const colorMap = {}
    colors?.forEach(c => { colorMap[c.id] = { name: c.color_name, qty: 0 } })
    bd?.forEach(b => { if (colorMap[b.color_id]) colorMap[b.color_id].qty += b.qty||0 })
    const sizeQtyMap = {}
    bd?.forEach(b => { sizeQtyMap[b.size] = (sizeQtyMap[b.size]||0)+(b.qty||0) })
    const seenSizes = []
    sgs.forEach(g => (g.sizes||[]).forEach(sz => { if (!seenSizes.includes(sz)) seenSizes.push(sz) }))
    setPoData({
      colors: Object.values(colorMap),
      allSizes: seenSizes.map(sz => ({ size: sz, qty: sizeQtyMap[sz]||0 })),
    })
  }

  const addPack = () => setPacks(ps => [...ps, {
    _new: true, _tempId: tempId(), pack_name: '', pack_type: 'By Colour',
    config: {}, carton_l: '', carton_w: '', carton_h: '',
    carton_weight_kg: '', units_per_carton: '', qty_assigned: '',
    hang_flat: 'Flat Packed', polybag: true, sort_order: ps.length,
  }])

  const updPack = (idx, k, v) => setPacks(ps => ps.map((p,i) => i===idx ? {...p,[k]:v} : p))
  const updPackConfig = (idx, config) => setPacks(ps => ps.map((p,i) => i===idx ? {...p, config} : p))

  // Qty assigned per pack: sum config values if By Colour, or qty_assigned field
  const packQty = (pack) => {
    if (pack.pack_type === 'By Colour') return Object.values(pack.config||{}).reduce((s,v)=>s+(parseInt(v)||0),0)
    if (pack.pack_type === 'By Ratio') return parseInt(pack.qty_assigned)||0
    return parseInt(pack.config?.qty || pack.qty_assigned) || 0
  }

  const totalAssigned = packs.reduce((s,p) => s+packQty(p), 0)
  const balance = activeQty - totalAssigned
  const fullyAssigned = activeQty > 0 && balance === 0

  const cbmForPack = (pack) => {
    const l=parseFloat(pack.carton_l), w=parseFloat(pack.carton_w), h=parseFloat(pack.carton_h)
    if (!l||!w||!h) return null
    return ((l*w*h)/1000000).toFixed(4)
  }

  const totalCartons = (pack) => {
    const upc=parseInt(pack.units_per_carton)||0
    const qty=packQty(pack)
    if (!upc||!qty) return null
    return Math.ceil(qty/upc)
  }

  const doSave = useCallback(async () => {
    if (!orderId) return
    let fid = finishingIdRef.current
    const payload = { order_id: orderId, use_cutting_qty: useCuttingQtyRef.current, total_qty: orderId ? orderQty : null }
    if (fid) {
      await supabase.from('finishing').update(payload).eq('id', fid)
    } else {
      const { data: newFin } = await supabase.from('finishing').insert([payload]).select().single()
      if (newFin) { fid = newFin.id; setFinishingId(fid) }
    }
    if (fid) {
      await supabase.from('finishing_packs').delete().eq('finishing_id', fid)
      const packRows = packsRef.current.map((p, idx) => ({
        finishing_id: fid, pack_name: p.pack_name||null, pack_type: p.pack_type||'By Colour',
        config: p.config||null, carton_l: parseFloat(p.carton_l)||null, carton_w: parseFloat(p.carton_w)||null,
        carton_h: parseFloat(p.carton_h)||null, carton_weight_kg: parseFloat(p.carton_weight_kg)||null,
        units_per_carton: parseInt(p.units_per_carton)||null, qty_assigned: packQty(p), sort_order: idx,
      }))
      if (packRows.length) await supabase.from('finishing_packs').insert(packRows)
    }
    await supabase.from('orders').update({ step_finishing: enabledRef.current }).eq('id', orderId)
    onSaved(orderId, { step_finishing: enabledRef.current })
  }, [orderId, orderQty])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch {}
    setSaving(false)
  }

  const inp = (extra) => ({ height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', ...(extra||{}) })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Finishing & Packing</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Configure pack types — every unit must be assigned</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
          <div onClick={() => setEnabled(e => !e)} style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? '#0d0d0d' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 3, left: enabled ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? '#0d0d0d' : '#9ca3af' }}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      {!enabled ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          Toggle to configure finishing and packing.
        </div>
      ) : (
        <>
          {/* Qty basis selector */}
          <div style={{ background: '#fafaf8', border: '1px solid #e8e8e6', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Pack Quantity Basis</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Should packing use order qty or cutting qty?</div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {[{ label: `Order Qty (${orderQty.toLocaleString()} pcs)`, val: false }, { label: `Cutting Qty (${cuttingQty.toLocaleString()} pcs)`, val: true }].map(opt => (
                <button key={String(opt.val)} onClick={() => setUseCuttingQty(opt.val)}
                  style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                    borderColor: useCuttingQty === opt.val ? '#0d0d0d' : '#e5e7eb',
                    background: useCuttingQty === opt.val ? '#0d0d0d' : '#fff',
                    color: useCuttingQty === opt.val ? '#fff' : '#6b7280' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignment progress */}
          {activeQty > 0 && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 7,
              background: fullyAssigned ? '#f0fdf4' : balance < 0 ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${fullyAssigned ? '#bbf7d0' : balance < 0 ? '#fecaca' : '#fde68a'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: fullyAssigned ? '#16a34a' : balance < 0 ? '#dc2626' : '#d97706' }}>
                  {fullyAssigned ? '✓ All units assigned' : balance < 0 ? `Over-assigned by ${Math.abs(balance).toLocaleString()} pcs` : `${balance.toLocaleString()} pcs remaining`}
                </span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{totalAssigned.toLocaleString()} / {activeQty.toLocaleString()} pcs assigned</span>
              </div>
              <div style={{ marginTop: 6, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: fullyAssigned ? '#16a34a' : balance < 0 ? '#dc2626' : '#d97706', borderRadius: 3, width: `${Math.min(100, activeQty > 0 ? (totalAssigned/activeQty)*100 : 0)}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {/* Pack rows */}
          {packs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 28, color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee', marginBottom: 12 }}>
              No pack types yet. Add one to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {packs.map((pack, idx) => {
                const cbm = cbmForPack(pack)
                const cartons = totalCartons(pack)
                const pQty = packQty(pack)
                const configured = pack.pack_type !== 'By Ratio' ? pQty > 0 : false
                return (
                  <div key={pack._tempId || idx} style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, padding: '12px 14px' }}>
                    {/* Row 1: Name, type, configure, qty, delete */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px auto auto auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pack Name</label>
                        <input style={{ ...inp(), width: '100%' }} value={pack.pack_name||''} onChange={e => updPack(idx,'pack_name',e.target.value)} placeholder="e.g. Main Pack, Export Pack" />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pack Type</label>
                        <select style={{ ...inp(), width: '100%', cursor: 'pointer' }} value={pack.pack_type||'By Colour'} onChange={e => updPack(idx,'pack_type',e.target.value)}>
                          {PACK_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Config</label>
                        <button onClick={() => setConfigModal({ packIdx: idx })}
                          style={{ height: 30, padding: '0 10px', background: configured ? '#eff6ff' : '#fff7ed', border: `1px solid ${configured ? '#bfdbfe' : '#fed7aa'}`, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'Inter,sans-serif', color: configured ? '#2563eb' : '#f97316' }}>
                          <Settings2 size={11} /> {configured ? 'Edit' : 'Configure'}
                        </button>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          {pack.pack_type === 'By Ratio' ? 'Assigned Qty' : 'Qty'}
                        </label>
                        {pack.pack_type === 'By Ratio' ? (
                          <input type="number" style={{ ...inp({ textAlign: 'right', width: 90 }) }} value={pack.qty_assigned||''} onChange={e => updPack(idx,'qty_assigned',e.target.value)} placeholder="0" />
                        ) : (
                          <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 13, fontWeight: 700, color: pQty > 0 ? '#0d0d0d' : '#9ca3af' }}>
                            {pQty > 0 ? pQty.toLocaleString() : '—'}
                          </div>
                        )}
                      </div>
                      <div style={{ paddingBottom: 1 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setPacks(ps => ps.filter((_,i)=>i!==idx))}><Trash2 size={12} /></button>
                      </div>
                    </div>

                    {/* Row 2: Carton dims */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr) auto', gap: 8, alignItems: 'end' }}>
                      {[['L (cm)', 'carton_l'], ['W (cm)', 'carton_w'], ['H (cm)', 'carton_h'], ['Weight (kg)', 'carton_weight_kg'], ['Pcs/Ctn', 'units_per_carton']].map(([label, key]) => (
                        <div key={key}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</label>
                          <input type="number" style={{ ...inp({ width: '100%', textAlign: 'right' }) }} value={pack[key]||''} onChange={e => updPack(idx,key,e.target.value)} />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Pack Style</label>
                        <select style={{ ...inp({ cursor: 'pointer', width: '100%' }) }} value={pack.hang_flat||'Flat Packed'} onChange={e => updPack(idx,'hang_flat',e.target.value)}>
                          {HANG_FLAT.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      {/* CBM + cartons summary */}
                      <div style={{ paddingBottom: 1 }}>
                        {cbm && <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' }}>
                          {cbm} m³/ctn
                          {cartons && <span style={{ marginLeft: 6, fontWeight: 700, color: '#0d0d0d' }}>{cartons} ctns</span>}
                          {cartons && cbm && <span style={{ marginLeft: 6, color: '#7c3aed', fontWeight: 600 }}>{(parseFloat(cbm)*cartons).toFixed(3)} m³</span>}
                        </div>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button className="btn btn-secondary btn-sm" onClick={addPack}><Plus size={12} /> Add Pack Type</button>
        </>
      )}

      {configModal && (
        <PackConfigModal
          pack={packs[configModal.packIdx]}
          packIdx={configModal.packIdx}
          poData={poData}
          useCuttingQty={useCuttingQty}
          orderQty={orderQty}
          cuttingQty={cuttingQty}
          onClose={() => setConfigModal(null)}
          onSave={updPackConfig}
        />
      )}
    </div>
  )
}
