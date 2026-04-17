import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, Upload, X, Settings2, AlertTriangle } from 'lucide-react'

const TECHNIQUES  = ['Screen Print','Embroidery','Heat Transfer','Woven Label','Rubber Print','Foil Print','Paint Splatter','Appliqué','Other']
const PLACEMENTS  = ['Left Chest','Right Chest','Center Chest','Back','Sleeve Left','Sleeve Right','Collar','Hem','Pocket','Custom']
const USAGE_RULES = ['Generic', 'By Color', 'By Size Group', 'By Individual Sizes', 'Configure Own']

function normalizeUsageCell(cell) {
  if (cell && typeof cell === 'object' && !Array.isArray(cell)) return { value: cell.value ?? '', na: !!cell.na }
  return { value: cell ?? '', na: false }
}

// ── Embellishment Usage Modal (mirrors BOM UsageModal) ────────────────────────
function EmbUsageModal({ config, onClose, onSave, poData }) {
  const { item, rule } = config

  const [data, setData] = useState(() => {
    if (rule === 'Configure Own') return {}
    const src = item.usage_data || {}
    const out = {}
    Object.entries(src).forEach(([k, v]) => {
      if (k.startsWith('_')) return
      out[k] = normalizeUsageCell(v)
    })
    return out
  })
  const [matrixData, setMatrixData] = useState(() => {
    if (rule !== 'Configure Own') return {}
    const m = item.usage_data?.__matrix || []
    const obj = {}
    m.forEach(e => { obj[`${e.sgName}||${e.colorName}`] = e.consumption })
    return obj
  })

  const inp = { height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' }
  const genericCell = normalizeUsageCell(data.generic)
  const TH = ({ children, right }) => <th style={{ textAlign: right ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>{children}</th>

  const fmtQty = (consumption, qty) => {
    const c = parseFloat(consumption) || 0
    const q = parseFloat(qty) || 0
    if (!c || !q) return null
    return (c * q).toFixed(0)
  }

  const totalFQ = (() => {
    if (rule === 'Generic') {
      const totalQty = poData.allSizes.reduce((s, x) => s + x.qty, 0)
      return genericCell.na ? null : ((parseFloat(genericCell.value) || 0) * totalQty || null)
    }
    if (rule === 'Configure Own') {
      const total = (poData.sgMatrix || []).reduce((s, sg) =>
        s + sg.colors.reduce((ss, c) => ss + (parseFloat(matrixData[`${sg.sgName}||${c.colorName}`]) || 0) * c.qty, 0), 0)
      return total > 0 ? total : null
    }
    const entries = Object.entries(data)
    if (!entries.length) return null
    const total = entries.reduce((s, [k, cons]) => {
      const qty = rule === 'By Color' ? poData.colors.find(x => x.name === k)?.qty
        : rule === 'By Size Group' ? poData.sizeGroups.find(x => x.name === k)?.qty
        : poData.allSizes.find(x => x.size === k)?.qty
      return s + (parseFloat(cons) || 0) * (qty || 0)
    }, 0)
    return total > 0 ? total : null
  })()

  const handleSave = () => {
    let usageData = {}
    if (rule === 'Generic') {
      usageData = { generic: genericCell }
    } else if (rule === 'Configure Own') {
      const matrix = Object.entries(matrixData).filter(([, v]) => v !== '').map(([key, consumption]) => { const [sgName, colorName] = key.split('||'); return { sgName, colorName, consumption } })
      usageData = { __matrix: matrix }
    } else {
      usageData = Object.fromEntries(Object.entries(data).map(([k, cell]) => [k, normalizeUsageCell(cell)]))
    }
    onSave(config.itemIdx, usageData)
    onClose()
  }

  const mergedColors = poData.colors.map(c => c.name)
  const mergedGroups = poData.sizeGroups.map(g => g.name)
  const mergedSizes  = poData.allSizes.map(s => s.size)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 500, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Configure Demand — {rule}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{item.description || 'Embellishment'} · consumption per piece</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {rule === 'Generic' && (
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>One consumption value applies to all sizes and colours.</div>
              <label style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }}>Pieces per garment</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: genericCell.na ? '#92400e' : '#6b7280', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={genericCell.na} onChange={e => setData({ generic: { value: e.target.checked ? '' : (genericCell.value || ''), na: e.target.checked } })} />
                  N/A
                </label>
                <input style={{ ...inp, width: 140, textAlign: 'right', opacity: genericCell.na ? 0.55 : 1 }} type="number" step="1"
                  value={genericCell.value || ''} onChange={e => setData({ generic: { value: e.target.value, na: false } })} placeholder="1" autoFocus disabled={genericCell.na} />
              </div>
            </div>
          )}
          {(rule === 'By Color' || rule === 'By Size Group' || rule === 'By Individual Sizes') && (() => {
            const keys  = rule === 'By Color' ? mergedColors : rule === 'By Size Group' ? mergedGroups : mergedSizes
            const qtys  = rule === 'By Color'
              ? Object.fromEntries(poData.colors.map(c => [c.name, c.qty]))
              : rule === 'By Size Group'
                ? Object.fromEntries(poData.sizeGroups.map(g => [g.name, g.qty]))
                : Object.fromEntries(poData.allSizes.map(s => [s.size, s.qty]))
            const label = rule === 'By Color' ? 'Colour / Wash' : rule === 'By Size Group' ? 'Size Group' : 'Size'
            if (keys.length === 0) return (
              <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>
                No {label.toLowerCase()} data in PO Matrix yet. Complete Step 2 first.
              </div>
            )
            return (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><TH>{label}</TH><TH right>Qty</TH><TH right>Pcs/garment</TH><TH right>Total Pcs</TH></tr></thead>
                <tbody>
                  {keys.map(k => {
                    const cell = normalizeUsageCell(data[k])
                    const val = cell.value || ''
                    const isNA = !!cell.na
                    const fq  = fmtQty(val, qtys[k], isNA)
                    const isNew = !(k in (item.usage_data || {}))
                    return (
                      <tr key={k}>
                        <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12, fontWeight: 500 }}>
                          {k}{isNew && <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 6 }}>NEW</span>}
                        </td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>{qtys[k]?.toLocaleString()}</td>
                        <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 150 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: isNA ? '#92400e' : '#6b7280', whiteSpace: 'nowrap' }}>
                              <input type="checkbox" checked={isNA} onChange={e => setData(d => ({ ...d, [k]: { value: e.target.checked ? '' : (normalizeUsageCell(d[k]).value || ''), na: e.target.checked } }))} />
                              N/A
                            </label>
                            <input style={{ ...inp, textAlign: 'right', width: 96, borderColor: isNew && !val && !isNA ? '#fcd34d' : '#e5e7eb', opacity: isNA ? 0.55 : 1 }}
                              type="number" step="1" value={val} placeholder="1" disabled={isNA}
                              onChange={e => setData(d => ({ ...d, [k]: { value: e.target.value, na: false } }))} autoFocus={isNew} />
                          </div>
                        </td>
                        <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, fontWeight: 700, color: fq ? '#1a1a2e' : '#d1d5db' }}>
                          {isNA ? 'N/A' : (fq ? parseInt(fq).toLocaleString() : '—')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}
          {rule === 'Configure Own' && (
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>Set pieces per garment for each Size Group × Colour combination.</div>
              {!(poData.sgMatrix || []).length
                ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>No PO Matrix data yet.</div>
                : (poData.sgMatrix || []).map(sg => (
                  <div key={sg.sgName} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#1a1a2e', padding: '4px 10px', borderRadius: 5, marginBottom: 8, display: 'inline-block', letterSpacing: '0.4px', textTransform: 'uppercase' }}>{sg.sgName}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><TH>Colour / Wash</TH><TH right>Qty</TH><TH right>Pcs/garment</TH><TH right>Total Pcs</TH></tr></thead>
                      <tbody>
                        {sg.colors.map(c => {
                          const key = `${sg.sgName}||${c.colorName}`
                          const val = matrixData[key] || ''
                          const fq  = fmtQty(val, c.qty)
                          const isNew = !(item.usage_data?.__matrix || []).some(m => m.sgName === sg.sgName && m.colorName === c.colorName)
                          return (
                            <tr key={key}>
                              <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12, fontWeight: 500 }}>
                                {c.colorName}{isNew && <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 6 }}>NEW</span>}
                              </td>
                              <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>{c.qty?.toLocaleString()}</td>
                              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 110 }}>
                                <input style={{ ...inp, textAlign: 'right', width: 96, borderColor: isNew && !val ? '#fcd34d' : '#e5e7eb' }}
                                  type="number" step="1" value={val} placeholder="1"
                                  onChange={e => setMatrixData(d => ({ ...d, [key]: e.target.value }))} />
                              </td>
                              <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, fontWeight: 700, color: fq ? '#1a1a2e' : '#d1d5db' }}>
                                {fq ? parseInt(fq).toLocaleString() : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              }
            </div>
          )}
          {totalFQ !== null && (
            <div style={{ marginTop: 14, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, fontWeight: 700, color: '#15803d' }}>
              Total demand: {parseInt(totalFQ).toLocaleString()} pcs
            </div>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default function Step7Embellishment({ orderId, onSaved, registerSave }) {
  const [enabled,     setEnabled]     = useState(false)
  const [items,       setItems]       = useState([])
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [colors,      setColors]      = useState([])
  const [poData,      setPoData]      = useState({ colors: [], sizeGroups: [], allSizes: [], sgMatrix: [] })
  const [usageConfig, setUsageConfig] = useState(null)
  const imgRefs = useRef({})

  useEffect(() => {
    if (!orderId) return
    Promise.all([load(), loadPoData()])
  }, [orderId])

  async function loadPoData() {
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    if (!sgs?.length) return
    const [{ data: allColorsRaw }, { data: bd }] = await Promise.all([
      supabase.from('size_group_colors').select('*').in('size_group_id', sgs.map(g => g.id)),
      supabase.from('size_group_breakdown').select('*').in('size_group_id', sgs.map(g => g.id)),
    ])

    // Color chips for "Applies To"
    const unique = [...new Set((allColorsRaw || []).map(c => c.color_name))]
    setColors(['All', ...unique])

    // Full poData for usage modal
    const colorMap = {}
    allColorsRaw?.forEach(c => { colorMap[c.id] = { name: c.color_name, qty: 0 } })
    bd?.forEach(b => { if (colorMap[b.color_id]) colorMap[b.color_id].qty += b.qty || 0 })
    const colorList = Object.values(colorMap)

    const sizeGroupList = sgs.map(g => ({
      name: g.group_name, sizes: g.sizes || [],
      qty: bd?.filter(b => b.size_group_id === g.id).reduce((s, b) => s + (b.qty || 0), 0) || 0
    }))
    const sizeQtyMap = {}
    bd?.forEach(b => { sizeQtyMap[b.size] = (sizeQtyMap[b.size] || 0) + (b.qty || 0) })
    const seenSizes = []
    sgs.forEach(g => (g.sizes || []).forEach(sz => { if (!seenSizes.includes(sz)) seenSizes.push(sz) }))
    const allSizeList = seenSizes.map(sz => ({ size: sz, qty: sizeQtyMap[sz] || 0 }))
    const sgMatrix = sgs.map(g => {
      const bdForGroup = bd?.filter(b => b.size_group_id === g.id) || []
      const colorsForGroup = (allColorsRaw || []).filter(c => c.size_group_id === g.id)
      return {
        sgName: g.group_name, sizes: g.sizes || [],
        colors: colorsForGroup.map(c => ({
          colorName: c.color_name,
          qty: (g.sizes || []).reduce((s, sz) => s + (bdForGroup.find(b => b.color_id === c.id && b.size === sz)?.qty || 0), 0),
        })),
      }
    })
    setPoData({ colors: colorList, sizeGroups: sizeGroupList, allSizes: allSizeList, sgMatrix })
  }

  async function load() {
    const [{ data }, { data: ord }] = await Promise.all([
      supabase.from('embellishments').select('*').eq('order_id', orderId).order('created_at'),
      supabase.from('orders').select('step_embellishment').eq('id', orderId).single(),
    ])
    setItems((data || []).map(d => ({ ...d, _tempId: d.id, imagePreview: d.artwork_url || null })))
    setEnabled((ord?.step_embellishment ?? false) || !!(data || []).length)
  }

  const add = () => setItems(i => [...i, {
    _new: true, _tempId: Math.random().toString(36).slice(2),
    order_id: orderId, description: '', technique: 'Screen Print',
    placement: 'Left Chest', dimensions: '', artwork_ref: '',
    colors_used: '', applies_to: ['All'], approval_status: 'Pending',
    notes: '', imagePreview: null, artwork_url: null,
    usage_rule: 'Generic', usage_data: null,
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

  const handleUsageSave = (itemIdx, usageData) => upd(itemIdx, 'usage_data', usageData)

  const itemsRef = useRef(items)
  const enabledRef = useRef(enabled)
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  const doSave = useCallback(async () => {
    if (!orderId) return
    await supabase.from('embellishments').delete().eq('order_id', orderId)
    const rows = enabledRef.current ? itemsRef.current.filter(i => i.description?.trim()).map(({ _new, _tempId, imagePreview, ...rest }) => ({ ...rest })) : []
    if (rows.length) await supabase.from('embellishments').insert(rows)
    await supabase.from('orders').update({ step_embellishment: enabledRef.current }).eq('id', orderId)
    onSaved(orderId, { step_embellishment: enabledRef.current })
  }, [orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Embellishments</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Artwork, prints, embroidery and decorative details</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginLeft: 'auto' }}>
          <div onClick={() => setEnabled(e => !e)} style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? '#0d0d0d' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 3, left: enabled ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? '#0d0d0d' : '#9ca3af' }}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
          <button className="btn btn-secondary btn-sm" onClick={add} disabled={!enabled}><Plus size={12} /> Add</button>
        </div>
      </div>

      {!enabled ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          Toggle to enable embellishment details for this order.
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          No embellishments for this order. Click Add to begin.
        </div>
      ) : items.map((item, idx) => (
        <div key={item._tempId || idx} style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#fafaf8', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1, color: item.description ? '#0d0d0d' : '#9ca3af' }}>
              {item.description || `Embellishment ${idx + 1}`}
            </span>
            {/* Usage rule badge */}
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
              background: item.usage_data ? '#eff6ff' : '#fff7ed',
              color: item.usage_data ? '#2563eb' : '#d97706',
              border: `1px solid ${item.usage_data ? '#bfdbfe' : '#fed7aa'}` }}>
              {item.usage_rule || 'Generic'}
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

              {/* Usage Rule + Configure */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Demand Rule</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select style={{ ...sel, maxWidth: 200, color: item.usage_rule !== 'Generic' ? '#2563eb' : undefined, fontWeight: item.usage_rule !== 'Generic' ? 600 : undefined }}
                    value={item.usage_rule || 'Generic'}
                    onChange={e => {
                      upd(idx, 'usage_rule', e.target.value)
                      upd(idx, 'usage_data', null)
                      setUsageConfig({ itemIdx: idx, rule: e.target.value, item: { ...item, usage_rule: e.target.value, usage_data: null } })
                    }}>
                    {USAGE_RULES.map(r => <option key={r}>{r}</option>)}
                  </select>
                  {(item.usage_rule && item.usage_rule !== 'Generic') && (
                    <button
                      onClick={() => setUsageConfig({ itemIdx: idx, rule: item.usage_rule, item })}
                      style={{ background: item.usage_data ? '#eff6ff' : '#fff7ed', border: `1px solid ${item.usage_data ? '#bfdbfe' : '#fed7aa'}`, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', height: 30 }}>
                      <Settings2 size={12} color={item.usage_data ? '#2563eb' : '#f97316'} />
                      <span style={{ fontSize: 11, color: item.usage_data ? '#2563eb' : '#f97316', fontWeight: 600 }}>{item.usage_data ? 'Edit' : 'Configure'}</span>
                    </button>
                  )}
                  {item.usage_data && item.usage_rule !== 'Generic' && (
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Configured</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {usageConfig && (
        <EmbUsageModal
          config={usageConfig}
          poData={poData}
          onClose={() => setUsageConfig(null)}
          onSave={handleUsageSave}
        />
      )}
    </div>
  )
}
