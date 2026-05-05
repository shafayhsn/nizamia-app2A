import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { Plus, Trash2, Check, X, Settings2, Package2, Boxes } from 'lucide-react'

const PACKING_BASES = [
  'By Q#',
  'By Colour',
  'By Ratio',
  'Colour × Size Group',
  'By Size',
  'By Size Group',
  'No Split',
  'Manual',
]
const INNER_PACK_TYPES = ['None', 'Polybag', 'Master Poly', 'Blister', 'Bundle']
const CARTON_STYLES = ['Flat Packed', 'Solid Size', 'Assorted Ratio', 'Solid Colour', 'Mixed Colour']


const DEFAULT_PACKING_FIELDS = [
  { key: 'carton_range', label: 'CTN NO', visible: true, order: 1, editable: true },
  { key: 'pack_name', label: 'PACK', visible: true, order: 2, editable: false },
  { key: 'packing_basis', label: 'BASIS', visible: true, order: 3, editable: false },
  { key: 'description', label: 'DESCRIPTION', visible: true, order: 4, editable: false },
  { key: 'ratio', label: 'RATIO', visible: true, order: 5, editable: false },
  { key: 'quantity', label: 'QTY', visible: true, order: 6, editable: false, required: true },
  { key: 'pcs_per_carton', label: 'PCS/CTN', visible: true, order: 7, editable: false },
  { key: 'cartons', label: 'CTNS', visible: true, order: 8, editable: false, required: true },
  { key: 'inner_pack', label: 'INNER PACK', visible: true, order: 9, editable: false },
  { key: 'net_weight', label: 'N.WT', visible: true, order: 10, editable: true },
  { key: 'gross_weight', label: 'G.WT', visible: true, order: 11, editable: true },
  { key: 'cbm', label: 'CBM', visible: true, order: 12, editable: false },
  { key: 'carton_size', label: 'CTN SIZE', visible: false, order: 13, editable: false },
  { key: 'remarks', label: 'REMARKS', visible: true, order: 14, editable: true },
]

function getPackingFields() {
  try {
    const raw = localStorage.getItem('app2a_packing_fields_config')
    if (!raw) return DEFAULT_PACKING_FIELDS
    const parsed = JSON.parse(raw)
    const rows = Array.isArray(parsed?.fields) ? parsed.fields : parsed
    if (!Array.isArray(rows) || !rows.length) return DEFAULT_PACKING_FIELDS
    const byKey = Object.fromEntries(DEFAULT_PACKING_FIELDS.map(f => [f.key, f]))
    return rows.map((f, idx) => ({ ...(byKey[f.key] || {}), ...f, order: f.order ?? idx + 1 }))
      .concat(DEFAULT_PACKING_FIELDS.filter(f => !rows.some(x => x.key === f.key)))
      .sort((a,b)=>(a.order||99)-(b.order||99))
  } catch { return DEFAULT_PACKING_FIELDS }
}

function savePackingFields(fields) {
  localStorage.setItem('app2a_packing_fields_config', JSON.stringify({ fields }))
}

function formatRatio(ratios) {
  if (!ratios) return ''
  return Object.entries(ratios).filter(([,v]) => ni(v) > 0).map(([k,v]) => `${k}:${v}`).join(' / ')
}

function buildPackingRows(packs, poData, activeQty, overrides = {}) {
  const rows = []
  ;(packs || []).forEach((pack, packIndex) => {
    const basis = pack.pack_type || pack.pack_basis || 'By Q#'
    const pcsPerCarton = basis === 'By Ratio'
      ? (Object.values(pack.config?.ratios || {}).reduce((s,v)=>s+ni(v),0) * ni(pack.config?.sets_per_carton)) || ni(pack.units_per_carton || pack.pcs_per_carton)
      : ni(pack.units_per_carton || pack.pcs_per_carton)
    const cartonVol = n(pack.carton_l) && n(pack.carton_w) && n(pack.carton_h) ? (n(pack.carton_l)*n(pack.carton_w)*n(pack.carton_h))/1000000 : 0
    const cartonSize = n(pack.carton_l) && n(pack.carton_w) && n(pack.carton_h) ? `${pack.carton_l}×${pack.carton_w}×${pack.carton_h} cm` : ''
    const base = {
      pack_name: pack.pack_name || `Pack ${packIndex + 1}`,
      packing_basis: basis,
      pcs_per_carton: pcsPerCarton || '',
      inner_pack: pack.inner_pack_type && pack.inner_pack_type !== 'None' ? `${pack.inner_pack_type}${pack.pieces_per_inner_pack ? ` / ${pack.pieces_per_inner_pack} pcs` : ''}` : '',
      carton_size: cartonSize,
      net_weight: '',
      gross_weight: pack.carton_weight_kg || '',
      remarks: '',
    }
    const pushRow = (line, idx, ratioText = '') => {
      const qty = ni(line.qty)
      const cartons = pcsPerCarton ? Math.ceil(qty / pcsPerCarton) : 0
      const key = `${packIndex}_${idx}`
      rows.push({
        id: key,
        ...base,
        description: line.label || line.size || line.color || base.pack_name,
        ratio: ratioText,
        quantity: qty,
        cartons,
        cbm: cartonVol && cartons ? +(cartonVol * cartons).toFixed(3) : '',
        carton_range: overrides[key]?.carton_range || '',
        net_weight: overrides[key]?.net_weight ?? base.net_weight,
        gross_weight: overrides[key]?.gross_weight ?? base.gross_weight,
        remarks: overrides[key]?.remarks || '',
      })
    }
    if (basis === 'By Ratio') {
      pushRow({ label: 'Ratio Pack', qty: pack.config?.qty_assigned || activeQty }, 0, formatRatio(pack.config?.ratios))
    } else if (pack.config?.lines?.length) {
      pack.config.lines.forEach((line, idx) => pushRow(line, idx))
    } else {
      pushRow({ label: basis === 'No Split' ? 'Full Order' : base.pack_name, qty: pack.qty_assigned || activeQty }, 0)
    }
  })
  return rows
}

function exportPackingExcel({ rows, fields, orderData, title = 'PACKING LIST' }) {
  const visible = fields.filter(f => f.visible).sort((a,b)=>(a.order||99)-(b.order||99))
  const headerRows = [
    [title],
    ['Buyer', orderData?.buyer_name || '', 'Style', orderData?.style_number || '', 'PO', orderData?.po_number || ''],
    ['Order Qty', orderData?.total_qty || '', 'Generated', new Date().toLocaleDateString()],
    [],
    visible.map(f => f.label),
  ]
  const body = rows.map(r => visible.map(f => r[f.key] ?? ''))
  const totals = []
  totals.push([])
  totals.push(visible.map(f => {
    if (f.key === 'description') return 'TOTAL'
    if (f.key === 'quantity') return rows.reduce((s,r)=>s+ni(r.quantity),0)
    if (f.key === 'cartons') return rows.reduce((s,r)=>s+ni(r.cartons),0)
    if (f.key === 'cbm') return rows.reduce((s,r)=>s+n(r.cbm),0).toFixed(3)
    return ''
  }))
  const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...body, ...totals])
  ws['!cols'] = visible.map(f => ({ wch: Math.max(10, String(f.label || '').length + 4) }))
  ws['!merges'] = [{ s: { r:0, c:0 }, e: { r:0, c: Math.max(0, visible.length-1) } }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Packing List')
  const safeStyle = (orderData?.style_number || 'order').replace(/[^a-z0-9_-]+/gi, '-')
  XLSX.writeFile(wb, `Packing-List-${safeStyle}.xlsx`)
}

function PackingFieldConfigModal({ fields, setFields, onClose }) {
  const update = (idx, patch) => setFields(fs => fs.map((f, i) => i === idx ? { ...f, ...patch } : f))
  const move = (idx, dir) => setFields(fs => {
    const next = [...fs]
    const j = idx + dir
    if (j < 0 || j >= next.length) return fs
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next.map((f, i) => ({ ...f, order: i + 1 }))
  })
  const reset = () => setFields(DEFAULT_PACKING_FIELDS)
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:620, maxHeight:'84vh', background:'#fff', borderRadius:12, boxShadow:'0 24px 60px rgba(0,0,0,.22)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #f0f0ee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><div style={{fontSize:14,fontWeight:800}}>Configure Packing Fields</div><div style={{fontSize:11,color:'#9ca3af'}}>Show/hide, rename and reorder Excel/preview fields.</div></div>
          <button onClick={onClose} style={{border:0,background:'transparent',cursor:'pointer'}}><X size={16}/></button>
        </div>
        <div style={{ padding:16, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr><th style={{textAlign:'left',fontSize:10,color:'#9ca3af'}}>VISIBLE</th><th style={{textAlign:'left',fontSize:10,color:'#9ca3af'}}>LABEL</th><th style={{textAlign:'left',fontSize:10,color:'#9ca3af'}}>FIELD</th><th></th></tr></thead>
            <tbody>{fields.map((f, idx)=>(
              <tr key={f.key}>
                <td style={{padding:'7px 6px',borderBottom:'1px solid #f3f4f6'}}><input type="checkbox" checked={!!f.visible} disabled={!!f.required} onChange={e=>update(idx,{visible:e.target.checked})}/></td>
                <td style={{padding:'7px 6px',borderBottom:'1px solid #f3f4f6'}}><input value={f.label} onChange={e=>update(idx,{label:e.target.value})} style={{height:28,width:'100%',border:'1px solid #e5e7eb',borderRadius:6,padding:'0 8px',fontSize:12}}/></td>
                <td style={{padding:'7px 6px',borderBottom:'1px solid #f3f4f6',fontSize:11,color:'#6b7280'}}>{f.key}</td>
                <td style={{padding:'7px 6px',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>move(idx,-1)}>↑</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>move(idx,1)}>↓</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid #f0f0ee', display:'flex', justifyContent:'space-between' }}>
          <button className="btn btn-ghost" onClick={reset}>Reset Default</button>
          <button className="btn btn-primary" onClick={() => { savePackingFields(fields); onClose() }}>Save Fields</button>
        </div>
      </div>
    </div>
  )
}

function PackingPreviewModal({ packs, poData, activeQty, orderData, onClose }) {
  const [fields, setFields] = useState(getPackingFields())
  const [overrides, setOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`app2a_packing_overrides_${orderData?.id || 'draft'}`) || '{}') } catch { return {} }
  })
  const [showFields, setShowFields] = useState(false)
  const rows = buildPackingRows(packs, poData, activeQty, overrides)
  const visible = fields.filter(f => f.visible).sort((a,b)=>(a.order||99)-(b.order||99))
  const setCell = (id, key, value) => setOverrides(o => ({ ...o, [id]: { ...(o[id] || {}), [key]: value } }))
  const saveOverrides = () => localStorage.setItem(`app2a_packing_overrides_${orderData?.id || 'draft'}`, JSON.stringify(overrides))
  const totals = { qty: rows.reduce((s,r)=>s+ni(r.quantity),0), cartons: rows.reduce((s,r)=>s+ni(r.cartons),0), cbm: rows.reduce((s,r)=>s+n(r.cbm),0) }
  const inputStyle = { width:'100%', height:28, border:'1px solid #e5e7eb', borderRadius:6, padding:'0 6px', fontSize:11 }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:'94vw', maxWidth:1220, maxHeight:'88vh', background:'#fff', borderRadius:12, boxShadow:'0 24px 60px rgba(0,0,0,.22)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #f0f0ee', display:'flex', alignItems:'center', gap:12 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800 }}>Tentative Packing List</div>
            <div style={{ fontSize:11, color:'#9ca3af' }}>{orderData?.buyer_name || 'Buyer'} · {orderData?.style_number || 'Style'} · Qty {activeQty.toLocaleString()}</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button className="btn btn-secondary btn-sm" onClick={()=>setShowFields(true)}>Configure Fields</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>{ saveOverrides(); exportPackingExcel({ rows, fields, orderData, title:'TENTATIVE PACKING LIST' }) }}>Export Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
        <div style={{ padding:'12px 18px', display:'flex', gap:14, borderBottom:'1px solid #f5f5f4', fontSize:12 }}>
          <strong>Total Qty: {totals.qty.toLocaleString()}</strong><strong>Cartons: {totals.cartons.toLocaleString()}</strong><strong>CBM: {totals.cbm.toFixed(3)}</strong>
          <span style={{ color:'#6b7280' }}>Carton ranges and optional weights/remarks are manual and saved locally per order.</span>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:18 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
            <thead><tr>{visible.map(f=><th key={f.key} style={{ position:'sticky', top:0, background:'#fafaf8', border:'1px solid #e5e7eb', padding:'8px 7px', fontSize:10, color:'#374151', textAlign:['quantity','cartons','pcs_per_carton','cbm','gross_weight','net_weight'].includes(f.key)?'right':'left' }}>{f.label}</th>)}</tr></thead>
            <tbody>{rows.map(r=>(
              <tr key={r.id}>{visible.map(f=>{
                const editable = ['carton_range','net_weight','gross_weight','remarks'].includes(f.key)
                const align = ['quantity','cartons','pcs_per_carton','cbm','gross_weight','net_weight'].includes(f.key) ? 'right' : 'left'
                return <td key={f.key} style={{ border:'1px solid #e5e7eb', padding:6, fontSize:11, textAlign:align }}>
                  {editable ? <input style={{...inputStyle,textAlign:align}} value={r[f.key] || ''} onChange={e=>setCell(r.id, f.key, e.target.value)} placeholder={f.key==='carton_range'?'e.g. 1-59':''}/> : (r[f.key] || '—')}
                </td>
              })}</tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid #f0f0ee', display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { saveOverrides(); onClose() }}>Save Packing Snapshot</button>
        </div>
        {showFields && <PackingFieldConfigModal fields={fields} setFields={setFields} onClose={() => setShowFields(false)} />}
      </div>
    </div>
  )
}

function tempId() { return Math.random().toString(36).slice(2) }
const n = (v) => parseFloat(v) || 0
const ni = (v) => parseInt(v) || 0
const ceilDiv = (a, b) => (!a || !b ? 0 : Math.ceil(a / b))

function PackConfigModal({ pack, packIdx, poData, useCuttingQty, orderQty, cuttingQty, onClose, onSave }) {
  const totalQty = useCuttingQty ? cuttingQty : orderQty
  const basis = pack.pack_type || 'By Q#'
  const [config, setConfig] = useState(pack.config || {})

  useEffect(() => {
    setConfig(prev => hydrateConfigForBasis(prev, basis, poData, totalQty))
  }, [basis, poData, totalQty])

  const upd = (k, v) => setConfig(c => ({ ...c, [k]: v }))
  const updLine = (idx, k, v) => setConfig(c => ({
    ...c,
    lines: (c.lines || []).map((line, i) => i === idx ? { ...line, [k]: v } : line)
  }))

  const lines = config.lines || []
  const assigned = basis === 'By Ratio'
    ? ni(config.qty_assigned)
    : lines.reduce((s, line) => s + ni(line.qty), 0)
  const ratioTotal = Object.values(config.ratios || {}).reduce((s, v) => s + ni(v), 0)
  const derivedPcsPerCarton = basis === 'By Ratio' && ni(config.sets_per_carton) > 0 && ratioTotal > 0
    ? ni(config.sets_per_carton) * ratioTotal
    : 0

  const labelStyle = { fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }
  const inputStyle = { width: '100%', height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff' }

  function hydrateConfigForBasis(current, selectedBasis, data, targetQty) {
    const next = { ...(current || {}) }
    if (selectedBasis === 'By Ratio') {
      if (!next.ratios) {
        next.ratios = (data.allSizes || []).reduce((acc, s) => ({ ...acc, [s.size]: '' }), {})
      }
      if (next.qty_assigned == null || next.qty_assigned === '') next.qty_assigned = targetQty || 0
      if (next.sets_per_carton == null) next.sets_per_carton = ''
      return next
    }
    if (!next.lines || !next.lines.length) {
      next.lines = getDefaultLines(selectedBasis, data, targetQty)
    }
    return next
  }

  function getDefaultLines(selectedBasis, data, targetQty) {
    switch (selectedBasis) {
      case 'By Q#':
        return (data.queues || []).map(q => ({ key: q.id || q.q_number || q.label, label: `${q.q_number ? q.q_number + ' · ' : ''}${q.label || q.q_number || 'Queued'}`, qty: q.qty || 0 }))
      case 'By Colour':
        return (data.colors || []).map(c => ({ key: c.name, label: c.name, qty: c.qty || 0 }))
      case 'By Size':
        return (data.allSizes || []).map(s => ({ key: s.size, label: s.size, qty: s.qty || 0 }))
      case 'By Size Group':
        return (data.groups || []).map(g => ({ key: g.name, label: g.name, qty: g.qty || 0 }))
      case 'Colour × Size Group':
        return (data.combos || []).map(x => ({ key: x.key, label: x.label, qty: x.qty || 0 }))
      case 'No Split':
        return [{ key: 'full_order', label: 'Full Order', qty: targetQty || 0 }]
      case 'Manual':
        return [{ key: tempId(), label: 'Manual Pack 1', qty: targetQty || 0 }]
      default:
        return []
    }
  }

  const renderLineEditor = (allowRename = false) => (
    <>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
        Define quantity per {basis.replace('By ', '').toLowerCase()} for this packing row.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>Line</th>
            <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Qty</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={line.key || idx}>
              <td style={{ padding: '6px 8px 6px 0', borderBottom: '1px solid #f0f0ee' }}>
                {allowRename ? (
                  <input style={inputStyle} value={line.label || ''} onChange={e => updLine(idx, 'label', e.target.value)} />
                ) : (
                  <div style={{ fontSize: 12 }}>{line.label}</div>
                )}
              </td>
              <td style={{ padding: '6px 0 6px 8px', borderBottom: '1px solid #f0f0ee', width: 112 }}>
                <input
                  type="number"
                  style={{ ...inputStyle, textAlign: 'right' }}
                  value={line.qty ?? ''}
                  onChange={e => updLine(idx, 'qty', ni(e.target.value))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {allowRename && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => upd('lines', [...lines, { key: tempId(), label: `Manual Pack ${lines.length + 1}`, qty: 0 }])}>
          <Plus size={12} /> Add Line
        </button>
      )}
      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
        Assigned: <strong>{assigned.toLocaleString()}</strong> / {totalQty.toLocaleString()} pcs
      </div>
    </>
  )

  const renderByRatio = () => (
    <>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
        Set ratio by size. Then set total assigned qty and sets per carton. System derives pieces per carton.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 8px 8px 0', textTransform: 'uppercase' }}>Size</th>
            <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '0 0 8px 8px', textTransform: 'uppercase' }}>Ratio</th>
          </tr>
        </thead>
        <tbody>
          {(poData.allSizes || []).map(s => (
            <tr key={s.size}>
              <td style={{ padding: '6px 8px 6px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12 }}>{s.size}</td>
              <td style={{ padding: '6px 0 6px 8px', borderBottom: '1px solid #f0f0ee', width: 112 }}>
                <input
                  type="number"
                  style={{ ...inputStyle, textAlign: 'right' }}
                  value={config.ratios?.[s.size] ?? ''}
                  onChange={e => upd('ratios', { ...(config.ratios || {}), [s.size]: ni(e.target.value) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
        <div>
          <label style={labelStyle}>Assigned Qty</label>
          <input type="number" style={{ ...inputStyle, textAlign: 'right' }} value={config.qty_assigned ?? ''} onChange={e => upd('qty_assigned', ni(e.target.value))} />
        </div>
        <div>
          <label style={labelStyle}>Sets / Carton</label>
          <input type="number" style={{ ...inputStyle, textAlign: 'right' }} value={config.sets_per_carton ?? ''} onChange={e => upd('sets_per_carton', ni(e.target.value))} />
        </div>
        <div>
          <label style={labelStyle}>Derived Pcs / Carton</label>
          <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: '#fafaf8', color: derivedPcsPerCarton ? '#0d0d0d' : '#9ca3af', fontWeight: 700 }}>
            {derivedPcsPerCarton || '—'}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>
        Ratio total: <strong>{ratioTotal}</strong> pcs/set
      </div>
    </>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 560, maxHeight: '84vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Configure Packing Basis — {basis}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{pack.pack_name || 'Packing Row'} · Total Basis Qty: {totalQty.toLocaleString()} pcs</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {basis === 'By Ratio' ? renderByRatio() : renderLineEditor(basis === 'Manual')}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { onSave(packIdx, config); onClose() }}>Save Config</button>
        </div>
      </div>
    </div>
  )
}

export default function Step8Finishing({ orderId, orderData, onSaved, registerSave }) {
  const [enabled, setEnabled] = useState(false)
  const [useCuttingQty, setUseCuttingQty] = useState(false)
  const [packs, setPacks] = useState([])
  const [configModal, setConfigModal] = useState(null)
  const [showPackingPreview, setShowPackingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [poData, setPoData] = useState({ colors: [], allSizes: [], groups: [], combos: [], queues: [] })
  const [finishingId, setFinishingId] = useState(null)

  const orderQty = orderData?.total_qty || 0
  const excessPct = parseFloat(orderData?.excess_cutting_pct) || 0
  const cuttingQty = Math.ceil(orderQty * (1 + excessPct / 100))
  const activeQty = useCuttingQty ? cuttingQty : orderQty

  const enabledRef = useRef(enabled)
  const useCuttingQtyRef = useRef(useCuttingQty)
  const packsRef = useRef(packs)
  const finishingIdRef = useRef(finishingId)
  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { useCuttingQtyRef.current = useCuttingQty }, [useCuttingQty])
  useEffect(() => { packsRef.current = packs }, [packs])
  useEffect(() => { finishingIdRef.current = finishingId }, [finishingId])

  useEffect(() => {
    if (!orderId) return
    loadAll()
    loadPoData()
  }, [orderId])

  function normalizePack(p) {
    const cfg = p.config || {}
    const meta = cfg.__packMeta || {}
    return {
      ...p,
      _tempId: p.id || tempId(),
      pack_type: p.pack_type || meta.packing_basis || 'By Q#',
      inner_pack_type: meta.inner_pack_type || 'None',
      pieces_per_inner_pack: meta.pieces_per_inner_pack ?? '',
      carton_style: meta.carton_style || p.hang_flat || 'Flat Packed',
      config: cfg,
    }
  }

  async function loadAll() {
    const { data: fin } = await supabase.from('finishing').select('*').eq('order_id', orderId).maybeSingle()
    if (fin) {
      setEnabled(true)
      setUseCuttingQty(!!fin.use_cutting_qty)
      setFinishingId(fin.id)
      const { data: fp } = await supabase.from('finishing_packs').select('*').eq('finishing_id', fin.id).order('sort_order')
      setPacks((fp || []).map(normalizePack))
    }
  }

  async function loadPoData() {
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    const { data: qs } = await supabase.from('order_queues').select('id,q_number,label,qty,split_rule,color_name,size_group_id').eq('order_id', orderId).order('sort_order')
    if (!sgs?.length) {
      setPoData({ colors: [], allSizes: [], groups: [], combos: [], queues: qs || [] })
      return
    }
    const { data: colors } = await supabase.from('size_group_colors').select('*').in('size_group_id', sgs.map(g => g.id))
    const { data: bd } = await supabase.from('size_group_breakdown').select('*').in('size_group_id', sgs.map(g => g.id))

    const sgNameMap = {}
    sgs.forEach(g => { sgNameMap[g.id] = g.group_name })

    const colorMap = {}
    ;(colors || []).forEach(c => { colorMap[c.id] = { name: c.color_name, qty: 0, size_group_id: c.size_group_id } })
    ;(bd || []).forEach(b => { if (colorMap[b.color_id]) colorMap[b.color_id].qty += b.qty || 0 })

    const rolledColors = {}
    Object.values(colorMap).forEach(c => {
      if (!rolledColors[c.name]) rolledColors[c.name] = { name: c.name, qty: 0 }
      rolledColors[c.name].qty += c.qty || 0
    })

    const sizeQtyMap = {}
    ;(bd || []).forEach(b => { sizeQtyMap[b.size] = (sizeQtyMap[b.size] || 0) + (b.qty || 0) })
    const seenSizes = []
    sgs.forEach(g => (g.sizes || []).forEach(sz => { if (!seenSizes.includes(sz)) seenSizes.push(sz) }))

    const groups = sgs.map(g => {
      const gColorIds = (colors || []).filter(c => c.size_group_id === g.id).map(c => c.id)
      const qty = (bd || []).filter(x => gColorIds.includes(x.color_id)).reduce((s, x) => s + (x.qty || 0), 0)
      return { id: g.id, name: g.group_name, qty }
    })

    const combos = []
    sgs.forEach(g => {
      ;(colors || []).filter(c => c.size_group_id === g.id).forEach(c => {
        const qty = (bd || []).filter(x => x.color_id === c.id).reduce((s, x) => s + (x.qty || 0), 0)
        if (!qty) return
        combos.push({ key: `${c.color_name}__${g.group_name}`, label: `${c.color_name} / ${g.group_name}`, qty })
      })
    })

    setPoData({
      colors: Object.values(rolledColors),
      allSizes: seenSizes.map(sz => ({ size: sz, qty: sizeQtyMap[sz] || 0 })),
      groups,
      combos,
      queues: (qs || []).map(q => ({ ...q, qty: q.qty || 0 })),
    })
  }

  const addPack = () => setPacks(ps => [...ps, normalizePack({
    _new: true,
    pack_name: '',
    pack_type: 'By Q#',
    config: {},
    carton_l: '',
    carton_w: '',
    carton_h: '',
    carton_weight_kg: '',
    units_per_carton: '',
    qty_assigned: '',
    inner_pack_type: 'None',
    pieces_per_inner_pack: '',
    carton_style: 'Flat Packed',
    sort_order: ps.length,
  })])

  const updPack = (idx, k, v) => setPacks(ps => ps.map((p, i) => i === idx ? { ...p, [k]: v } : p))
  const updPackConfig = (idx, config) => setPacks(ps => ps.map((p, i) => i === idx ? { ...p, config } : p))

  const packQty = (pack) => {
    const basis = pack.pack_type || 'By Q#'
    if (basis === 'By Ratio') return ni(pack.config?.qty_assigned || pack.qty_assigned)
    if (pack.config?.lines?.length) return pack.config.lines.reduce((s, line) => s + ni(line.qty), 0)
    return ni(pack.qty_assigned)
  }

  const derivedUnitsPerCarton = (pack) => {
    const basis = pack.pack_type || 'By Q#'
    if (basis === 'By Ratio') {
      const ratios = pack.config?.ratios || {}
      const ratioTotal = Object.values(ratios).reduce((s, v) => s + ni(v), 0)
      const sets = ni(pack.config?.sets_per_carton)
      if (ratioTotal > 0 && sets > 0) return ratioTotal * sets
    }
    return ni(pack.units_per_carton)
  }

  const totalAssigned = packs.reduce((s, p) => s + packQty(p), 0)
  const balance = activeQty - totalAssigned
  const fullyAssigned = activeQty > 0 && balance === 0

  const cbmForPack = (pack) => {
    const l = n(pack.carton_l), w = n(pack.carton_w), h = n(pack.carton_h)
    if (!l || !w || !h) return null
    return ((l * w * h) / 1000000).toFixed(4)
  }
  const totalCartons = (pack) => {
    const upc = derivedUnitsPerCarton(pack)
    return ceilDiv(packQty(pack), upc)
  }
  const totalInnerPacks = (pack) => ceilDiv(packQty(pack), ni(pack.pieces_per_inner_pack))

  const doSave = useCallback(async () => {
    if (!orderId) return
    let fid = finishingIdRef.current
    const payload = { order_id: orderId, use_cutting_qty: useCuttingQtyRef.current, total_qty: orderQty }
    if (fid) {
      await supabase.from('finishing').update(payload).eq('id', fid)
    } else {
      const { data: newFin } = await supabase.from('finishing').insert([payload]).select().single()
      if (newFin) { fid = newFin.id; setFinishingId(fid) }
    }
    if (fid) {
      await supabase.from('finishing_packs').delete().eq('finishing_id', fid)
      const packRows = packsRef.current.map((p, idx) => {
        const nextConfig = {
          ...(p.config || {}),
          __packMeta: {
            packing_basis: p.pack_type || 'By Q#',
            inner_pack_type: p.inner_pack_type || 'None',
            pieces_per_inner_pack: ni(p.pieces_per_inner_pack) || null,
            carton_style: p.carton_style || 'Flat Packed',
          },
        }
        return {
          finishing_id: fid,
          order_id: orderId,
          pack_name: p.pack_name || null,
          pack_type: p.pack_type || 'By Q#',
          pack_basis: p.pack_type || 'By Q#',
          config: nextConfig,
          carton_l: n(p.carton_l) || null,
          carton_w: n(p.carton_w) || null,
          carton_h: n(p.carton_h) || null,
          carton_weight_kg: n(p.carton_weight_kg) || null,
          units_per_carton: derivedUnitsPerCarton(p) || null,
          pcs_per_carton: derivedUnitsPerCarton(p) || null,
          qty_assigned: packQty(p) || null,
          inner_pack_type: p.inner_pack_type || 'None',
          pieces_per_inner_pack: ni(p.pieces_per_inner_pack) || null,
          carton_style: p.carton_style || 'Flat Packed',
          hang_flat: p.carton_style || 'Flat Packed',
          sort_order: idx,
        }
      })
      if (packRows.length) {
        const { error: packInsertError } = await supabase.from('finishing_packs').insert(packRows)
        if (packInsertError) {
          // Fallback for older DBs that do not yet have the new finishing_packs helper columns.
          const baseRows = packRows.map(({
            order_id, pack_basis, pcs_per_carton, inner_pack_type, pieces_per_inner_pack, carton_style, ...base
          }) => ({ ...base, order_id }))
          const { error: fallbackError } = await supabase.from('finishing_packs').insert(baseRows)
          if (fallbackError) throw fallbackError
        }
      }
    }
    await supabase.from('orders').update({ step_finishing: enabledRef.current }).eq('id', orderId)
    onSaved(orderId, { step_finishing: enabledRef.current })
  }, [orderId, orderQty, onSaved])

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave, registerSave])

  const handleSave = async () => {
    setSaving(true)
    try {
      await doSave()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    }
    setSaving(false)
  }

  const inp = (extra) => ({ height: 30, padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', ...(extra || {}) })
  const labelStyle = { fontSize: 10, fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Finishing & Packing</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Configure packing basis, inner packs, cartons and auto-calculated requirements.</div>
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

          {activeQty > 0 && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 7, background: fullyAssigned ? '#f0fdf4' : balance < 0 ? '#fef2f2' : '#fffbeb', border: `1px solid ${fullyAssigned ? '#bbf7d0' : balance < 0 ? '#fecaca' : '#fde68a'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: fullyAssigned ? '#16a34a' : balance < 0 ? '#dc2626' : '#d97706' }}>
                  {fullyAssigned ? '✓ All units assigned' : balance < 0 ? `Over-assigned by ${Math.abs(balance).toLocaleString()} pcs` : `${balance.toLocaleString()} pcs remaining`}
                </span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{totalAssigned.toLocaleString()} / {activeQty.toLocaleString()} pcs assigned</span>
              </div>
              <div style={{ marginTop: 6, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: fullyAssigned ? '#16a34a' : balance < 0 ? '#dc2626' : '#d97706', borderRadius: 3, width: `${Math.min(100, activeQty > 0 ? (totalAssigned / activeQty) * 100 : 0)}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {packs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 28, color: '#9ca3af', fontSize: 12, background: '#fafaf8', borderRadius: 8, border: '1px solid #f0f0ee', marginBottom: 12 }}>
              No packing rows yet. Add one to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {packs.map((pack, idx) => {
                const basis = pack.pack_type || 'By Q#'
                const pQty = packQty(pack)
                const cartons = totalCartons(pack)
                const innerPacks = totalInnerPacks(pack)
                const cbm = cbmForPack(pack)
                const pcsPerCarton = derivedUnitsPerCarton(pack)
                const configured = basis === 'By Ratio' ? !!pack.config?.qty_assigned : !!pack.config?.lines?.length
                return (
                  <div key={pack._tempId || idx} style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 180px auto auto auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
                      <div>
                        <label style={labelStyle}>Pack Name</label>
                        <input style={{ ...inp(), width: '100%' }} value={pack.pack_name || ''} onChange={e => updPack(idx, 'pack_name', e.target.value)} placeholder="e.g. Export Pack, Carton Set A" />
                      </div>
                      <div>
                        <label style={labelStyle}>Packing Basis</label>
                        <select style={{ ...inp(), width: '100%', cursor: 'pointer' }} value={basis} onChange={e => updPack(idx, 'pack_type', e.target.value)}>
                          {PACKING_BASES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Configure</label>
                        <button onClick={() => setConfigModal({ packIdx: idx })}
                          style={{ height: 30, padding: '0 10px', background: configured ? '#eff6ff' : '#fff7ed', border: `1px solid ${configured ? '#bfdbfe' : '#fed7aa'}`, borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'Inter,sans-serif', color: configured ? '#2563eb' : '#f97316' }}>
                          <Settings2 size={11} /> {configured ? 'Edit' : 'Configure'}
                        </button>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <label style={labelStyle}>Assigned Qty</label>
                        <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 13, fontWeight: 700, color: pQty > 0 ? '#0d0d0d' : '#9ca3af' }}>
                          {pQty > 0 ? pQty.toLocaleString() : '—'}
                        </div>
                      </div>
                      <div style={{ paddingBottom: 1 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setPacks(ps => ps.filter((_, i) => i !== idx))}><Trash2 size={12} /></button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '140px 130px 120px 120px 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={labelStyle}>Inner Pack Type</label>
                        <select style={{ ...inp(), width: '100%', cursor: 'pointer' }} value={pack.inner_pack_type || 'None'} onChange={e => updPack(idx, 'inner_pack_type', e.target.value)}>
                          {INNER_PACK_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Pieces / {pack.inner_pack_type === 'Blister' ? 'Blister' : pack.inner_pack_type === 'Master Poly' ? 'Master Poly' : 'Inner Pack'}</label>
                        <input type="number" style={{ ...inp({ width: '100%', textAlign: 'right' }) }} value={pack.pieces_per_inner_pack || ''} onChange={e => updPack(idx, 'pieces_per_inner_pack', e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'end' }}>
                        <div style={{ width: '100%', height: 30, borderRadius: 6, background: '#fafaf8', border: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: innerPacks ? '#0d0d0d' : '#9ca3af', fontWeight: 700 }}>
                          <Package2 size={12} style={{ marginRight: 6 }} /> {innerPacks || '—'} packs
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Pieces / Carton</label>
                        <input type="number" disabled={basis === 'By Ratio' && !!pack.config?.sets_per_carton && !!pack.config?.ratios} style={{ ...inp({ width: '100%', textAlign: 'right', background: basis === 'By Ratio' ? '#fafaf8' : '#fff' }) }} value={pcsPerCarton || ''} onChange={e => updPack(idx, 'units_per_carton', e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'end' }}>
                        <div style={{ width: '100%', height: 30, borderRadius: 6, background: '#fafaf8', border: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: cartons ? '#0d0d0d' : '#9ca3af', fontWeight: 700 }}>
                          <Boxes size={12} style={{ marginRight: 6 }} /> {cartons || '—'} cartons
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: 8, alignItems: 'end' }}>
                      {[['L (cm)', 'carton_l'], ['W (cm)', 'carton_w'], ['H (cm)', 'carton_h'], ['Weight (kg)', 'carton_weight_kg']].map(([label, key]) => (
                        <div key={key}>
                          <label style={labelStyle}>{label}</label>
                          <input type="number" style={{ ...inp({ width: '100%', textAlign: 'right' }) }} value={pack[key] || ''} onChange={e => updPack(idx, key, e.target.value)} />
                        </div>
                      ))}
                      <div>
                        <label style={labelStyle}>Carton Style</label>
                        <select style={{ ...inp({ width: '100%', cursor: 'pointer' }) }} value={pack.carton_style || 'Flat Packed'} onChange={e => updPack(idx, 'carton_style', e.target.value)}>
                          {CARTON_STYLES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div style={{ paddingBottom: 1, whiteSpace: 'nowrap' }}>
                        {cbm ? (
                          <div style={{ fontSize: 10, color: '#6b7280' }}>
                            {cbm} m³/ctn
                            {cartons ? <span style={{ marginLeft: 6, fontWeight: 700, color: '#0d0d0d' }}>{cartons} ctns</span> : null}
                            {cartons && cbm ? <span style={{ marginLeft: 6, color: '#7c3aed', fontWeight: 600 }}>{(parseFloat(cbm) * cartons).toFixed(3)} m³</span> : null}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>Enter carton dimensions</div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={addPack}><Plus size={12} /> Add Packing Row</button>
            <button className="btn btn-primary btn-sm" disabled={!packs.length} onClick={() => setShowPackingPreview(true)}>Preview Packing / Export Excel</button>
          </div>
        </>
      )}

      {showPackingPreview && (
        <PackingPreviewModal
          packs={packs}
          poData={poData}
          activeQty={activeQty}
          orderData={orderData}
          onClose={() => setShowPackingPreview(false)}
        />
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
