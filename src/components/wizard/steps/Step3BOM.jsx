import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { markTabUpdated } from '../../../lib/tabNotices'
import { Plus, Trash2, Check, Library, X, Settings2, AlertTriangle, Search, Scissors, PackageOpen } from 'lucide-react'

import { configuredCell, configuredQuantity, USAGE_RULES, buildBOMMatrix, calculateBOMFinalQty, normalizeUsageCell, normalizeUsageData } from '../../../lib/bomUsage'
const UNITS = ['yards', 'meters', 'cm', 'inch', 'ft', 'pcs', 'kg', 'gram', 'cone', 'set', 'sht', 'ctn', 'roll', 'ltr']
const PACKING_FORMS = ['Cone', 'Roll', 'Spool', 'Box', 'Bag', 'Carton', 'Reel', 'Bundle', 'Piece']
const TABLES = [
  { key: 'Fabric',         label: 'Fabrics' },
  { key: 'Stitching Trim', label: 'Stitching Trims' },
  { key: 'Packing Trim',   label: 'Packing Trims' },
]
const COVERAGE_COLOR = { full: '#16a34a', partial: '#f59e0b', none: '#e5e7eb' }

function tempId() { return Math.random().toString(36).slice(2) }

function getStaleKeys(item, poData) {
  const rule = item.usage_rule
  const ud   = normalizeUsageData(item.usage_data)
  if (!rule || rule === 'Generic' || !ud) return []
  if (rule === 'By Color') return poData.colors.filter(c => c.qty > 0).map(c => c.name).filter(n => !(n in ud))
  if (rule === 'By Size Group') return poData.sizeGroups.filter(g => g.qty > 0).map(g => g.name).filter(n => !(n in ud))
  if (rule === 'By Individual Sizes') return poData.allSizes.filter(s => s.qty > 0).map(s => s.size).filter(s => !(s in ud))
  if (rule === 'By Batch') {
    const batches = ud.__batches || []
    const assigned = batches.flatMap(b => (b.cells || []).map(c => `${c.sgName}||${c.colorName}||${c.size || ''}`))
    return (poData.sgMatrix || []).flatMap(sg => sg.colors.flatMap(c => (c.sizes || []).filter(sz => sz.qty > 0).map(sz => `${sg.sgName}||${c.colorName}||${sz.size}`))).filter(k => !assigned.includes(k) && !assigned.includes(k.split('||').slice(0, 2).join('||') + '||'))
  }
  if (rule === 'Configure Own') {
    if (ud.__matrix) {
      return (poData.sgMatrix || []).flatMap(group => group.colors.flatMap(color => {
        const row = ud.__matrix.find(entry => entry.sgName === group.sgName && entry.colorName === color.colorName)
        return color.sizes.filter(size => {
          const cell = configuredCell(row, size.size)
          return size.qty > 0 && !cell?.na && !(Number(cell?.consumption) > 0)
        }).map(size => [group.sgName, color.colorName, size.size].join(' / '))
      }))
    }
    const groups = ud.__groups || []
    const assigned = groups.flatMap(g => g.sizes)
    return poData.allSizes.filter(s => s.qty > 0).map(s => s.size).filter(s => !assigned.includes(s))
  }
  return []
}

// ── Usage Config Modal ────────────────────────────────────────────────────────
export function UsageModal({ config, onClose, onSave, poData, orderData }) {
  const { item, rule } = config
  const wastage = parseFloat(item.wastage) || 0

  const [data, setData] = useState(() => {
    if (rule === 'Configure Own' || rule === 'By Batch') return {}
    const src = normalizeUsageData(item.usage_data)
    const out = {}
    Object.entries(src).forEach(([k, v]) => {
      if (k.startsWith('_')) return
      out[k] = normalizeUsageCell(v)
    })
    if (rule === 'Generic' && Number(item.base_qty) > 0 && !out.generic?.na) {
      out.generic = { value: item.base_qty, na: false }
    }
    return out
  })
  const [matrixData, setMatrixData] = useState(() => {
    if (rule !== 'Configure Own') return {}
    const saved = normalizeUsageData(item.usage_data)
    const rows = saved.__matrix ?? (poData.sgMatrix || []).flatMap(group => group.colors.map(color => ({
      sgName: group.sgName, colorName: color.colorName,
      overrides: color.sizes.flatMap(({size}) => {
        const matches = (saved.__groups || []).filter(entry => entry.sizes?.includes(size))
        return matches.length ? [{size, consumption: matches.reduce((sum, entry) => sum + Number(entry.consumption || 0), 0)}] : []
      }),
    })))
    return Object.fromEntries(rows.map(row => [JSON.stringify([row.sgName, row.colorName]), row]))
  })
  const [expanded, setExpanded] = useState({})
  const [batchData, setBatchData] = useState(() => {
    if (rule !== 'By Batch') return []
    const existing = normalizeUsageData(item.usage_data).__batches || []
    return existing.length ? existing.map((b, i) => ({ name: b.name || `Batch ${i + 1}`, consumption: b.consumption ?? '', cells: Array.isArray(b.cells) ? b.cells : [] })) : [{ name: 'Batch 1', consumption: '', cells: [] }]
  })
  const [packingQty, setPackingQty] = useState(() => normalizeUsageData(item.usage_data)._packing_qty || '')
  const [packingUnit, setPackingUnit] = useState(() => normalizeUsageData(item.usage_data)._packing_unit || '')
  const genericCell = normalizeUsageCell(data.generic)

  const fmtQty = (consumption, qty, na = false) => {
    if (na) return null
    const c = parseFloat(consumption) || 0
    const q = parseFloat(qty) || 0
    if (!c || !q) return null
    return (c * q * (1 + wastage / 100)).toFixed(2)
  }

  const inp = { height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' }
  const TH = ({ children, right }) => <th style={{ textAlign: right ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>{children}</th>

  function getUsageData() {
    if (rule === 'Generic') return { generic: genericCell }
    if (rule === 'Configure Own') {
      const matrix = Object.values(matrixData).filter(row => row.na || row.consumption !== '' && row.consumption != null || row.overrides?.length)
      return { __matrix: matrix }
    }
    if (rule === 'By Batch') {
      return { __batches: batchData.map((b, i) => ({
        name: b.name || 'Batch ' + (i + 1), consumption: b.consumption || '', cells: b.cells || [],
      })).filter(b => b.cells.length || b.consumption) }
    }
    return Object.fromEntries(Object.entries(data).map(([key, cell]) => [key, normalizeUsageCell(cell)]))
  }

  const totalFQ = calculateBOMFinalQty({ usage_rule: rule, usage_data: getUsageData(), wastage }, {
    poData, totalQty: orderData?.total_qty ?? poData.allSizes.reduce((sum, size) => sum + size.qty, 0), round: false,
  })
  const packsNeeded = totalFQ && packingQty ? Math.ceil(totalFQ / parseFloat(packingQty)) : null

  const handleSave = () => {
    const usageData = getUsageData()
    if (rule === 'By Batch') {
      const seen = new Set()
      for (const batch of usageData.__batches) {
        for (const cell of batch.cells) {
          const key = JSON.stringify([cell.sgName, cell.colorName, cell.size || ''])
          if (seen.has(key)) {
            alert([cell.sgName, cell.colorName, cell.size].filter(Boolean).join(' / ') + ' is already used in another batch.')
            return
          }
          seen.add(key)
        }
      }
    }
    if (packingQty) usageData._packing_qty = packingQty
    if (packingUnit) usageData._packing_unit = packingUnit
    onSave(config.itemIdx, usageData)
    onClose()
  }

  const [sameForSizes, setSameForSizes] = useState(false)
  const [allSizeRate, setAllSizeRate] = useState('')
  const mergedColors = poData.colors.map(c => c.name)
  const mergedGroups = poData.sizeGroups.map(g => g.name)
  const mergedSizes  = poData.allSizes.map(s => s.size)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Configure Usage — {rule}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{[orderData?.style_number, orderData?.factory_ref].filter(Boolean).join(' · ')} | {[item.name, item.specification || item.detail].filter(Boolean).join(' · ') || 'BOM Item'} · Wastage {wastage}%</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {rule === 'Generic' && (
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>One consumption value applies to all sizes and colours.</div>
              <label style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }}>Consumption / pc</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: genericCell.na ? '#92400e' : '#6b7280', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={genericCell.na} onChange={e => setData({ generic: { value: e.target.checked ? '' : (genericCell.value || ''), na: e.target.checked } })} />
                  N/A
                </label>
                <input style={{ ...inp, width: 140, textAlign: 'right', opacity: genericCell.na ? 0.55 : 1 }} type="number" step="0.01"
                  value={genericCell.value || ''} onChange={e => setData({ generic: { value: e.target.value, na: false } })} placeholder="0.00" autoFocus disabled={genericCell.na} />
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
              <><div>{rule === 'By Individual Sizes' && <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <label><input type="checkbox" checked={sameForSizes} onChange={event => {
                  setSameForSizes(event.target.checked)
                  setAllSizeRate('')
                }}/> Add same for all sizes</label>
                {sameForSizes && <input type="number" min="0" step="any" aria-label="Consumption per piece for all sizes"
                  placeholder="Cons./pc" style={{...inp,width:96}} value={allSizeRate} onChange={event => {
                    const value = event.target.value
                    setAllSizeRate(value)
                    setData(previous => ({...previous,...Object.fromEntries(keys.filter(key => !normalizeUsageCell(previous[key]).na)
                      .map(key => [key,{value,na:false}]))}))
                  }}/>}
              </div>}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><TH>{label}</TH><TH right>Qty</TH><TH right>Cons./pc</TH><TH right>Final Qty</TH></tr></thead>
                <tbody>
                  {keys.map(k => {
                    const cell = normalizeUsageCell(data[k])
                    const val = cell.value || ''
                    const isNA = !!cell.na
                    const fq  = fmtQty(val, qtys[k], isNA)
                    const isNew = !(k in normalizeUsageData(item.usage_data))
                    return (
                      <tr key={k}>
                        <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12, fontWeight: 500 }}>
                          {k}{isNew && <span style={{ fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 6 }}>NEW</span>}
                        </td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, color: '#6b7280' }}>{qtys[k]?.toLocaleString()}</td>
                        <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', width: 150 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: isNA ? '#92400e' : '#6b7280', whiteSpace: 'nowrap' }}>
                              <input type="checkbox" checked={isNA} onChange={e => setData(d => ({ ...d, [k]: { value: e.target.checked ? '' : (sameForSizes ? allSizeRate : normalizeUsageCell(d[k]).value || ''), na: e.target.checked } }))} />
                              N/A
                            </label>
                            <input style={{ ...inp, textAlign: 'right', width: 96, borderColor: isNew && !val && !isNA ? '#fcd34d' : '#e5e7eb', opacity: isNA ? 0.55 : 1 }}
                              type="number" step="0.01" value={val} placeholder="0.00" disabled={isNA || sameForSizes}
                              onChange={e => setData(d => ({ ...d, [k]: { value: e.target.value, na: false } }))} autoFocus={isNew} />
                          </div>
                        </td>
                        <td style={{ padding: '5px 0 5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', fontSize: 11, fontWeight: 700, color: fq ? '#1a1a2e' : '#d1d5db' }}>
                          {isNA ? 'N/A' : (fq ? parseFloat(fq).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></>
            )
          })()}
          {rule === 'By Batch' && (
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>Create batches from Size Group × Wash. A combination can be used in one batch only.</div>
              {!(poData.sgMatrix || []).length ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>No PO Matrix data yet. Complete Step 2 first.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {batchData.map((batch, batchIdx) => {
                    const usedElsewhere = new Set(batchData.flatMap((b, ix) => ix === batchIdx ? [] : (b.cells || []).map(c => `${c.sgName}||${c.colorName}||${c.size || ''}`)))
                    const selectedHere = new Set((batch.cells || []).map(c => `${c.sgName}||${c.colorName}||${c.size || ''}`))
                    const batchQty = (batch.cells || []).reduce((sq, cell) => {
                      const sg = (poData.sgMatrix || []).find(x => x.sgName === cell.sgName)
                      const c = sg?.colors.find(x => x.colorName === cell.colorName)
                      if (cell.size) return sq + (parseFloat((c?.sizes || []).find(sz => sz.size === cell.size)?.qty) || 0)
                      return sq + (parseFloat(c?.qty) || 0)
                    }, 0)
                    const finalQty = (parseFloat(batch.consumption) || 0) * batchQty * (1 + wastage / 100)
                    const toggleCell = (sgName, colorName, size) => {
                      const key = `${sgName}||${colorName}||${size || ''}`
                      if (usedElsewhere.has(key)) return
                      setBatchData(prev => prev.map((b, ix) => {
                        if (ix !== batchIdx) return b
                        const has = (b.cells || []).some(c => c.sgName === sgName && c.colorName === colorName && c.size === size)
                        const cells = has ? (b.cells || []).filter(c => !(c.sgName === sgName && c.colorName === colorName && c.size === size)) : [...(b.cells || []), { sgName, colorName, size }]
                        return { ...b, cells }
                      }))
                    }
                    return (
                      <div key={batchIdx} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                          <input style={{ ...inp, flex: 1 }} value={batch.name} onChange={e => setBatchData(prev => prev.map((b, ix) => ix === batchIdx ? { ...b, name: e.target.value } : b))} placeholder={`Batch ${batchIdx + 1}`} />
                          <input style={{ ...inp, width: 110, textAlign: 'right' }} type="number" step="0.01" value={batch.consumption || ''} onChange={e => setBatchData(prev => prev.map((b, ix) => ix === batchIdx ? { ...b, consumption: e.target.value } : b))} placeholder="Cons./pc" />
                          <div style={{ fontSize: 11, fontWeight: 700, minWidth: 86, textAlign: 'right' }}>{finalQty ? finalQty.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}</div>
                          {batchData.length > 1 && <button className="btn btn-ghost" onClick={() => setBatchData(prev => prev.filter((_, ix) => ix !== batchIdx))}>Remove</button>}
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {(poData.sgMatrix || []).map(sg => (
                            <div key={sg.sgName} style={{ borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6 }}>{sg.sgName}</div>
                              <div style={{ display: 'grid', gap: 8 }}>
                                {sg.colors.map(c => (
                                  <div key={`${sg.sgName}||${c.colorName}`}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>{c.colorName}</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {(c.sizes || []).map(sz => {
                                        const key = `${sg.sgName}||${c.colorName}||${sz.size}`
                                        const disabled = usedElsewhere.has(key) || !(parseFloat(sz.qty) > 0)
                                        return <button key={key} type="button" onClick={() => toggleCell(sg.sgName, c.colorName, sz.size)} disabled={disabled} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: selectedHere.has(key) ? '1px solid #2563eb' : '1px solid #e5e7eb', background: selectedHere.has(key) ? '#eff6ff' : disabled ? '#f3f4f6' : '#fff', color: disabled ? '#9ca3af' : '#111827', cursor: disabled ? 'not-allowed' : 'pointer' }}>Size {sz.size} ({sz.qty || 0})</button>
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  <button className="btn btn-ghost" onClick={() => setBatchData(prev => [...prev, { name: `Batch ${prev.length + 1}`, consumption: '', cells: [] }])}>+ Add Batch</button>
                </div>
              )}
            </div>
          )}
          {rule === 'Configure Own' && (
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>Set a default for each wash. Expand it to change consumption or mark an individual size N/A.</div>
              {!(poData.sgMatrix || []).length
                ? <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, background: '#fafaf8', borderRadius: 6, textAlign: 'center' }}>No PO Matrix data yet. Complete Step 2 first.</div>
                : (poData.sgMatrix || []).map(sg => (
                  <div key={sg.sgName} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#1a1a2e', padding: '4px 10px', borderRadius: 5, marginBottom: 8, display: 'inline-block', letterSpacing: '0.4px', textTransform: 'uppercase' }}>{sg.sgName}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><TH>Colour / Wash</TH><TH right>Qty</TH><TH right>Cons./pc</TH><TH right>Final Qty</TH></tr></thead>
                      <tbody>
                        {sg.colors.map(c => {
                          const key = JSON.stringify([sg.sgName, c.colorName])
                          const row = matrixData[key] || { sgName: sg.sgName, colorName: c.colorName }
                          const update = (size, patch) => {
                            setMatrixData(previous => {
                              const current = previous[key] || row
                              if (size == null) return { ...previous, [key]: { ...current, ...patch } }
                              const overrides = (current.overrides || []).filter(entry => entry.size !== size)
                              if (patch) overrides.push({ size, ...patch })
                              return { ...previous, [key]: { ...current, overrides } }
                            })
                          }
                          const controls = (size, label) => {
                            const own = size == null ? row : row.overrides?.find(entry => entry.size === size)
                            const effective = own || row
                            return <div style={{display:'flex', alignItems:'center', justifyContent:'end', gap:8}}>
                              <label><input type="checkbox" checked={!!effective.na} aria-label={label + ' N/A'}
                                onChange={e => update(size, {na:e.target.checked, consumption:e.target.checked ? '' : effective.consumption ?? ''})}/> N/A</label>
                              <input type="number" min="0" step="any" disabled={!!effective.na} style={{...inp,width:88,textAlign:'right'}}
                                aria-label={label + ' consumption per piece'} value={effective.consumption ?? ''} placeholder="Cons./pc"
                                onChange={e => update(size, size != null && !e.target.value ? null : {na:false, consumption:e.target.value})}/>
                              {size != null && own && <button type="button" onClick={() => update(size,null)}>Use default</button>}
                            </div>
                          }
                          const label = sg.sgName + ' / ' + c.colorName
                          const total = configuredQuantity(row,c.qty,c.sizes) * (1+wastage/100)
                          return <React.Fragment key={key}><tr>
                            <td><button type="button" aria-expanded={!!expanded[key]} onClick={() => setExpanded(prev => ({...prev,[key]:!prev[key]}))}>
                              {expanded[key] ? '▾' : '▸'} {c.colorName} · {c.sizes.length} sizes</button></td>
                            <td align="right">{c.qty}</td><td>{controls(null,label)}</td><td align="right">{Number(total.toFixed(2))}</td>
                          </tr>{expanded[key] && c.sizes.map(({size,qty}) => {
                            const cell = configuredCell(row,size)
                            return <tr key={size}><td style={{paddingLeft:18}}>{size}</td><td align="right">{qty}</td>
                              <td>{controls(size,label + ' / ' + size)}</td><td align="right">{cell.na ? 'N/A' : fmtQty(cell.consumption,qty) ?? '—'}</td></tr>
                          })}</React.Fragment>
                        })}
                      </tbody>
                    </table>
                  </div>
                ))
              }
            </div>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', background: '#fafaf8', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Packing</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ ...inp, width: 100, textAlign: 'right' }} type="number" step="1" value={packingQty} placeholder="qty / pack" onChange={e => setPackingQty(e.target.value)} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>{item.unit || 'units'} per</span>
            <select style={{ ...inp, width: 100, cursor: 'pointer' }} value={packingUnit} onChange={e => setPackingUnit(e.target.value)}>
              <option value="">— pack type —</option>
              {PACKING_FORMS.map(p => <option key={p}>{p}</option>)}
            </select>
            {packsNeeded !== null && (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', background: '#eff6ff', borderRadius: 6, padding: '4px 12px', border: '1px solid #bfdbfe' }}>
                = {packsNeeded.toLocaleString()} {packingUnit || 'packs'} needed
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

// ── Library picker modal ──────────────────────────────────────────────────────
function LibraryModal({ category, library, onAdd, onClose, onCreated }) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(new Set())
  const [localLibrary, setLocalLibrary] = useState(library)
  const [quickAdd, setQuickAdd] = useState(false)
  const [newItem, setNewItem] = useState({})
  const [quickSaving, setQuickSaving] = useState(false)

  useEffect(() => setLocalLibrary(library), [library])
  const setNew = (k,v) => setNewItem(f => ({...f,[k]:v}))
  const openQuickAdd = () => {
    setNewItem({ category, unit: category === 'Fabric' ? 'meters' : 'pcs', default_wastage: category === 'Fabric' ? 5 : 2 })
    setQuickAdd(true)
  }
  const saveQuickAdd = async () => {
    if (!newItem.name?.trim()) return
    setQuickSaving(true)
    const payload = { ...newItem, name:newItem.name.trim(), category }
    const { data, error } = await supabase.from('library_items').insert([payload]).select().single()
    setQuickSaving(false)
    if (error) { window.alert(error.message || 'Could not create library item'); return }
    setLocalLibrary(prev => [...prev, data].sort((a,b)=>(a.name||'').localeCompare(b.name||'')))
    onCreated?.(data)
    setSelected(prev => new Set([...prev, data.id]))
    setSearch('')
    setQuickAdd(false)
  }

  const filtered = localLibrary
    .filter(i => i.category === category)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.description || '').toLowerCase().includes(search.toLowerCase()))

  const toggle = (id) => setSelected(s => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next })
  const handleAdd = () => { onAdd(filtered.filter(i => selected.has(i.id))); onClose() }
  const catLabel = category === 'Fabric' ? 'Fabrics' : category === 'Stitching Trim' ? 'Stitching Trims' : 'Packing Trims'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 680, maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Add from Library — {catLabel}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Only {catLabel.toLowerCase()} are shown. Select one or more to import.</div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #f0f0ee', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input autoFocus style={{ width: '100%', height: 32, paddingLeft: 30, paddingRight: 10, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }}
              placeholder={`Search ${catLabel.toLowerCase()}...`} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              {localLibrary.filter(i => i.category === category).length === 0 ? `No ${catLabel.toLowerCase()} in library yet.` : 'No results for your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                  <th style={{ width: 40, padding: '8px 12px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#9ca3af', borderBottom: '1px solid #f0f0ee', textTransform: 'uppercase' }}>
                    <input type="checkbox" checked={filtered.length > 0 && filtered.every(i => selected.has(i.id))} onChange={e => { if (e.target.checked) setSelected(new Set(filtered.map(i => i.id))); else setSelected(new Set()) }} style={{ cursor: 'pointer' }} />
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
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0ee', fontSize: 11, textAlign: 'right', fontFamily: 'monospace' }}>{lib.weight || '—'}</td>
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
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={openQuickAdd}><Plus size={12}/> New {category === 'Fabric' ? 'Fabric' : category === 'Stitching Trim' ? 'Stitching Trim' : 'Packing Trim'}</button>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{selected.size > 0 ? `${selected.size} item${selected.size > 1 ? 's' : ''} selected` : 'Select items to import'}</span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={selected.size === 0}>Add {selected.size > 0 ? selected.size : ''} Item{selected.size !== 1 ? 's' : ''}</button>
        </div>
      </div>
      {quickAdd && <div style={{position:'fixed',inset:0,zIndex:650,background:'rgba(0,0,0,.38)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{width:540,maxWidth:'92vw',maxHeight:'82vh',overflowY:'auto',background:'#fff',borderRadius:12,boxShadow:'0 24px 70px rgba(0,0,0,.28)'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid #eee',display:'flex',alignItems:'center'}}><div style={{fontSize:14,fontWeight:700}}>New {category === 'Fabric' ? 'Fabric' : category === 'Stitching Trim' ? 'Stitching Trim' : 'Packing Trim'}</div><div style={{flex:1}}/><button className="btn btn-ghost" onClick={()=>setQuickAdd(false)}><X size={15}/></button></div>
          <div style={{padding:20,display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{gridColumn:'1 / -1'}}><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>NAME *</label><input className="input" autoFocus value={newItem.name||''} onChange={e=>setNew('name',e.target.value)}/></div>
            {category==='Fabric' ? <><div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>COMPOSITION</label><input className="input" value={newItem.composition||''} onChange={e=>setNew('composition',e.target.value)}/></div><div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>COLOUR / BASE</label><input className="input" value={newItem.colour||''} onChange={e=>setNew('colour',e.target.value)}/></div><div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>WEIGHT (GSM/OZ)</label><input className="input" value={newItem.weight||''} onChange={e=>setNew('weight',e.target.value)}/></div><div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>WIDTH (INCHES)</label><input className="input" type="number" value={newItem.width_inches||''} onChange={e=>setNew('width_inches',e.target.value)}/></div><div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>WEAVE / CONSTRUCTION</label><input className="input" value={newItem.weave_construction||''} onChange={e=>setNew('weave_construction',e.target.value)}/></div></> : <><div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>SPECIFICATION</label><input className="input" value={newItem.description||''} onChange={e=>setNew('description',e.target.value)}/></div><div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>PACKING FORM</label><select className="select" value={newItem.packing_form||''} onChange={e=>setNew('packing_form',e.target.value)}><option value="">—</option>{PACKING_FORMS.map(x=><option key={x}>{x}</option>)}</select></div></>}
            <div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>UNIT</label><select className="select" value={newItem.unit||''} onChange={e=>setNew('unit',e.target.value)}>{(category==='Fabric'?['meters','yards','cm','inch','ft']:UNITS).map(x=><option key={x}>{x}</option>)}</select></div><div><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>DEFAULT WASTAGE %</label><input className="input" type="number" value={newItem.default_wastage??''} onChange={e=>setNew('default_wastage',e.target.value)}/></div>
            <div style={{gridColumn:'1 / -1'}}><label style={{fontSize:11,fontWeight:600,color:'#6b7280'}}>NOTES</label><input className="input" value={newItem.notes||''} onChange={e=>setNew('notes',e.target.value)}/></div>
          </div>
          <div style={{padding:'12px 20px',borderTop:'1px solid #eee',display:'flex',justifyContent:'flex-end',gap:8}}><button className="btn btn-secondary" onClick={()=>setQuickAdd(false)}>Cancel</button><button className="btn btn-primary" disabled={quickSaving||!newItem.name?.trim()} onClick={saveQuickAdd}>{quickSaving?'Saving…':'Save & Select'}</button></div>
        </div>
      </div>}
    </div>
  )
}

// ── Main Step3 ────────────────────────────────────────────────────────────────
export default function Step3BOM({ orderId, orderData, onSaved, registerSave }) {
  const [items,       setItems]      = useState([])
  const [showTrimPackages, setShowTrimPackages] = useState(false)
  const [trimPackages, setTrimPackages] = useState([])
  const [selectedPackage, setSelectedPackage] = useState('')
  const [packageSelection, setPackageSelection] = useState(new Set())
  const [library,     setLibrary]    = useState([])
  const [saving,      setSaving]     = useState(false)
  const [saved,       setSaved]      = useState(false)
  const [activeTab,   setActive]     = useState('Fabric')
  const [showLib,     setShowLib]    = useState(false)
  const [usageConfig, setUsageConfig] = useState(null)
  const [suppliers,   setSuppliers]  = useState([])
  const [poData,      setPoData]     = useState({ colors: [], sizeGroups: [], allSizes: [], sgMatrix: [] })

  const totalQty       = orderData?.total_qty || 0
  const excessCutPct   = parseFloat(orderData?.excess_cutting_pct) || 0
  const cuttingQtyMult = 1 + excessCutPct / 100

  useEffect(() => {
    if (orderId) { loadItems(); loadPoData() }
  }, [orderId, orderData?.step_po_matrix, orderData?.total_qty])

  useEffect(() => {
    supabase.from('library_items').select('*').order('name').then(({ data }) => setLibrary(data || []))
    supabase.from('suppliers').select('id,name').order('name').then(({ data }) => setSuppliers(data || []))
  }, [orderId])

  // Also reload excess cutting % if orderData changes
  useEffect(() => {}, [orderData?.excess_cutting_pct])

  async function loadItems() {
    const { data } = await supabase.from('bom_items').select('*').eq('order_id', orderId).order('sort_order')
    // Parse usage_data if it's a JSON string
    const parsed = (data || []).map(item => {
      if (item.usage_data && typeof item.usage_data === 'string') {
        try {
          return { ...item, usage_data: JSON.parse(item.usage_data) }
        } catch (e) {
          return { ...item, usage_data: {} }
        }
      }
      return item
    })
    setItems(parsed)
  }

  async function loadPoData() {
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    if (!sgs?.length) { setPoData({ colors: [], sizeGroups: [], allSizes: [], sgMatrix: [] }); return }
    const { data: colors } = await supabase.from('size_group_colors').select('*').in('size_group_id', sgs.map(g => g.id)).order('sort_order')
    const { data: bd }     = await supabase.from('size_group_breakdown').select('*').in('size_group_id', sgs.map(g => g.id))

    setPoData(buildBOMMatrix(sgs, colors || [], bd || []))
  }

  const addBlank = (cat) => setItems(i => [...i, {
    _new: true, order_id: orderId, category: cat,
    name: '', detail: '', specification: '', unit: 'yards', usage_rule: 'Generic',
    usage_data: null, base_qty: '', wastage: 5, notes: '',
    sort_order: i.length, _tempId: tempId(), use_cutting_qty: false,
  }])

  const addFromLibrary = (libItems) => {
    setItems(i => [...i, ...libItems.map(lib => ({
      _new: true, order_id: orderId, category: lib.category,
      name: lib.name,
      specification: lib.category === 'Fabric' ? (lib.colour || '') : '',
      detail: lib.category === 'Fabric'
        ? [lib.composition, lib.weight ? lib.weight : null, lib.width_inches ? `${lib.width_inches}"` : null].filter(Boolean).join(', ')
        : lib.description || '',
      unit: lib.unit, usage_rule: 'Generic',
      usage_data: lib.packing_form ? { _packing_unit: lib.packing_form } : null,
      base_qty: '', wastage: lib.default_wastage || 5,
      notes: '', sort_order: i.length + libItems.indexOf(lib),
      _tempId: tempId(), library_item_id: lib.id, use_cutting_qty: false,
    }))])
  }

  const openTrimPackages = async () => {
    if (!orderData?.buyer_id) { window.alert('Select a Buyer in General Info first.'); return }
    const { data, error } = await supabase.from('bom_presets').select('*, bom_preset_items(*, library_items(*))').eq('buyer_id', orderData.buyer_id).order('name')
    if (error) { window.alert(error.message); return }
    setTrimPackages(data || []); setSelectedPackage(''); setPackageSelection(new Set()); setShowTrimPackages(true)
  }
  const choosePackage = (id) => {
    setSelectedPackage(id)
    const p = trimPackages.find(x => x.id === id)
    setPackageSelection(new Set((p?.bom_preset_items || []).map(x => x.library_item_id).filter(Boolean)))
  }
  const importTrimPackage = () => {
    const p = trimPackages.find(x => x.id === selectedPackage); if (!p) return
    const existing = new Set(items.map(x => x.library_item_id).filter(Boolean))
    const libs = (p.bom_preset_items || []).map(x => x.library_items).filter(Boolean).filter(x => packageSelection.has(x.id) && !existing.has(x.id))
    addFromLibrary(libs); setShowTrimPackages(false)
  }

  const upd = (idx, k, v) => setItems(its => its.map((it, i) => i === idx ? { ...it, [k]: v } : it))
  const updFabricLabel = (idx, value) => {
    const raw = String(value || '')
    const splitAt = raw.indexOf(' - ')
    const name = splitAt === -1 ? raw.trim() : raw.slice(0, splitAt).trim()
    const shade = splitAt === -1 ? '' : raw.slice(splitAt + 3).trim()
    setItems(its => its.map((it, i) => i === idx ? { ...it, name, specification: shade } : it))
  }

  const remove = async (idx) => {
    const item = items[idx]
    if (item.id) await supabase.from('bom_items').delete().eq('id', item.id)
    setItems(its => its.filter((_, i) => i !== idx))
  }

  const orderIdRef = useRef(orderId)
  useEffect(() => { orderIdRef.current = orderId }, [orderId])

  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const calcFinalQtyRef = useRef(() => null)
  const doSave = useCallback(async () => {
    const currentOrderId = orderIdRef.current
    if (!currentOrderId) throw new Error('No order ID — save Step 1 first')
    const current = itemsRef.current.filter(it => it.name?.trim())
    // Delete-and-reinsert prevents duplication from any prior partial saves
    await supabase.from('bom_items').delete().eq('order_id', currentOrderId)
    if (current.length) {
      const rows = current.map((item, idx) => {
        let usageDataToSave = item.usage_data || null
        // Stringify usage_data if it's an object (for complex rules like By Batch, Configure Own)
        if (usageDataToSave && typeof usageDataToSave === 'object') {
          usageDataToSave = JSON.stringify(usageDataToSave)
        }
        return {
          order_id:        currentOrderId,
          library_item_id: item.library_item_id || null,
          name:            item.name?.trim() || '',
          category:        item.category || '',
          detail:          item.detail || null,
          specification:   item.specification || null,
          unit:            item.unit || 'yards',
          supplier_id:     item.supplier_id || null,
          usage_rule:      item.usage_rule || 'Generic',
          usage_data:      usageDataToSave,
          final_qty:       (() => { const value = calcFinalQtyRef.current(item); return value == null ? null : Number(value) })(),
          base_qty:        item.base_qty !== '' && item.base_qty != null ? Number(item.base_qty) : null,
          wastage:         item.wastage !== '' && item.wastage != null ? Number(item.wastage) : 5,
          custom_usage:    item.custom_usage || null,
          notes:           item.notes || null,
          sort_order:      idx,
          use_cutting_qty: !!item.use_cutting_qty,
        }
      })
      const { data: inserted, error } = await supabase.from('bom_items').insert(rows).select()
      if (error) throw new Error(`BOM save failed: ${error.message}`)
      // Update local state with new IDs
      if (inserted) {
        setItems(its => {
          const named = its.filter(it => it.name?.trim())
          return its.map(it => {
            if (!it.name?.trim()) return it
            const match = inserted[named.indexOf(it)]
            return match ? match : it
          })
        })
      }
    }
    await supabase.from('orders').update({ step_bom: true }).eq('id', currentOrderId)
    onSaved(currentOrderId, { step_bom: true })
    markTabUpdated('purchasingPage', 'material')
  }, [orderId])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleUsageSave = (itemIdx, usageData) => setItems(current => current.map((item, index) =>
    index !== itemIdx ? item : {
      ...item,
      usage_data: usageData,
      base_qty: item.usage_rule === 'Generic' ? normalizeUsageCell(usageData.generic).value : item.base_qty,
    }))

  const calcFinalQty = item => calculateBOMFinalQty(item, { totalQty, poData, excessCutPct, cuttingQtyMult })

  calcFinalQtyRef.current = calcFinalQty

  // Show the weighted average per garment for configured variable usage.
  // The exact unrounded final requirement remains calculated from the usage matrix.
  const weightedBase = (item) => {
    const rule = item.usage_rule || 'Generic'
    if (rule === 'Generic') return null
    const final = Number(calcFinalQty(item))
    const qty = Number(totalQty)
    const factor = 1 + (Number(item.wastage) || 0) / 100
    if (!Number.isFinite(final) || final <= 0 || qty <= 0 || factor <= 0) return null
    return (final / factor / qty).toLocaleString(undefined, { maximumFractionDigits: 3 })
  }
  const isConfigured = (item) => {
    if (!item.name?.trim()) return false
    const rule = item.usage_rule || 'Generic'
    if (rule === 'Generic') return Number(item.base_qty) > 0 || Number(normalizeUsageCell(normalizeUsageData(item.usage_data).generic).value) > 0
    if (!Number(calcFinalQty(item)) || getStaleKeys(item, poData).length) return false
    const ud = normalizeUsageData(item.usage_data)
    if (['By Color','By Size Group','By Individual Sizes'].includes(rule)) {
      const names = rule === 'By Color' ? poData.colors.filter(c=>c.qty>0).map(c=>c.name) : rule === 'By Size Group' ? poData.sizeGroups.filter(g=>g.qty>0).map(g=>g.name) : poData.allSizes.filter(sz=>sz.qty>0).map(sz=>sz.size)
      return names.length > 0 && names.every(k=>{const cell=normalizeUsageCell(ud[k]);return cell.na || Number(cell.value)>0})
    }
    return true
  }
  const tabItems = items.filter(i => i.category === activeTab)
  const inp = { width: '100%', minWidth: 0, height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', boxSizing: 'border-box' }
  const sel = { ...inp, cursor: 'pointer', padding: '0 22px 0 8px', fontSize: 10.5 }
  const tabStaleCount = (cat) => items.filter(i => i.category === cat && getStaleKeys(i, poData).length > 0).length
  const showCutCol = excessCutPct > 0
  const columns = showCutCol
    ? [
        { key: 'status', width: '2%' },
        { key: 'name', width: '18%' },
        { key: 'detail', width: '24%' },
        { key: 'unit', width: '10%' },
        { key: 'usage', width: '18%' },
        { key: 'base', width: '8%' },
        { key: 'wastage', width: '8%' },
        { key: 'final', width: '9%' },
        { key: 'cut', width: '2%' },
        { key: 'actions', width: '1%' },
      ]
    : [
        { key: 'status', width: '2%' },
        { key: 'name', width: '18%' },
        { key: 'detail', width: '24%' },
        { key: 'unit', width: '10%' },
        { key: 'usage', width: '20%' },
        { key: 'base', width: '8%' },
        { key: 'wastage', width: '8%' },
        { key: 'final', width: '9%' },
        { key: 'actions', width: '1%' },
      ]

  return (
    <div>
      {/* Cutting qty info banner */}
      {showCutCol && (
        <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Scissors size={13} color="#7c3aed" />
          <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Excess Cutting: {excessCutPct}% — toggle the ✂ icon on any item to calculate using cutting qty instead of order qty.</span>
        </div>
      )}

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
              <span style={{ fontSize: 10, background: count > 0 ? '#1a1a2e' : '#e5e7eb', color: count > 0 ? '#fff' : '#9ca3af', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>{count}</span>
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
      <div style={{ width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', marginBottom: 12 }}>
          <colgroup>
            {columns.map(col => <col key={col.key} style={{ width: col.width }} />)}
          </colgroup>
          <thead>
            <tr>
              {['', 'Item Name', 'Detail / Spec', 'Unit', 'Usage Rule', 'Base Qty', 'Wastage %', 'Final Qty', ...(showCutCol ? ['✂'] : []), ''].map((h, i) => (
                <th key={i} style={{ textAlign: (h === 'Base Qty' || h === 'Wastage %' || h === 'Final Qty') ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 6px 8px', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabItems.length === 0 && (
              <tr><td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No {activeTab.toLowerCase()} items yet.</td></tr>
            )}
            {tabItems.map(item => {
              const realIdx    = items.indexOf(item)
              const fqty       = calcFinalQty(item)
              const configured = isConfigured(item)
              const isGeneric  = !item.usage_rule || item.usage_rule === 'Generic'
              const staleKeys  = getStaleKeys(item, poData)
              const isStale    = staleKeys.length > 0
              const useCut     = !!item.use_cutting_qty

              return (
                <tr key={item.id || item._tempId}>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #f0f0ee', width: 18 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isStale ? COVERAGE_COLOR.partial : configured ? COVERAGE_COLOR.full : COVERAGE_COLOR.none }} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    {activeTab === 'Fabric' ? (
                      <input
                        style={inp}
                        value={[item.name, item.specification].filter(Boolean).join(' - ')}
                        onChange={e => updFabricLabel(realIdx, e.target.value)}
                        placeholder="Fabric - Shade / Colour"
                      />
                    ) : (
                      <input style={inp} value={item.name || ''} onChange={e => upd(realIdx, 'name', e.target.value)} placeholder="Item name" />
                    )}
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    <input style={inp} value={item.detail || ''} onChange={e => upd(realIdx, 'detail', e.target.value)} placeholder={activeTab === 'Fabric' ? 'Composition / GSM / Width' : 'e.g. #5 brass, antique'} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    <select style={sel} value={item.unit || 'yards'} onChange={e => upd(realIdx, 'unit', e.target.value)}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
                      <select style={{ ...sel, flex: 1, minWidth: 0, color: !isGeneric ? '#2563eb' : undefined, fontWeight: !isGeneric ? 600 : undefined }}
                        value={item.usage_rule || 'Generic'}
                        onChange={e => {
                          const rule = e.target.value
                          upd(realIdx, 'usage_rule', rule)
                          upd(realIdx, 'usage_data', null)
                          setUsageConfig({ itemIdx: realIdx, rule, item: { ...item, usage_rule: rule, usage_data: null } })
                        }}>
                        {USAGE_RULES.map(r => <option key={r}>{r}</option>)}
                      </select>
                      {(
                        <button
                          onClick={() => setUsageConfig({ itemIdx: realIdx, rule: item.usage_rule || 'Generic', item })}
                          title={isStale ? `${staleKeys.length} new item${staleKeys.length > 1 ? 's' : ''} from PO Matrix — click to update` : 'Configure usage'}
                          style={{ background: isStale ? '#fff7ed' : item.usage_data ? '#eff6ff' : '#fff7ed', border: `1px solid ${isStale ? '#fcd34d' : item.usage_data ? '#bfdbfe' : '#fed7aa'}`, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: '0 6px', height: 30, flexShrink: 0 }}>
                          {isStale ? <AlertTriangle size={12} color="#f59e0b" /> : <Settings2 size={12} color={item.usage_data ? '#2563eb' : '#f97316'} />}
                          {isStale && <span style={{ fontSize: 10, color: '#92400e', fontWeight: 700 }}>+{staleKeys.length}</span>}
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    {isGeneric
                      ? <input style={{ ...inp, textAlign: 'right' }} type="number" value={item.base_qty !== '' && Number(item.base_qty) > 0 ? item.base_qty : (normalizeUsageCell(normalizeUsageData(item.usage_data).generic).value || '')} onChange={e => upd(realIdx, 'base_qty', e.target.value)} placeholder="0" />
                      : <span title="Weighted average consumption per garment; exact totals use configured values" style={{ fontSize: 11, color: '#475569', display: 'block', textAlign: 'right', paddingRight: 8, whiteSpace: 'nowrap' }}>{weightedBase(item) ?? '—'}</span>
                    }
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    <input style={{ ...inp, textAlign: 'right' }} type="number" value={item.wastage ?? ''} onChange={e => upd(realIdx, 'wastage', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fqty ? (() => {
                      const pQty = parseFloat(normalizeUsageData(item.usage_data)._packing_qty)
                      const pUnit = normalizeUsageData(item.usage_data)._packing_unit
                      const packs = pQty ? Math.ceil(parseFloat(fqty) / pQty) : null
                      return (
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: useCut ? '#7c3aed' : '#1a1a2e', fontVariantNumeric: 'tabular-nums' }}>{parseFloat(fqty).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                          {useCut && <span style={{ fontSize: 9, color: '#7c3aed', marginLeft: 3 }}>✂</span>}
                          {packs !== null && <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>→ {packs} {pUnit || 'packs'}</div>}
                        </div>
                      )
                    })()
                      : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                    }
                  </td>
                  {/* Cutting qty toggle — only shown when excess cutting % is set */}
                  {showCutCol && (
                    <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0ee', textAlign: 'center', width: 32 }}>
                      <button
                        onClick={() => upd(realIdx, 'use_cutting_qty', !useCut)}
                        title={useCut ? 'Using cutting qty — click to switch to order qty' : 'Using order qty — click to switch to cutting qty'}
                        style={{ background: useCut ? '#f5f3ff' : 'none', border: useCut ? '1px solid #ede9fe' : '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, padding: 0 }}>
                        <Scissors size={11} color={useCut ? '#7c3aed' : '#9ca3af'} />
                      </button>
                    </td>
                  )}
                  <td style={{ padding: '4px 0 4px 4px', borderBottom: '1px solid #f0f0ee' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(realIdx)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => addBlank(activeTab)}><Plus size={12} /> Add {activeTab} Item</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowLib(true)}><Library size={12} /> Add from Library</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={openTrimPackages}><PackageOpen size={12} /> Import Trim Package</button>
        {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
      </div>

      {showLib && <LibraryModal category={activeTab} library={library} onAdd={addFromLibrary} onCreated={item=>setLibrary(prev=>[...prev.filter(x=>x.id!==item.id),item].sort((a,b)=>(a.name||'').localeCompare(b.name||'')))} onClose={() => setShowLib(false)} />}
      {usageConfig && <UsageModal config={usageConfig} poData={poData} orderData={orderData} onClose={() => setUsageConfig(null)} onSave={handleUsageSave} />}
      {showTrimPackages && <div style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,.42)',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{width:620,maxWidth:'92vw',maxHeight:'78vh',background:'#fff',borderRadius:10,boxShadow:'0 20px 60px rgba(0,0,0,.25)',display:'flex',flexDirection:'column'}}><div style={{padding:'16px 18px',borderBottom:'1px solid #eee',display:'flex',alignItems:'center'}}><div><div style={{fontWeight:700,fontSize:14}}>Import Trim Package</div><div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>{orderData?.buyer_name || 'Buyer'}</div></div><div style={{flex:1}}/><button className="btn btn-ghost" onClick={()=>setShowTrimPackages(false)}><X size={15}/></button></div><div style={{padding:18,overflowY:'auto'}}>{!trimPackages.length?<div style={{padding:30,textAlign:'center',color:'#9ca3af',fontSize:12}}>No trim packages found for this buyer.</div>:<><label style={{fontSize:11,fontWeight:700,color:'#6b7280'}}>PACKAGE</label><select className="form-control" style={{marginTop:5,marginBottom:16}} value={selectedPackage} onChange={e=>choosePackage(e.target.value)}><option value="">Select package…</option>{trimPackages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{selectedPackage&&['Stitching Trim','Packing Trim'].map(cat=>{const p=trimPackages.find(x=>x.id===selectedPackage);const rows=(p?.bom_preset_items||[]).filter(x=>x.library_items?.category===cat);return <div key={cat} style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{cat==='Stitching Trim'?'Stitching Trims':'Packing Trims'} ({rows.length})</div><div style={{border:'1px solid #e5e7eb',borderRadius:6}}>{rows.map(x=>{const lib=x.library_items;const duplicate=items.some(i=>i.library_item_id===lib.id);return <label key={x.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderBottom:'1px solid #f3f4f6',fontSize:12,opacity:duplicate?.55:1}}><input type="checkbox" disabled={duplicate} checked={!duplicate&&packageSelection.has(lib.id)} onChange={()=>setPackageSelection(prev=>{const n=new Set(prev);n.has(lib.id)?n.delete(lib.id):n.add(lib.id);return n})}/><span style={{fontWeight:600}}>{lib.name}</span><span style={{color:'#9ca3af'}}>{lib.description||''}</span>{duplicate&&<span style={{marginLeft:'auto',fontSize:10,color:'#16a34a',fontWeight:700}}>Already in BOM</span>}</label>})}</div></div>})}</>}</div><div style={{padding:'12px 18px',borderTop:'1px solid #eee',display:'flex',justifyContent:'flex-end',gap:8}}><button className="btn btn-secondary" onClick={()=>setShowTrimPackages(false)}>Cancel</button><button className="btn btn-primary" disabled={!selectedPackage||packageSelection.size===0} onClick={importTrimPackage}>Import Selected</button></div></div></div>}
    </div>
  )
}
