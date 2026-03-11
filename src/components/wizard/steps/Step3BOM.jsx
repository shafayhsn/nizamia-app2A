import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, Library, X, Settings2, AlertTriangle, Search } from 'lucide-react'

const USAGE_RULES = ['Generic', 'By Color', 'By Size Group', 'By Individual Sizes', 'Configure Own']
const UNITS = ['yards', 'meters', 'pcs', 'kg', 'cone', 'set', 'sht', 'ctn', 'roll', 'ltr']
const TABLES = [
  { key: 'Fabric',         label: 'Fabrics' },
  { key: 'Stitching Trim', label: 'Stitching Trims' },
  { key: 'Packing Trim',   label: 'Packing Trims' },
]
const COVERAGE_COLOR = { full: '#16a34a', partial: '#f59e0b', none: '#e5e7eb' }

function tempId() { return Math.random().toString(36).slice(2) }

// ── Staleness detection ──────────────────────────────────────────────────────
function getStaleKeys(item, poData) {
  const rule = item.usage_rule
  const ud   = item.usage_data
  if (!rule || rule === 'Generic' || !ud) return []

  if (rule === 'By Color') {
    return poData.colors.map(c => c.name).filter(n => !(n in ud))
  }
  if (rule === 'By Size Group') {
    return poData.sizeGroups.map(g => g.name).filter(n => !(n in ud))
  }
  if (rule === 'By Individual Sizes') {
    return poData.allSizes.map(s => s.size).filter(s => !(s in ud))
  }
  if (rule === 'Configure Own') {
    const groups = ud.__groups || []
    const assigned = groups.flatMap(g => g.sizes)
    return poData.allSizes.map(s => s.size).filter(s => !assigned.includes(s))
  }
  return []
}

// ── Usage Config Modal ───────────────────────────────────────────────────────
function UsageModal({ config, onClose, onSave, poData }) {
  const { item, rule } = config
  const wastage = parseFloat(item.wastage) || 0

  const [data, setData] = useState(() => item.usage_data || {})
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
    } else if (rule === 'Configure Own') {
      usageData = { ...data, __groups: ownGroups }
    } else {
      usageData = data
    }
    onSave(config.itemIdx, usageData)
    onClose()
  }

  // Merge existing data with new PO Matrix keys (stale merging)
  const mergedColors     = poData.colors.map(c => c.name)
  const mergedGroups     = poData.sizeGroups.map(g => g.name)
  const mergedSizes      = poData.allSizes.map(s => s.size)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: rule === 'Configure Own' ? 640 : 500, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Configure Usage — {rule}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{item.name || 'BOM Item'} · Wastage {wastage}%</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', gap: 16 }}>

          {rule === 'Configure Own' && (
            <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #f0f0ee', paddingRight: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Groups</div>
              {ownGroups.map((g, gi) => (
                <div key={gi} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input style={{ ...inp, fontSize: 11 }} value={g.label}
                      onChange={e => setOwnGroups(gs => gs.map((x, i) => i === gi ? { ...x, label: e.target.value } : x))} />
                    {ownGroups.length > 1 && (
                      <button onClick={() => setOwnGroups(gs => gs.filter((_, i) => i !== gi))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', flexShrink: 0 }}>
                        <X size={11} />
                      </button>
                    )}
                  </div>
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

          <div style={{ flex: 1 }}>

            {rule === 'Generic' && (
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>One consumption value applies to all.</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }}>Consumption / pc</label>
                    <input style={{ ...inp, width: 120, textAlign: 'right' }} type="number" step="0.01"
                      value={data.generic || ''} onChange={e => setData({ generic: e.target.value })} placeholder="0.00" autoFocus />
                  </div>
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
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>{label}</th>
                      <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px', textTransform: 'uppercase' }}>Qty</th>
                      <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Cons./pc</th>
                      <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Final Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map(k => {
                      const val = data[k] || ''
                      const fq  = finalQty(val, qtys[k])
                      const isNew = !(k in (item.usage_data || {}))
                      return (
                        <tr key={k}>
                          <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12, fontWeight: 500 }}>
                            {k}
                            {isNew && <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 6 }}>NEW</span>}
                          </td>
                          <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>{qtys[k]?.toLocaleString()}</td>
                          <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 110 }}>
                            <input style={{ ...inp, textAlign: 'right', width: 96, borderColor: isNew && !val ? '#fcd34d' : '#e5e7eb' }}
                              type="number" step="0.01" value={val} placeholder="0.00"
                              onChange={e => setData(d => ({ ...d, [k]: e.target.value }))} autoFocus={isNew} />
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
            })()}

            {rule === 'Configure Own' && (
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Assign sizes to custom groups, then set consumption per group.</div>
                {poData.allSizes.length === 0
                  ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>No sizes in PO Matrix yet.</div>
                  : ownGroups.map((g, gi) => (
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
                          const inThis  = g.sizes.includes(s.size)
                          const inOther = ownGroups.some((x, i) => i !== gi && x.sizes.includes(s.size))
                          const isNew   = !ownGroups.some(x => x.sizes.includes(s.size)) && !(item.usage_data?.__groups || []).some(x => x.sizes.includes(s.size))
                          return (
                            <button key={s.size} disabled={inOther}
                              onClick={() => setOwnGroups(gs => gs.map((x, i) => {
                                if (i !== gi) return x
                                const sizes = inThis ? x.sizes.filter(sz => sz !== s.size) : [...x.sizes, s.size]
                                return { ...x, sizes }
                              }))}
                              style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, border: isNew ? '2px solid #fcd34d' : 'none', cursor: inOther ? 'not-allowed' : 'pointer',
                                background: inThis ? '#1a1a2e' : inOther ? '#f0f0ee' : '#e5e7eb',
                                color: inThis ? '#fff' : inOther ? '#d1d5db' : '#374151',
                                opacity: inOther ? 0.5 : 1 }}>
                              {s.size}
                              {isNew && !inThis && <span style={{ fontSize: 8, marginLeft: 3, color: '#92400e' }}>new</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Usage</button>
        </div>
      </div>
    </div>
  )
}

// ── Library picker modal ─────────────────────────────────────────────────────
function LibraryModal({ category, library, onAdd, onClose }) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(new Set())

  const filtered = library
    .filter(i => i.category === category)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.description || '').toLowerCase().includes(search.toLowerCase()))

  const toggle = (id) => setSelected(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleAdd = () => {
    const items = filtered.filter(i => selected.has(i.id))
    onAdd(items)
    onClose()
  }

  const catLabel = category === 'Fabric' ? 'Fabrics' : category === 'Stitching Trim' ? 'Stitching Trims' : 'Packing Trims'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 680, maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Add from Library — {catLabel}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Only {catLabel.toLowerCase()} are shown. Select one or more to import.</div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #f0f0ee', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              autoFocus
              style={{ width: '100%', height: 32, paddingLeft: 30, paddingRight: 10, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }}
              placeholder={`Search ${catLabel.toLowerCase()}...`}
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              {library.filter(i => i.category === category).length === 0
                ? `No ${catLabel.toLowerCase()} in library yet. Add them from the Library page.`
                : 'No results for your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                  <th style={{ width: 40, padding: '8px 12px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every(i => selected.has(i.id))}
                      onChange={e => {
                        if (e.target.checked) setSelected(new Set(filtered.map(i => i.id)))
                        else setSelected(new Set())
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>Name</th>
                  {category === 'Fabric' && <>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>Composition</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>GSM</th>
                    <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>Width"</th>
                  </>}
                  {category !== 'Fabric' && <>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>Specification</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>Packing</th>
                  </>}
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>Unit</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>Wastage</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lib => {
                  const on = selected.has(lib.id)
                  return (
                    <tr key={lib.id} onClick={() => toggle(lib.id)} style={{ cursor: 'pointer', background: on ? '#f0f7ff' : 'transparent' }}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                      <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #f0f0ee' }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(lib.id)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee' }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{lib.name}</div>
                        {lib.colour && <div style={{ fontSize: 10, color: '#9ca3af' }}>{lib.colour}</div>}
                      </td>
                      {category === 'Fabric' && <>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee', fontSize: 11, color: '#6b7280' }}>{lib.composition || '—'}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee', fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}>{lib.weight_gsm || '—'}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee', fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}>{lib.width_inches ? `${lib.width_inches}"` : '—'}</td>
                      </>}
                      {category !== 'Fabric' && <>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee', fontSize: 11, color: '#6b7280' }}>{lib.description || '—'}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee', fontSize: 11, color: '#6b7280' }}>{lib.packing_form || '—'}</td>
                      </>}
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee', fontSize: 11, fontFamily: 'monospace' }}>{lib.unit}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee', fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}>{lib.default_wastage}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            {selected.size > 0 ? `${selected.size} item${selected.size > 1 ? 's' : ''} selected` : 'Select items to import'}
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={selected.size === 0}>
            Add {selected.size > 0 ? selected.size : ''} Item{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Step3 component ─────────────────────────────────────────────────────
export default function Step3BOM({ orderId, orderData, onSaved, registerSave }) {
  const [items,       setItems]      = useState([])
  const [library,     setLibrary]    = useState([])
  const [saving,      setSaving]     = useState(false)
  const [saved,       setSaved]      = useState(false)
  const [activeTab,   setActive]     = useState('Fabric')
  const [showLib,     setShowLib]    = useState(false)
  const [usageConfig, setUsageConfig] = useState(null)
  const [suppliers,   setSuppliers]  = useState([])
  const [poData,      setPoData]     = useState({ colors: [], sizeGroups: [], allSizes: [] })

  const totalQty = orderData?.total_qty || 0

  useEffect(() => {
    if (orderId) { loadItems(); loadPoData() }
    supabase.from('library_items').select('*').order('name').then(({ data }) => setLibrary(data || []))
    supabase.from('suppliers').select('id,name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [orderId])

  async function loadItems() {
    const { data } = await supabase.from('bom_items').select('*').eq('order_id', orderId).order('sort_order')
    setItems(data || [])
  }

  async function loadPoData() {
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    if (!sgs?.length) return
    const { data: colors } = await supabase.from('size_group_colors').select('*').in('size_group_id', sgs.map(g => g.id)).order('sort_order')
    const { data: bd }     = await supabase.from('size_group_breakdown').select('*').in('size_group_id', sgs.map(g => g.id))

    const colorMap = {}
    colors?.forEach(c => { colorMap[c.id] = { name: c.color_name, qty: 0 } })
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

    setPoData({ colors: colorList, sizeGroups: sizeGroupList, allSizes: allSizeList })
  }

  const addBlank = (cat) => setItems(i => [...i, {
    _new: true, order_id: orderId, category: cat,
    name: '', detail: '', unit: 'yards', usage_rule: 'Generic',
    usage_data: null, base_qty: '', wastage: 5, notes: '',
    sort_order: i.length, _tempId: tempId(),
  }])

  const addFromLibrary = (libItems) => {
    setItems(i => [...i, ...libItems.map(lib => ({
      _new: true, order_id: orderId, category: lib.category,
      name: lib.name,
      detail: lib.category === 'Fabric'
        ? [lib.composition, lib.weight_gsm ? `${lib.weight_gsm}gsm` : null, lib.width_inches ? `${lib.width_inches}"` : null].filter(Boolean).join(', ')
        : lib.description || '',
      unit: lib.unit, usage_rule: 'Generic', usage_data: null,
      base_qty: '', wastage: lib.default_wastage || 5,
      notes: '', sort_order: i.length + libItems.indexOf(lib),
      _tempId: tempId(), library_item_id: lib.id,
    }))])
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

  const handleUsageSave = (itemIdx, usageData) => upd(itemIdx, 'usage_data', usageData)

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
      const total = Object.entries(ud).reduce((s, [n, cons]) => {
        const c = poData.colors.find(c => c.name === n)
        return s + (parseFloat(cons) || 0) * (c?.qty || 0) * (1 + wastage / 100)
      }, 0)
      return total > 0 ? total.toFixed(1) : null
    }
    if (rule === 'By Size Group') {
      const total = Object.entries(ud).reduce((s, [n, cons]) => {
        const g = poData.sizeGroups.find(x => x.name === n)
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

  // Tab-level stale count
  const tabStaleCount = (cat) => items.filter(i => i.category === cat && getStaleKeys(i, poData).length > 0).length

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #e8e8e6' }}>
        {TABLES.map(t => {
          const count = items.filter(i => i.category === t.key).length
          const stale = tabStaleCount(t.key)
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
              {stale > 0 && (
                <span title={`${stale} item${stale > 1 ? 's' : ''} with stale PO Matrix data`}
                  style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '1px 5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <AlertTriangle size={9} /> {stale}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, marginBottom: 12 }}>
          <thead>
            <tr>
              {['', 'Item Name', 'Detail / Spec', 'Unit', 'Usage Rule', 'Base Qty', 'Wastage %', 'Final Qty', ''].map((h, i) => (
                <th key={i} style={{ textAlign: i >= 5 && i <= 6 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 6px 8px', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabItems.length === 0 && (
              <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                No {activeTab.toLowerCase()} items yet.
              </td></tr>
            )}
            {tabItems.map(item => {
              const realIdx  = items.indexOf(item)
              const fqty     = calcFinalQty(item)
              const configured = isConfigured(item)
              const isGeneric  = !item.usage_rule || item.usage_rule === 'Generic'
              const staleKeys  = getStaleKeys(item, poData)
              const isStale    = staleKeys.length > 0

              return (
                <tr key={item.id || item._tempId}>
                  {/* Coverage dot */}
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0ee', width: 14 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isStale ? COVERAGE_COLOR.partial : configured ? COVERAGE_COLOR.full : COVERAGE_COLOR.none }} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 140 }}>
                    <input style={inp} value={item.name || ''} onChange={e => upd(realIdx, 'name', e.target.value)} placeholder="Item name" />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', minWidth: 160 }}>
                    <input style={inp} value={item.detail || ''} onChange={e => upd(realIdx, 'detail', e.target.value)} placeholder={activeTab === 'Fabric' ? 'e.g. 100%CO, 14oz, 58"' : 'e.g. #5 brass, antique'} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 80 }}>
                    <select style={sel} value={item.unit || 'yards'} onChange={e => upd(realIdx, 'unit', e.target.value)}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 160 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <select style={{ ...sel, flex: 1, color: !isGeneric ? '#2563eb' : undefined, fontWeight: !isGeneric ? 600 : undefined }}
                        value={item.usage_rule || 'Generic'}
                        onChange={e => {
                          const rule = e.target.value
                          upd(realIdx, 'usage_rule', rule)
                          upd(realIdx, 'usage_data', null)
                          setUsageConfig({ itemIdx: realIdx, rule, item: { ...item, usage_rule: rule, usage_data: null } })
                        }}>
                        {USAGE_RULES.map(r => <option key={r}>{r}</option>)}
                      </select>
                      {!isGeneric && (
                        <button
                          onClick={() => setUsageConfig({ itemIdx: realIdx, rule: item.usage_rule, item })}
                          title={isStale ? `${staleKeys.length} new item${staleKeys.length > 1 ? 's' : ''} from PO Matrix — click to update` : 'Configure usage'}
                          style={{ background: isStale ? '#fff7ed' : item.usage_data ? '#eff6ff' : '#fff7ed', border: `1px solid ${isStale ? '#fcd34d' : item.usage_data ? '#bfdbfe' : '#fed7aa'}`, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: '0 6px', height: 30, flexShrink: 0 }}>
                          {isStale
                            ? <AlertTriangle size={12} color="#f59e0b" />
                            : <Settings2 size={12} color={item.usage_data ? '#2563eb' : '#f97316'} />
                          }
                          {isStale && <span style={{ fontSize: 10, color: '#92400e', fontWeight: 700 }}>+{staleKeys.length}</span>}
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 80 }}>
                    {isGeneric
                      ? <input style={{ ...inp, textAlign: 'right' }} type="number" value={item.base_qty || ''} onChange={e => upd(realIdx, 'base_qty', e.target.value)} placeholder="0" />
                      : <span style={{ fontSize: 11, color: '#9ca3af', display: 'block', textAlign: 'right', paddingRight: 8 }}>varies</span>
                    }
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', width: 64 }}>
                    <input style={{ ...inp, textAlign: 'right' }} type="number" value={item.wastage || ''} onChange={e => upd(realIdx, 'wastage', e.target.value)} />
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
        {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
      </div>

      {/* Library Modal */}
      {showLib && (
        <LibraryModal
          category={activeTab}
          library={library}
          onAdd={addFromLibrary}
          onClose={() => setShowLib(false)}
        />
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
