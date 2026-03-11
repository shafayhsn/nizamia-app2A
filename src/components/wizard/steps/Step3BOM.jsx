import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, Library, X, Settings2 } from 'lucide-react'

const USAGE_RULES = ['Generic', 'By Color', 'By Size Group', 'By Individual Sizes', 'Configure Own']
const UNITS = ['yards', 'meters', 'pcs', 'kg', 'cone', 'set', 'sht', 'ctn', 'roll', 'ltr']
const TABLES = [
  { key: 'Fabric',         label: 'Fabrics' },
  { key: 'Stitching Trim', label: 'Stitching Trims' },
  { key: 'Packing Trim',   label: 'Packing Trims' },
]
const COVERAGE_COLOR = { full: '#16a34a', partial: '#f59e0b', none: '#e5e7eb' }

function tempId() { return Math.random().toString(36).slice(2) }

// ── Usage Config Modal ──────────────────────────────────────────────────────
function UsageModal({ config, onClose, onSave, poData }) {
  // config = { item, itemIdx, rule }
  // poData = { colors: [{name}], sizeGroups: [{name, sizes}], allSizes: [] }
  const { item, rule } = config
  const wastage = parseFloat(item.wastage) || 0

  // Local usage data state — initialised from item.usage_data
  const [data, setData] = useState(() => item.usage_data || {})
  // For Configure Own: left sidebar selections per custom group
  const [ownGroups, setOwnGroups] = useState(() => {
    if (rule !== 'Configure Own' || !item.usage_data) return [{ label: 'Group A', sizes: [], consumption: '' }]
    return item.usage_data.__groups || [{ label: 'Group A', sizes: [], consumption: '' }]
  })

  const finalQty = (consumption, qty) => {
    const c = parseFloat(consumption) || 0
    const q = parseFloat(qty) || 0
    if (!c || !q) return null
    return (c * q * (1 + wastage / 100)).toFixed(2)
  }

  const inp = { height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' }

  const handleSave = () => {
    let usageData = {}
    if (rule === 'Generic') {
      usageData = { generic: data.generic || '' }
    } else if (rule === 'By Color') {
      usageData = data
    } else if (rule === 'By Size Group') {
      usageData = data
    } else if (rule === 'By Individual Sizes') {
      usageData = data
    } else if (rule === 'Configure Own') {
      usageData = { ...data, __groups: ownGroups }
    }
    onSave(config.itemIdx, usageData)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: rule === 'Configure Own' ? 620 : 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Configure Usage — {rule}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{item.name || 'BOM Item'} · Wastage {wastage}%</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', gap: 16 }}>

          {/* ── Configure Own: left sidebar ── */}
          {rule === 'Configure Own' && (
            <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #f0f0ee', paddingRight: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Groups</div>
              {ownGroups.map((g, gi) => (
                <div key={gi} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input style={{ ...inp, fontSize: 11 }} value={g.label}
                      onChange={e => setOwnGroups(gs => gs.map((x, i) => i === gi ? { ...x, label: e.target.value } : x))} />
                    {ownGroups.length > 1 && (
                      <button onClick={() => setOwnGroups(gs => gs.filter((_, i) => i !== gi))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', flexShrink: 0 }}>
                        <X size={11} />
                      </button>
                    )}
                  </div>
                  {/* sizes assigned to this group */}
                  <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {g.sizes.map(sz => (
                      <span key={sz} style={{ fontSize: 9, background: '#1a1a2e', color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>{sz}</span>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => setOwnGroups(gs => [...gs, { label: `Group ${String.fromCharCode(65 + gs.length)}`, sizes: [], consumption: '' }])}
                style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Plus size={11} /> Add Group
              </button>
            </div>
          )}

          {/* ── Main config area ── */}
          <div style={{ flex: 1 }}>

            {/* Generic */}
            {rule === 'Generic' && (
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>One consumption value applies to all colours and sizes.</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }}>Consumption / pc</label>
                    <input style={{ ...inp, width: 120 }} type="number" step="0.01"
                      value={data.generic || ''}
                      onChange={e => setData({ generic: e.target.value })}
                      placeholder="0.00" autoFocus />
                  </div>
                </div>
              </div>
            )}

            {/* By Color */}
            {rule === 'By Color' && (
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Set consumption per colour. Formula: consumption × colour qty × (1 + wastage%)</div>
                {poData.colors.length === 0
                  ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>No colours in PO Matrix yet. Add them in Step 2 first.</div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>Colour / Wash</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px', textTransform: 'uppercase' }}>Qty</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Consumption / pc</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Final Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poData.colors.map(c => {
                          const val = data[c.name] || ''
                          const fq = finalQty(val, c.qty)
                          return (
                            <tr key={c.name}>
                              <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12, fontWeight: 500 }}>{c.name}</td>
                              <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>{c.qty?.toLocaleString()}</td>
                              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 120 }}>
                                <input style={{ ...inp, textAlign: 'right', width: 100 }} type="number" step="0.01"
                                  value={val} placeholder="0.00"
                                  onChange={e => setData(d => ({ ...d, [c.name]: e.target.value }))} />
                              </td>
                              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, fontWeight: 700, color: fq ? '#1a1a2e' : '#d1d5db' }}>
                                {fq ? parseFloat(fq).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                }
              </div>
            )}

            {/* By Size Group */}
            {rule === 'By Size Group' && (
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Set consumption per size group.</div>
                {poData.sizeGroups.length === 0
                  ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>No size groups in PO Matrix yet. Add them in Step 2 first.</div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>Size Group</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px', textTransform: 'uppercase' }}>Qty</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Consumption / pc</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Final Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poData.sizeGroups.map(g => {
                          const val = data[g.name] || ''
                          const fq = finalQty(val, g.qty)
                          return (
                            <tr key={g.name}>
                              <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12, fontWeight: 500 }}>
                                {g.name}
                                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>{g.sizes.join(', ')}</span>
                              </td>
                              <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>{g.qty?.toLocaleString()}</td>
                              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 120 }}>
                                <input style={{ ...inp, textAlign: 'right', width: 100 }} type="number" step="0.01"
                                  value={val} placeholder="0.00"
                                  onChange={e => setData(d => ({ ...d, [g.name]: e.target.value }))} />
                              </td>
                              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, fontWeight: 700, color: fq ? '#1a1a2e' : '#d1d5db' }}>
                                {fq ? parseFloat(fq).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                }
              </div>
            )}

            {/* By Individual Sizes */}
            {rule === 'By Individual Sizes' && (
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Set consumption per size.</div>
                {poData.allSizes.length === 0
                  ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>No sizes in PO Matrix yet. Add them in Step 2 first.</div>
                  : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>Size</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px', textTransform: 'uppercase' }}>Qty</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Consumption / pc</th>
                          <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Final Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poData.allSizes.map(s => {
                          const val = data[s.size] || ''
                          const fq = finalQty(val, s.qty)
                          return (
                            <tr key={s.size}>
                              <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12, fontWeight: 600 }}>{s.size}</td>
                              <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>{s.qty?.toLocaleString()}</td>
                              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 120 }}>
                                <input style={{ ...inp, textAlign: 'right', width: 100 }} type="number" step="0.01"
                                  value={val} placeholder="0.00"
                                  onChange={e => setData(d => ({ ...d, [s.size]: e.target.value }))} />
                              </td>
                              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, fontWeight: 700, color: fq ? '#1a1a2e' : '#d1d5db' }}>
                                {fq ? parseFloat(fq).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                }
              </div>
            )}

            {/* Configure Own */}
            {rule === 'Configure Own' && (
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Assign sizes to custom groups, then set consumption per group.</div>
                {poData.allSizes.length === 0
                  ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>No sizes in PO Matrix yet.</div>
                  : ownGroups.map((g, gi) => {
                    // sizes assigned to this group
                    return (
                      <div key={gi} style={{ marginBottom: 14, padding: '12px', background: '#fafaf8', borderRadius: 8, border: '1px solid #e8e8e6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{g.label}</span>
                          <div style={{ flex: 1 }} />
                          <label style={{ fontSize: 10, color: '#6b7280', marginRight: 4 }}>Consumption / pc</label>
                          <input style={{ ...inp, width: 90, textAlign: 'right' }} type="number" step="0.01"
                            value={g.consumption || ''}
                            onChange={e => setOwnGroups(gs => gs.map((x, i) => i === gi ? { ...x, consumption: e.target.value } : x))}
                            placeholder="0.00" />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {poData.allSizes.map(s => {
                            const inThis = g.sizes.includes(s.size)
                            const inOther = ownGroups.some((x, i) => i !== gi && x.sizes.includes(s.size))
                            return (
                              <button key={s.size} disabled={inOther}
                                onClick={() => setOwnGroups(gs => gs.map((x, i) => {
                                  if (i !== gi) return x
                                  const sizes = inThis ? x.sizes.filter(sz => sz !== s.size) : [...x.sizes, s.size]
                                  return { ...x, sizes }
                                }))}
                                style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: 'none', cursor: inOther ? 'not-allowed' : 'pointer',
                                  background: inThis ? '#1a1a2e' : inOther ? '#f0f0ee' : '#e5e7eb',
                                  color: inThis ? '#fff' : inOther ? '#d1d5db' : '#374151',
                                  opacity: inOther ? 0.5 : 1 }}>
                                {s.size}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Usage</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Step3 component ────────────────────────────────────────────────────
export default function Step3BOM({ orderId, orderData, onSaved, registerSave }) {
  const [items,     setItems]    = useState([])
  const [library,   setLibrary]  = useState([])
  const [saving,    setSaving]   = useState(false)
  const [saved,     setSaved]    = useState(false)
  const [activeTab, setActive]   = useState('Fabric')
  const [showLib,   setShowLib]  = useState(false)
  const [usageConfig, setUsageConfig] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [poData,    setPoData]   = useState({ colors: [], sizeGroups: [], allSizes: [] })

  const totalQty = orderData?.total_qty || 0

  useEffect(() => {
    if (orderId) {
      loadItems()
      loadPoData()
    }
    supabase.from('library_items').select('*').order('name').then(({ data }) => setLibrary(data || []))
    supabase.from('suppliers').select('id,name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [orderId])

  async function loadItems() {
    const { data } = await supabase.from('bom_items').select('*').eq('order_id', orderId).order('sort_order')
    setItems(data || [])
  }

  async function loadPoData() {
    // Load size groups + colors + breakdown to build colors[], sizeGroups[], allSizes[]
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    if (!sgs?.length) return

    const { data: colors } = await supabase.from('size_group_colors').select('*').in('size_group_id', sgs.map(g => g.id)).order('sort_order')
    const { data: bd }     = await supabase.from('size_group_breakdown').select('*').in('size_group_id', sgs.map(g => g.id))

    // Build colour list with total qty
    const colorMap = {}
    colors?.forEach(c => { colorMap[c.id] = { name: c.color_name, qty: 0 } })
    bd?.forEach(b => { if (colorMap[b.color_id]) colorMap[b.color_id].qty += b.qty || 0 })
    const colorList = Object.values(colorMap)

    // Build size group list with total qty
    const sizeGroupList = sgs.map(g => {
      const qty = bd?.filter(b => b.size_group_id === g.id).reduce((s, b) => s + (b.qty || 0), 0) || 0
      return { name: g.group_name, sizes: g.sizes || [], qty }
    })

    // Build per-size qty across all groups
    const sizeQtyMap = {}
    bd?.forEach(b => {
      sizeQtyMap[b.size] = (sizeQtyMap[b.size] || 0) + (b.qty || 0)
    })
    // Preserve size order from groups
    const seenSizes = []
    sgs.forEach(g => (g.sizes || []).forEach(sz => { if (!seenSizes.includes(sz)) seenSizes.push(sz) }))
    const allSizeList = seenSizes.map(sz => ({ size: sz, qty: sizeQtyMap[sz] || 0 }))

    setPoData({ colors: colorList, sizeGroups: sizeGroupList, allSizes: allSizeList })
  }

  const addBlank = (cat) => setItems(i => [...i, {
    _new: true, order_id: orderId, category: cat,
    name: '', specification: '', unit: 'yards', usage_rule: 'Generic',
    usage_data: null, base_qty: '', wastage: 5, supplier_id: '', notes: '',
    sort_order: i.length, _tempId: tempId(),
  }])

  const addFromLibrary = (lib) => {
    setItems(i => [...i, {
      _new: true, order_id: orderId, category: lib.category,
      name: lib.name, specification: lib.description || '',
      unit: lib.unit, usage_rule: 'Generic', usage_data: null,
      base_qty: '', wastage: lib.default_wastage || 5,
      supplier_id: '', notes: '', sort_order: i.length,
      _tempId: tempId(), library_item_id: lib.id,
    }])
    setActive(lib.category)
    setShowLib(false)
  }

  const upd = (idx, k, v) => setItems(its => its.map((it, i) => i === idx ? { ...it, [k]: v } : it))

  const remove = async (idx) => {
    const item = items[idx]
    if (item.id) await supabase.from('bom_items').delete().eq('id', item.id)
    setItems(its => its.filter((_, i) => i !== idx))
  }

  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const doSave = useCallback(async () => {
    if (!orderId) throw new Error('No order ID')
    for (let idx = 0; idx < itemsRef.current.length; idx++) {
      const { _new, _tempId, id, ...rest } = itemsRef.current[idx]
      const payload = { ...rest, sort_order: idx, usage_data: rest.usage_data || null }
      if (id) {
        await supabase.from('bom_items').update(payload).eq('id', id)
      } else {
        const { data } = await supabase.from('bom_items').insert([{ ...payload, order_id: orderId }]).select().single()
        if (data) setItems(its => its.map((it, i) => i === idx ? data : it))
      }
    }
    await supabase.from('orders').update({ step_bom: true }).eq('id', orderId)
    onSaved(orderId, { step_bom: true })
  }, [orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleUsageSave = (itemIdx, usageData) => {
    upd(itemIdx, 'usage_data', usageData)
  }

  // Calculate final qty from usage_data
  const calcFinalQty = (item) => {
    const wastage = parseFloat(item.wastage) || 0
    const rule = item.usage_rule || 'Generic'
    const ud = item.usage_data

    if (rule === 'Generic') {
      const base = parseFloat(item.base_qty) || parseFloat(ud?.generic) || 0
      if (!base || !totalQty) return null
      return (base * totalQty * (1 + wastage / 100)).toFixed(1)
    }
    if (!ud) return null

    if (rule === 'By Color') {
      const total = Object.entries(ud).reduce((s, [colorName, cons]) => {
        const color = poData.colors.find(c => c.name === colorName)
        return s + (parseFloat(cons) || 0) * (color?.qty || 0) * (1 + wastage / 100)
      }, 0)
      return total > 0 ? total.toFixed(1) : null
    }
    if (rule === 'By Size Group') {
      const total = Object.entries(ud).reduce((s, [gName, cons]) => {
        const g = poData.sizeGroups.find(x => x.name === gName)
        return s + (parseFloat(cons) || 0) * (g?.qty || 0) * (1 + wastage / 100)
      }, 0)
      return total > 0 ? total.toFixed(1) : null
    }
    if (rule === 'By Individual Sizes') {
      const total = Object.entries(ud).reduce((s, [sz, cons]) => {
        const found = poData.allSizes.find(x => x.size === sz)
        return s + (parseFloat(cons) || 0) * (found?.qty || 0) * (1 + wastage / 100)
      }, 0)
      return total > 0 ? total.toFixed(1) : null
    }
    if (rule === 'Configure Own') {
      const groups = ud.__groups || []
      const total = groups.reduce((s, g) => {
        const gQty = g.sizes.reduce((sq, sz) => sq + (poData.allSizes.find(x => x.size === sz)?.qty || 0), 0)
        return s + (parseFloat(g.consumption) || 0) * gQty * (1 + wastage / 100)
      }, 0)
      return total > 0 ? total.toFixed(1) : null
    }
    return null
  }

  const isConfigured = (item) => {
    if (item.usage_rule === 'Generic') return !!item.base_qty
    return !!item.usage_data
  }

  const tabItems = items.filter(i => i.category === activeTab)
  const inp = { width: '100%', height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff' }
  const sel = { ...inp, cursor: 'pointer', paddingRight: 4 }

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #e8e8e6' }}>
        {TABLES.map(t => {
          const count = items.filter(i => i.category === t.key).length
          return (
            <button key={t.key} onClick={() => setActive(t.key)} style={{
              padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: activeTab === t.key ? 700 : 400,
              color: activeTab === t.key ? '#1a1a2e' : '#9ca3af',
              borderBottom: `2px solid ${activeTab === t.key ? '#1a1a2e' : 'transparent'}`,
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              <span style={{ fontSize: 10, background: count > 0 ? '#1a1a2e' : '#e5e7eb', color: count > 0 ? '#fff' : '#9ca3af', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780, marginBottom: 12 }}>
          <thead>
            <tr>
              {['', 'Item Name', 'Specification', 'Unit', 'Usage Rule', 'Base Qty', 'Wastage %', 'Supplier', 'Final Qty', ''].map((h, i) => (
                <th key={i} style={{ textAlign: i >= 5 && i <= 7 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 6px 8px', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabItems.length === 0 && (
              <tr><td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                No {activeTab.toLowerCase()} items yet.
              </td></tr>
            )}
            {tabItems.map(item => {
              const realIdx = items.indexOf(item)
              const fqty = calcFinalQty(item)
              const configured = isConfigured(item)
              const isGeneric = !item.usage_rule || item.usage_rule === 'Generic'

              return (
                <tr key={item.id || item._tempId}>
                  {/* Coverage dot */}
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0ee', width: 14 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: configured ? COVERAGE_COLOR.full : COVERAGE_COLOR.none }} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 150 }}>
                    <input style={inp} value={item.name || ''} onChange={e => upd(realIdx, 'name', e.target.value)} placeholder="Item name" />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 140 }}>
                    <input style={inp} value={item.specification || ''} onChange={e => upd(realIdx, 'specification', e.target.value)} placeholder="e.g. 98% CO 2% EA" />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 80 }}>
                    <select style={sel} value={item.unit || 'yards'} onChange={e => upd(realIdx, 'unit', e.target.value)}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 150 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <select style={{ ...sel, flex: 1, color: !isGeneric ? '#2563eb' : undefined, fontWeight: !isGeneric ? 600 : undefined }}
                        value={item.usage_rule || 'Generic'}
                        onChange={e => {
                          const rule = e.target.value
                          upd(realIdx, 'usage_rule', rule)
                          upd(realIdx, 'usage_data', null)
                          // Open config modal immediately for all rules
                          setUsageConfig({ itemIdx: realIdx, rule, item: { ...item, usage_rule: rule, usage_data: null } })
                        }}>
                        {USAGE_RULES.map(r => <option key={r}>{r}</option>)}
                      </select>
                      {/* Configure button for non-Generic */}
                      {!isGeneric && (
                        <button
                          onClick={() => setUsageConfig({ itemIdx: realIdx, rule: item.usage_rule, item })}
                          title="Configure usage"
                          style={{ background: item.usage_data ? '#eff6ff' : '#fff7ed', border: `1px solid ${item.usage_data ? '#bfdbfe' : '#fed7aa'}`, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 6px', height: 30, flexShrink: 0 }}>
                          <Settings2 size={12} color={item.usage_data ? '#2563eb' : '#f97316'} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 80 }}>
                    {/* Base qty only shown for Generic */}
                    {isGeneric
                      ? <input style={{ ...inp, textAlign: 'right' }} type="number" value={item.base_qty || ''} onChange={e => upd(realIdx, 'base_qty', e.target.value)} placeholder="0" />
                      : <span style={{ fontSize: 11, color: '#9ca3af', display: 'block', textAlign: 'right', paddingRight: 8 }}>varies</span>
                    }
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 64 }}>
                    <input style={{ ...inp, textAlign: 'right' }} type="number" value={item.wastage || ''} onChange={e => upd(realIdx, 'wastage', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 120 }}>
                    <select style={sel} value={item.supplier_id || ''} onChange={e => upd(realIdx, 'supplier_id', e.target.value)}>
                      <option value="">Unassigned</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 90, textAlign: 'right' }}>
                    {fqty
                      ? <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e', fontVariantNumeric: 'tabular-nums' }}>{parseFloat(fqty).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                      : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '4px 0 4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(realIdx)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => addBlank(activeTab)}><Plus size={12} /> Add {activeTab} Item</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowLib(true)}><Library size={12} /> Add from Library</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !orderId}>
          {saving ? 'Saving...' : 'Save BOM'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
      </div>

      {/* Library Modal */}
      {showLib && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Add from Library</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {library.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No library items. Add them in the Library page.</div>
                : library.map(lib => (
                  <div key={lib.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f0f0ee' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{lib.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{lib.category} · {lib.unit} · wastage {lib.default_wastage}%</div>
                    </div>
                    <button className="btn btn-sm btn-secondary" onClick={() => addFromLibrary(lib)}>Add</button>
                  </div>
                ))
              }
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowLib(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Config Modal */}
      {usageConfig && (
        <UsageModal
          config={usageConfig}
          poData={poData}
          onClose={() => setUsageConfig(null)}
          onSave={handleUsageSave}
        />
      )}
    </div>
  )
}
