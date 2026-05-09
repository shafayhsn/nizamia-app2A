import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, Settings2, X, Upload, FileText } from 'lucide-react'

const USAGE_RULES = ['Generic', 'By Color', 'By Size Group', 'By Individual Sizes', 'Configure Own']

// ── Usage Config Modal (mirrors BOM) ─────────────────────────────────────────
function UsageModal({ config, onClose, onSave, poData }) {
  const { block, rule } = config
  const [data, setData] = useState(() => block.usage_data || {})
  const [matrixData, setMatrixData] = useState(() => {
    if (rule !== 'Configure Own') return {}
    const m = block.usage_data?.__matrix || []
    const obj = {}
    m.forEach(e => { obj[`${e.sgName}||${e.colorName}`] = e.label || '' })
    return obj
  })

  const inp = { height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' }
  const TH = ({ children }) => <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>{children}</th>

  const handleSave = () => {
    let usageData = {}
    if (rule === 'Generic') {
      usageData = {}
    } else if (rule === 'Configure Own') {
      const matrix = Object.entries(matrixData).filter(([,v]) => v).map(([key, label]) => { const [sgName, colorName] = key.split('||'); return { sgName, colorName, label } })
      usageData = { __matrix: matrix }
    } else {
      usageData = { ...data }
    }
    onSave(config.blockIdx, rule, usageData)
    onClose()
  }

  const keys = rule === 'By Color' ? poData.colors.map(c => c.name)
    : rule === 'By Size Group' ? poData.sizeGroups.map(g => g.name)
    : rule === 'By Individual Sizes' ? poData.allSizes.map(s => s.size) : []

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Configure Variant Link — {rule}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{block.block_name || 'Block'} · which variants does this block apply to?</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {rule === 'Generic' && (
            <div style={{ fontSize: 12, color: '#6b7280', padding: '12px 0' }}>This block applies to all variants — no further configuration needed.</div>
          )}
          {(rule === 'By Color' || rule === 'By Size Group' || rule === 'By Individual Sizes') && (
            keys.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 20 }}>No {rule.replace('By ', '').toLowerCase()} data in PO Matrix yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><TH>{rule === 'By Color' ? 'Colour' : rule === 'By Size Group' ? 'Size Group' : 'Size'}</TH><TH>Applies?</TH></tr></thead>
                <tbody>
                  {keys.map(k => (
                    <tr key={k}>
                      <td style={{ padding: '6px 8px 6px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12, fontWeight: 500 }}>{k}</td>
                      <td style={{ padding: '6px 0', borderBottom: '1px solid #f0f0ee' }}>
                        <input type="checkbox" checked={!!data[k]} onChange={e => setData(d => ({ ...d, [k]: e.target.checked }))} style={{ cursor: 'pointer' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
          {rule === 'Configure Own' && (
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>Label each Size Group × Colour combination this block covers.</div>
              {!(poData.sgMatrix || []).length
                ? <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 20 }}>No PO Matrix data yet.</div>
                : (poData.sgMatrix || []).map(sg => (
                  <div key={sg.sgName} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#1a1a2e', padding: '3px 8px', borderRadius: 4, marginBottom: 6, display: 'inline-block', textTransform: 'uppercase' }}>{sg.sgName}</div>
                    {sg.colors.map(c => {
                      const key = `${sg.sgName}||${c.colorName}`
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <div style={{ fontSize: 12, width: 120 }}>{c.colorName}</div>
                          <input style={{ ...inp, width: 200 }} value={matrixData[key] || ''} placeholder="Label (e.g. fits)" onChange={e => setMatrixData(d => ({ ...d, [key]: e.target.value }))} />
                        </div>
                      )
                    })}
                  </div>
                ))
              }
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

// ── Main Step4 ────────────────────────────────────────────────────────────────
export default function Step4Fitting({ orderId, orderData, onSaved, registerSave }) {
  const orderIdRef = useRef(orderId)
  useEffect(() => { orderIdRef.current = orderId }, [orderId])

  const [enabled,      setEnabled]      = useState(false)
  const [blocks,       setBlocks]       = useState([])
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [loaded,       setLoaded]       = useState(false)
  const [usageConfig,  setUsageConfig]  = useState(null)
  const [poData,       setPoData]       = useState({ colors: [], sizeGroups: [], allSizes: [], sgMatrix: [] })
  const dxfRefs = useRef({})

  const enabledRef = useRef(enabled)
  const blocksRef  = useRef(blocks)
  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { blocksRef.current  = blocks  }, [blocks])

  useEffect(() => {
    if (!orderId) return
    loadAll()
    loadPoData()
  }, [orderId])

  async function loadAll() {
    const { data } = await supabase.from('fitting_blocks').select('*').eq('order_id', orderId).order('sort_order')
    if (data?.length) {
      setEnabled(true)
      setBlocks(data.map(b => ({ ...b, _tempId: b.id, dxfPreview: b.dxf_filename || null })))
    }
    setLoaded(true)
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
    const sizeGroupList = sgs.map(g => ({ name: g.group_name, qty: bd?.filter(b => b.size_group_id === g.id).reduce((s,b) => s+(b.qty||0),0)||0 }))
    const sizeQtyMap = {}
    bd?.forEach(b => { sizeQtyMap[b.size] = (sizeQtyMap[b.size]||0)+(b.qty||0) })
    const seenSizes = []
    sgs.forEach(g => (g.sizes||[]).forEach(sz => { if (!seenSizes.includes(sz)) seenSizes.push(sz) }))
    const allSizeList = seenSizes.map(sz => ({ size: sz, qty: sizeQtyMap[sz]||0 }))
    const sgMatrix = sgs.map(g => {
      const bdForGroup = bd?.filter(b => b.size_group_id===g.id)||[]
      const colorsForGroup = (colors||[]).filter(c => c.size_group_id===g.id)
      return { sgName: g.group_name, colors: colorsForGroup.map(c => ({ colorName: c.color_name, qty: (g.sizes||[]).reduce((s,sz) => s+(bdForGroup.find(b=>b.color_id===c.id&&b.size===sz)?.qty||0),0) })) }
    })
    setPoData({ colors: colorList, sizeGroups: sizeGroupList, allSizes: allSizeList, sgMatrix })
  }

  const addBlock = () => setBlocks(bs => [...bs, {
    _new: true, _tempId: String(Date.now()), order_id: orderId,
    block_name: '', spec_code: '', usage_rule: 'Generic', usage_data: null,
    dxf_filename: null, dxf_base64: null, dxfPreview: null, sort_order: bs.length,
  }])

  const upd = (idx, k, v) => setBlocks(bs => bs.map((b, i) => i === idx ? { ...b, [k]: v } : b))

  const handleDxfUpload = (idx, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      upd(idx, 'dxf_base64', ev.target.result)
      upd(idx, 'dxf_filename', file.name)
      upd(idx, 'dxfPreview', file.name)
    }
    reader.readAsDataURL(file)
  }

  const handleUsageSave = (blockIdx, rule, usageData) => {
    upd(blockIdx, 'usage_rule', rule)
    upd(blockIdx, 'usage_data', usageData)
  }

  const doSave = useCallback(async () => {
    const oid = orderIdRef.current
    if (!oid) return
    await supabase.from('fitting_blocks').delete().eq('order_id', oid)
    const rows = blocksRef.current.filter(b => b.block_name?.trim() || b.spec_code?.trim()).map((b, idx) => ({
      order_id: oid, block_name: b.block_name||null, spec_code: b.spec_code||null,
      usage_rule: b.usage_rule||'Generic', usage_data: b.usage_data||null,
      dxf_filename: b.dxf_filename||null, dxf_base64: b.dxf_base64||null, sort_order: idx,
    }))
    if (rows.length) await supabase.from('fitting_blocks').insert(rows)
    await supabase.from('orders').update({ step_fitting: enabledRef.current }).eq('id', oid)
    onSaved(oid, { step_fitting: enabledRef.current })
  }, [])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch {}
    setSaving(false)
  }

  const inp = { width: '100%', height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff' }
  const sel = { ...inp, cursor: 'pointer' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Fitting — Pattern Blocks</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Add pattern blocks, link to variants, and upload DXF files</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
          <div onClick={() => setEnabled(e => !e)} style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? '#0d0d0d' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 3, left: enabled ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? '#0d0d0d' : '#9ca3af' }}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>

      {!enabled ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee' }}>
          Toggle to add pattern blocks for this order.
        </div>
      ) : !loaded ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: 12 }}>Loading...</div>
      ) : (
        <>
          {blocks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee', marginBottom: 12 }}>
              No blocks yet. Click Add Block to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {blocks.map((block, idx) => {
                const isGeneric = !block.usage_rule || block.usage_rule === 'Generic'
                const configured = !isGeneric && block.usage_data
                return (
                  <div key={block._tempId || idx} style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 10, alignItems: 'end' }}>
                      {/* Block Name */}
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Block Name</label>
                        <input style={inp} value={block.block_name || ''} onChange={e => upd(idx, 'block_name', e.target.value)} placeholder="e.g. Trouser Block A" />
                      </div>
                      {/* Spec Code */}
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Spec / Block Code</label>
                        <input style={inp} value={block.spec_code || ''} onChange={e => upd(idx, 'spec_code', e.target.value)} placeholder="e.g. BLK-TR-04" />
                      </div>
                      {/* Usage Rule */}
                      <div style={{ minWidth: 160 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Applies To</label>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <select style={{ ...sel, color: !isGeneric ? '#2563eb' : undefined, fontWeight: !isGeneric ? 600 : undefined }}
                            value={block.usage_rule || 'Generic'}
                            onChange={e => {
                              const rule = e.target.value
                              upd(idx, 'usage_rule', rule)
                              upd(idx, 'usage_data', null)
                              if (rule !== 'Generic') setUsageConfig({ blockIdx: idx, rule, block: { ...block, usage_rule: rule, usage_data: null } })
                            }}>
                            {USAGE_RULES.map(r => <option key={r}>{r}</option>)}
                          </select>
                          {!isGeneric && (
                            <button onClick={() => setUsageConfig({ blockIdx: idx, rule: block.usage_rule, block })}
                              style={{ background: configured ? '#eff6ff' : '#fff7ed', border: `1px solid ${configured ? '#bfdbfe' : '#fed7aa'}`, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 6px', height: 30 }}>
                              <Settings2 size={12} color={configured ? '#2563eb' : '#f97316'} />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* DXF Upload */}
                      <div style={{ minWidth: 120 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>DXF File</label>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {block.dxfPreview ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 5, padding: '0 8px', height: 30 }}>
                              <FileText size={11} color="#16a34a" />
                              <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{block.dxfPreview}</span>
                              <button onClick={() => { upd(idx,'dxf_base64',null); upd(idx,'dxf_filename',null); upd(idx,'dxfPreview',null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={10} color="#9ca3af" /></button>
                            </div>
                          ) : (
                            <button onClick={() => dxfRefs.current[idx]?.click()}
                              style={{ height: 30, padding: '0 10px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter,sans-serif', color: '#6b7280' }}>
                              <Upload size={11} /> Upload DXF
                            </button>
                          )}
                          <input type="file" accept=".dxf,.dwg" style={{ display: 'none' }} ref={el => dxfRefs.current[idx] = el} onChange={e => handleDxfUpload(idx, e.target.files?.[0])} />
                        </div>
                      </div>
                      {/* Delete */}
                      <div style={{ paddingBottom: 1 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setBlocks(bs => bs.filter((_,i) => i !== idx))}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button className="btn btn-secondary btn-sm" onClick={addBlock}><Plus size={12} /> Add Block</button>
        </>
      )}

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
