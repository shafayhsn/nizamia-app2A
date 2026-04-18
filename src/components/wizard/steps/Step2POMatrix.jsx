import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { markTabUpdated } from '../../../lib/tabNotices'
import { Plus, Trash2, Check, X, Star, Layers, Settings2 } from 'lucide-react'

function tempId() { return Math.random().toString(36).slice(2) }


function groupSignature(g) {
  const sizes = [...(g.sizes || [])].join('|')
  const colors = (g.colors || []).map(c => (c.color_name || '').trim().toLowerCase()).filter(Boolean).sort().join('|')
  return `${(g.group_name || '').trim().toLowerCase()}__${sizes}__${colors}`
}

function normalizeUniqueGroups(groups) {
  const map = new Map()
  ;(groups || []).forEach(g => {
    const sig = groupSignature(g) || `${(g.group_name||'').trim().toLowerCase()}__${[...(g.sizes||[])].join('|')}`
    if (!map.has(sig)) {
      map.set(sig, { ...g, colors:[...(g.colors||[])], breakdown:{ ...(g.breakdown||{}) } })
      return
    }
    const ex = map.get(sig)
    ;(g.colors || []).forEach(c => {
      const name = (c.color_name || '').trim().toLowerCase()
      const exists = (ex.colors || []).some(x => (x.color_name || '').trim().toLowerCase() === name)
      if (!exists) ex.colors.push(c)
      const key = c.id || c._tempId
      if (g.breakdown?.[key]) ex.breakdown[key] = { ...(ex.breakdown[key] || {}), ...g.breakdown[key] }
    })
  })
  return Array.from(map.values())
}

function newGroup(n) {
  return {
    _tempId: tempId(),
    group_name: `Group ${n}`, unit_price: '', currency: 'USD',
    sizes: [], base_size: null,
    colors: [{ _tempId: tempId(), color_name: '', ratio_locked: false, ratio_override: null }],
    breakdown: {},
  }
}


function parseLegacyPoMatrix(source) {
  const candidates = [
    source?.po_matrix,
    source?.po_matrix_json,
    source?.meta?.po_matrix,
    source?.meta && typeof source.meta === 'string' ? (() => { try { return JSON.parse(source.meta)?.po_matrix } catch { return null } })() : null,
  ]
  for (const cand of candidates) {
    if (Array.isArray(cand) && cand.length) return cand
    if (typeof cand === 'string' && cand.trim()) {
      try {
        const parsed = JSON.parse(cand)
        if (Array.isArray(parsed)) return parsed
        if (Array.isArray(parsed?.po_matrix)) return parsed.po_matrix
      } catch {}
    }
  }
  return []
}

function normalizeLegacyGroupName(name='') {
  return String(name).replace(/x$/i,'').trim()
}

function parseRatioParts(ratio) {
  const nums = String(ratio || '').match(/\d+(?:\.\d+)?/g) || []
  return nums.map(Number).filter(n => Number.isFinite(n) && n > 0)
}

function distributeByRatio(sizes, ratio, totalQty) {
  const total = parseInt(totalQty) || 0
  const list = Array.isArray(sizes) ? sizes : []
  if (!list.length) return {}
  const parts = parseRatioParts(ratio)
  const weights = parts.length === list.length ? parts : new Array(list.length).fill(1)
  const sum = weights.reduce((a,b)=>a+b,0) || list.length
  const out = {}
  let assigned = 0
  list.forEach((sz, idx) => {
    if (idx === list.length - 1) out[sz] = Math.max(0, total - assigned)
    else {
      const q = Math.round((weights[idx] / sum) * total)
      out[sz] = q
      assigned += q
    }
  })
  return out
}

function buildGroupsFromLegacyMatrix(rows, templates=[]) {
  const templateMap = new Map((templates || []).map(t => [String(t.name || t.group_name || '').trim().toLowerCase(), t]))
  const grouped = new Map()
  ;(rows || []).forEach((row, idx) => {
    const groupName = normalizeLegacyGroupName(row?.size_group || row?.group_name || row?.sizeGroup || `Group ${idx+1}`)
    const key = groupName.toLowerCase()
    const tmpl = templateMap.get(key)
    const sizes = Array.isArray(tmpl?.sizes) && tmpl.sizes.length ? tmpl.sizes : []
    if (!grouped.has(key)) {
      grouped.set(key, {
        _tempId: tempId(),
        group_name: groupName,
        unit_price: row?.price ?? row?.unit_price ?? '',
        currency: row?.currency || 'USD',
        sizes: [...sizes],
        base_size: tmpl?.base_size || sizes[0] || null,
        colors: [],
        breakdown: {},
      })
    }
    const g = grouped.get(key)
    if ((!g.unit_price && g.unit_price !== 0) || g.unit_price === '') g.unit_price = row?.price ?? row?.unit_price ?? ''
    const colorName = String(row?.wash || row?.color || row?.colour || row?.color_name || row?.wash_name || '').trim()
    const color = { _tempId: tempId(), color_name: colorName, ratio_locked: true, ratio_override: null }
    g.colors.push(color)
    const ratioOverride = {}
    const weights = parseRatioParts(row?.ratio)
    ;(g.sizes || []).forEach((sz, i) => { ratioOverride[sz] = String(weights[i] ?? 1) })
    color.ratio_override = ratioOverride
    g.breakdown[color._tempId] = distributeByRatio(g.sizes, row?.ratio, row?.qty)
  })
  return Array.from(grouped.values())
}

// ── Ratio Gear Modal ──────────────────────────────────────────────────────────
function RatioModal({ g, ci, onClose, onApply }) {
  const c = g.colors[ci]
  const colorKey = c.id || c._tempId
  const totalQty = g.sizes.reduce((s, sz) => s + (parseInt(g.breakdown[colorKey]?.[sz]) || 0), 0)
  const [inputs, setInputs] = useState(() => {
    if (c.ratio_override) return { ...c.ratio_override }
    const bd = g.breakdown[colorKey] || {}
    const min = Math.min(...g.sizes.map(sz => parseInt(bd[sz]) || 0).filter(v => v > 0))
    const obj = {}
    g.sizes.forEach(sz => { obj[sz] = min > 0 ? String(Math.round((parseInt(bd[sz]) || 0) / min)) : '' })
    return obj
  })
  const [manualTotal, setManualTotal] = useState(totalQty || '')

  const ratioSum = g.sizes.reduce((s, sz) => s + (parseFloat(inputs[sz]) || 0), 0)
  const preview = ratioSum > 0 && manualTotal
    ? g.sizes.map(sz => ({ sz, qty: Math.round(((parseFloat(inputs[sz]) || 0) / ratioSum) * manualTotal) }))
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 440, boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Configure Ratio — {c.color_name || 'Colour'}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Enter ratio values per size. System will distribute quantity accordingly.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Qty for this colour</label>
            <input type="number" value={manualTotal}
              onChange={e => setManualTotal(e.target.value)}
              style={{ width: 120, height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontWeight: 700, fontFamily: 'Inter,sans-serif', outline: 'none' }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Ratio per size</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, marginBottom: 14 }}>
            {g.sizes.map(sz => (
              <div key={sz} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: sz === g.base_size ? '#1a1a2e' : '#6b7280', marginBottom: 3 }}>{sz}{sz === g.base_size ? ' ★' : ''}</div>
                <input type="number" step="0.1" value={inputs[sz] || ''}
                  onChange={e => setInputs(p => ({ ...p, [sz]: e.target.value }))}
                  style={{ width: '100%', height: 32, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none' }} />
                {preview && <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 600, marginTop: 2 }}>{preview.find(p => p.sz === sz)?.qty ?? ''}</div>}
              </div>
            ))}
          </div>
          {preview && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#1d4ed8', fontWeight: 600, marginBottom: 14 }}>
              Preview total: {preview.reduce((s, p) => s + p.qty, 0).toLocaleString()} pcs
            </div>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => onApply(ci, null, false)} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear Override</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onApply(ci, inputs, true, parseInt(manualTotal) || null)}>Apply Ratio</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Step2POMatrix({ orderId, orderData, onSaved, registerSave }) {
  const [groups, setGroups]         = useState([newGroup(1)])
  const [saving, setSaving]         = useState(false)
  const [saved,  setSaved]          = useState(false)
  const [sizesMgr, setSizesMgr]     = useState(null)
  const [customSize, setCustomSize] = useState('')
  const [libGroups, setLibGroups]   = useState([])
  const [ratioModal, setRatioModal] = useState(null) // { gi, ci }
  const [excessCut,  setExcessCut]  = useState('')
  const [splitRule,  setSplitRule]  = useState('None')
  const [qSaved,     setQSaved]     = useState(false)

  const groupsRef    = useRef(groups)
  const excessCutRef = useRef(excessCut)
  const splitRuleRef = useRef(splitRule)
  useEffect(() => { groupsRef.current    = groups    }, [groups])
  useEffect(() => { excessCutRef.current = excessCut }, [excessCut])
  useEffect(() => { splitRuleRef.current = splitRule }, [splitRule])

  useEffect(() => { if (orderId) loadGroups() }, [orderId])

  useEffect(() => {
    supabase.from('size_group_templates').select('*').order('name').then(({ data }) => setLibGroups(data || []))
  }, [])

  // Load excess cutting % and split rule from order
  useEffect(() => {
    if (orderData?.excess_cutting_pct != null) setExcessCut(orderData.excess_cutting_pct || '')
    if (orderData?.queue_split_rule)  setSplitRule(orderData.queue_split_rule)
  }, [orderData])

  async function persistGroups(gs, orderRow = null) {
    if (!orderId) throw new Error('No order ID')
    await supabase.from('size_groups').delete().eq('order_id', orderId)
    for (let gi = 0; gi < gs.length; gi++) {
      const g = gs[gi]
      const { data: sg } = await supabase.from('size_groups').insert([{
        order_id: orderId, group_name: g.group_name,
        unit_price: parseFloat(g.unit_price) || null,
        currency: g.currency || 'USD', sizes: g.sizes || [],
        base_size: g.base_size || null, sort_order: gi,
      }]).select().single()
      if (!sg) continue
      for (let ci = 0; ci < (g.colors || []).length; ci++) {
        const c = g.colors[ci]
        if (!c.color_name?.trim()) continue
        const { data: sc } = await supabase.from('size_group_colors').insert([{
          size_group_id: sg.id, color_name: c.color_name, sort_order: ci,
          ratio_override: c.ratio_override || null, ratio_locked: !!c.ratio_locked,
        }]).select().single()
        if (!sc) continue
        const srcKey = c._tempId || c.id
        const bRows = (g.sizes || []).map(sz => ({
          size_group_id: sg.id, color_id: sc.id, size: sz,
          qty: parseInt(g.breakdown?.[srcKey]?.[sz]) || 0,
        })).filter(r => r.qty > 0)
        if (bRows.length) await supabase.from('size_group_breakdown').insert(bRows)
      }
    }
    let total_qty = 0, total_value_usd = 0
    for (const g of gs) {
      const unitPrice = parseFloat(g.unit_price) || 0
      for (const c of (g.colors || [])) {
        if (!c.color_name?.trim()) continue
        const colorQty = (g.sizes || []).reduce((s, sz) => s + (parseInt(g.breakdown?.[c._tempId || c.id]?.[sz]) || 0), 0)
        total_qty += colorQty
        total_value_usd += colorQty * unitPrice
      }
    }
    const exPct = parseFloat(excessCutRef.current) || 0
    const rule = splitRuleRef.current || orderRow?.queue_split_rule || 'None'
    await supabase.from('orders').update({ step_po_matrix: true, total_qty, total_value_usd, excess_cutting_pct: exPct, queue_split_rule: rule }).eq('id', orderId)
    onSaved(orderId, { step_po_matrix: true, total_qty, total_value_usd, excess_cutting_pct: exPct, queue_split_rule: rule })
  }

  async function hydrateLegacyMatrix(orderRow) {
    const templates = libGroups.length ? libGroups : (await supabase.from('size_group_templates').select('*').order('name')).data || []
    const legacyRows = parseLegacyPoMatrix(orderRow || orderData)
    if (!legacyRows.length) return false
    const built = normalizeUniqueGroups(buildGroupsFromLegacyMatrix(legacyRows, templates))
    if (!built.length) return false
    setGroups(built)
    await persistGroups(built, orderRow)
    return true
  }

  async function loadGroups() {
    const { data: sg } = await supabase.from('size_groups').select('*').eq('order_id', orderId).order('sort_order')
    if (!sg?.length) {
      const { data: ord } = await supabase.from('orders').select('*').eq('id', orderId).single()
      const hydrated = await hydrateLegacyMatrix(ord || orderData)
      if (!hydrated) setGroups([newGroup(1)])
      if (ord?.excess_cutting_pct != null) setExcessCut(ord.excess_cutting_pct || '')
      if (ord?.queue_split_rule) setSplitRule(ord.queue_split_rule)
      return
    }
    const sgIds = sg.map(g => g.id)
    const [{ data: colors }, { data: bd }] = await Promise.all([
      supabase.from('size_group_colors').select('*').in('size_group_id', sgIds).order('sort_order'),
      supabase.from('size_group_breakdown').select('*').in('size_group_id', sgIds),
    ])
    const loaded = sg.map(g => {
      const gColors = (colors || []).filter(c => c.size_group_id === g.id)
      const breakdown = {}
      ;(bd || []).filter(b => b.size_group_id === g.id).forEach(b => {
        if (!breakdown[b.color_id]) breakdown[b.color_id] = {}
        breakdown[b.color_id][b.size] = b.qty
      })
      return {
        ...g, _tempId: g.id,
        colors: gColors.map(c => ({ ...c, _tempId: c.id })),
        breakdown,
      }
    })
    setGroups(normalizeUniqueGroups(loaded))

    const { data: ord } = await supabase.from('orders').select('excess_cutting_pct,queue_split_rule').eq('id', orderId).single()
    if (ord?.excess_cutting_pct != null) setExcessCut(ord.excess_cutting_pct || '')
    if (ord?.queue_split_rule)           setSplitRule(ord.queue_split_rule)
  }

  const doSave = useCallback(async () => {
    if (!orderId) throw new Error('No order ID')
    const gs = normalizeUniqueGroups(groupsRef.current)
    await persistGroups(gs, orderData)
  }, [orderId, orderData, libGroups])

  // ── Generate Queues ────────────────────────────────────────────────────────
  const generateQueues = async () => {
    if (!orderId) return
    const rule = splitRuleRef.current
    if (rule === 'None') return
    const gs = normalizeUniqueGroups(groupsRef.current)
    const { data: order } = await supabase.from('orders').select('job_id').eq('id', orderId).single()

    // Build queue rows based on rule
    let qRows = []

    if (rule === 'By Wash' || rule === 'By Colour') {
      // One Q per colour across all size groups
      const seen = []
      gs.forEach(g => {
        g.colors.forEach(c => {
          if (!c.color_name?.trim()) return
          const key = c._tempId || c.id
          const qty = g.sizes.reduce((s, sz) => s + (parseInt(g.breakdown[key]?.[sz]) || 0), 0)
          if (!seen.includes(c.color_name)) {
            seen.push(c.color_name)
            qRows.push({ color_name: c.color_name, label: c.color_name, qty })
          } else {
            const ex = qRows.find(r => r.label === c.color_name)
            if (ex) ex.qty += qty
          }
        })
      })
    } else if (rule === 'By Size Group') {
      gs.forEach(g => {
        const qty = g.colors.reduce((s, c) => {
          const key = c._tempId || c.id
          return s + g.sizes.reduce((ss, sz) => ss + (parseInt(g.breakdown[key]?.[sz]) || 0), 0)
        }, 0)
        qRows.push({ label: g.group_name, qty, size_group_name: g.group_name })
      })
    } else if (rule === 'Colour × Size Group') {
      gs.forEach(g => {
        g.colors.forEach(c => {
          if (!c.color_name?.trim()) return
          const key = c._tempId || c.id
          const qty = g.sizes.reduce((s, sz) => s + (parseInt(g.breakdown[key]?.[sz]) || 0), 0)
          if (!qty) return
          qRows.push({
            label: `${c.color_name} / ${g.group_name}`,
            qty,
            color_name: c.color_name,
            size_group_name: g.group_name,
          })
        })
      })
    } else if (rule === 'By Ratio') {
      gs.forEach(g => {
        g.colors.forEach(c => {
          if (!c.color_name?.trim()) return
          const key = c._tempId || c.id
          const qty = g.sizes.reduce((s, sz) => s + (parseInt(g.breakdown[key]?.[sz]) || 0), 0)
          if (!qty) return
          const ratioObj = c.ratio_override || g.sizes.reduce((acc, sz) => {
            const q = parseInt(g.breakdown[key]?.[sz]) || 0
            if (q > 0) acc[sz] = q
            return acc
          }, {})
          const ratioLabel = g.sizes.map(sz => parseFloat(ratioObj?.[sz]) || 0).filter(v => v > 0).join(':') || 'Custom Ratio'
          qRows.push({
            label: `${ratioLabel} · ${c.color_name} / ${g.group_name}`,
            qty,
            color_name: c.color_name,
            size_group_name: g.group_name,
          })
        })
      })
    } else if (rule === 'Custom') {
      // One placeholder Q — user fills qty manually in Queues tab
      qRows.push({ label: 'Custom Q1', qty: 0 })
    }

    // Delete existing queues for this order and re-generate
    await supabase.from('order_queues').delete().eq('order_id', orderId)
    if (qRows.length) {
      // Look up size_group ids for By Size Group
      let sgMap = {}
      if (rule === 'By Size Group') {
        const { data: sgs } = await supabase.from('size_groups').select('id,group_name').eq('order_id', orderId)
        sgs?.forEach(sg => { sgMap[sg.group_name] = sg.id })
      }
      const merged = []
      const qMap = new Map()
      qRows.forEach(r => {
        const sgId = r.size_group_name ? (sgMap[r.size_group_name] || null) : null
        const key = [r.label, r.color_name || '', sgId || ''].join('__')
        if (!qMap.has(key)) qMap.set(key, { ...r, size_group_id: sgId, qty: 0 })
        qMap.get(key).qty += Number(r.qty || 0)
      })
      qMap.forEach(v => merged.push(v))
      const insertRows = merged.map((r, i) => ({
        order_id:      orderId,
        job_id:        order?.job_id || null,
        q_number:      null,
        split_rule:    rule,
        label:         r.label,
        color_name:    r.color_name || null,
        size_group_id: r.size_group_id || null,
        qty:           r.qty || 0,
        status:        'Queued',
        sort_order:    i,
      }))
      await supabase.from('order_queues').insert(insertRows)
    }
    markTabUpdated('ordersPage', 'queues')
    setQSaved(true)
    setTimeout(() => setQSaved(false), 3000)
  }

  useEffect(() => { if (registerSave) registerSave(doSave) }, [doSave])

  const handleSave = async () => {
    setSaving(true)
    try { await doSave(); setSaved(true); setTimeout(() => setSaved(false), 2000) } catch(e) { console.error(e) }
    setSaving(false)
  }

  const updGroup = (gi, k, v) => setGroups(gs => gs.map((g, i) => i === gi ? { ...g, [k]: v } : g))
  const ck = (c) => c.id || c._tempId

  const setQty = (gi, colorKey, sz, val) => setGroups(gs => gs.map((g, i) => {
    if (i !== gi) return g
    const bd = { ...g.breakdown, [colorKey]: { ...g.breakdown[colorKey], [sz]: parseInt(val) || 0 } }
    // If qty changed manually, clear ratio lock for this color
    const colors = g.colors.map(c => ck(c) === colorKey ? { ...c, ratio_locked: false, ratio_override: null } : c)
    return { ...g, breakdown: bd, colors }
  }))

  const colorTotal = (g, colorKey) => g.sizes.reduce((s, sz) => s + (parseInt(g.breakdown[colorKey]?.[sz]) || 0), 0)
  const sizeTotal  = (g, sz) => g.colors.reduce((s, c) => s + (parseInt(g.breakdown[ck(c)]?.[sz]) || 0), 0)
  const grandTotal = (g) => g.colors.reduce((s, c) => s + colorTotal(g, ck(c)), 0)
  const groupValue = (g) => grandTotal(g) * (parseFloat(g.unit_price) || 0)

  // Auto-compute ratio from qty
  const calcAutoRatio = (g, colorKey) => {
    const qtys = g.sizes.map(sz => parseInt(g.breakdown[colorKey]?.[sz]) || 0)
    const nonZero = qtys.filter(v => v > 0)
    if (!nonZero.length) return null
    const min = Math.min(...nonZero)
    return g.sizes.map(sz => {
      const q = parseInt(g.breakdown[colorKey]?.[sz]) || 0
      return q > 0 ? String(Math.round(q / min)) : '0'
    }).join(' : ')
  }

  // Apply ratio override → distribute total qty by ratio
  const applyRatio = (gi, ci, ratioInputs, isLocked, totalQtyOverride) => {
    setGroups(gs => gs.map((g, i) => {
      if (i !== gi) return g
      const c = g.colors[ci]
      const colorKey = ck(c)
      if (!isLocked) {
        // Clear override
        const colors = g.colors.map((col, j) => j === ci ? { ...col, ratio_locked: false, ratio_override: null } : col)
        return { ...g, colors }
      }
      const ratioSum = g.sizes.reduce((s, sz) => s + (parseFloat(ratioInputs[sz]) || 0), 0)
      if (!ratioSum) return g
      const total = totalQtyOverride || colorTotal(g, colorKey) || 0
      // Distribute with rounding correction on base size
      const distributed = {}
      let remaining = total
      g.sizes.forEach((sz, idx) => {
        if (idx === g.sizes.length - 1) {
          distributed[sz] = remaining
        } else {
          const q = Math.round(((parseFloat(ratioInputs[sz]) || 0) / ratioSum) * total)
          distributed[sz] = q
          remaining -= q
        }
      })
      const bd = { ...g.breakdown, [colorKey]: distributed }
      const colors = g.colors.map((col, j) => j === ci ? { ...col, ratio_locked: true, ratio_override: ratioInputs } : col)
      return { ...g, breakdown: bd, colors }
    }))
    setRatioModal(null)
  }

  const toggleSize = (gi, sz) => setGroups(gs => gs.map((g, i) => {
    if (i !== gi) return g
    const has = g.sizes.includes(sz)
    const sizes = has ? g.sizes.filter(s => s !== sz) : [...g.sizes, sz]
    const base_size = has && g.base_size === sz ? (sizes[0] || null) : g.base_size
    return { ...g, sizes, base_size }
  }))

  const addCustomSize = (gi) => {
    const s = customSize.trim()
    if (!s) return
    setGroups(gs => gs.map((g, i) => {
      if (i !== gi || g.sizes.includes(s)) return g
      return { ...g, sizes: [...g.sizes, s] }
    }))
    setCustomSize('')
  }

  const applyLibraryGroup = (gi, libGroup) => {
    setGroups(gs => gs.map((g, i) => {
      if (i !== gi) return g
      const merged = [...new Set([...g.sizes, ...libGroup.sizes])]
      const base_size = g.base_size || libGroup.sizes[0] || null
      return { ...g, sizes: merged, base_size }
    }))
  }

  const inp  = { width: '100%', height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', background: '#fff', boxSizing: 'border-box' }
  const sel  = { ...inp, cursor: 'pointer', appearance: 'none' }
  const lbl  = { fontSize: 11, fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: 4 }
  const cell = { padding: '4px 4px', borderBottom: '1px solid #f0f0ee', textAlign: 'center' }

  return (
    <div>
      {/* Top controls: Excess Cutting % + Queue Split Rule */}
      <div style={{ background: '#fafaf8', border: '1px solid #e8e8e6', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Excess Cut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Excess Cutting %</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>Applied order-wide</div>
          </div>
          <input type="number" step="0.5" min="0" max="50" value={excessCut}
            onChange={e => setExcessCut(e.target.value)}
            style={{ width: 72, height: 34, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 15, fontWeight: 700, fontFamily: 'var(--font)', outline: 'none', textAlign: 'center' }}
            placeholder="0" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>%</span>
          {excessCut > 0 && (
            <div style={{ fontSize: 10, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 5, padding: '3px 8px', fontWeight: 600 }}>
              ×{(1 + parseFloat(excessCut) / 100).toFixed(3)}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 32, background: '#e8e8e6' }} />

        {/* Queue Split Rule */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Queue Split</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>Auto-generates Qs</div>
          </div>
          <select value={splitRule} onChange={e => setSplitRule(e.target.value)}
            style={{ height: 34, padding: '0 28px 0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', outline: 'none', cursor: 'pointer', background: '#fff', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
            <option value="None">No Split</option>
            <option value="By Colour">By Colour / Wash</option>
            <option value="By Size Group">By Size Group</option>
            <option value="Colour × Size Group">Colour × Size Group</option>
            <option value="By Ratio">By Ratio</option>
            <option value="Custom">Custom</option>
          </select>
          {splitRule !== 'None' && (
            <button onClick={generateQueues}
              style={{ height: 34, padding: '0 14px', background: '#0d0d0d', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 5 }}>
              {qSaved ? '✓ Generated' : 'Generate Qs'}
            </button>
          )}
        </div>
      </div>

      {groups.map((g, gi) => (
        <div key={g._tempId || gi} style={{ background: '#fff', border: '1px solid #e8e8e6', borderRadius: 10, marginBottom: 20, overflow: 'hidden' }}>

          {/* Group header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0ee', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', background: '#fafaf8' }}>
            <div style={{ minWidth: 130 }}>
              <label style={lbl}>Group Name</label>
              <input style={inp} value={g.group_name} onChange={e => updGroup(gi, 'group_name', e.target.value)} />
            </div>
            <div style={{ minWidth: 100 }}>
              <label style={lbl}>Unit Price</label>
              <input style={inp} type="number" step="0.01" value={g.unit_price} onChange={e => updGroup(gi, 'unit_price', e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ minWidth: 80 }}>
              <label style={lbl}>Currency</label>
              <select style={sel} value={g.currency} onChange={e => updGroup(gi, 'currency', e.target.value)}>
                {['USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 90 }}>
              <label style={lbl}>Base Size ★</label>
              <select style={sel} value={g.base_size || ''} onChange={e => updGroup(gi, 'base_size', e.target.value)}>
                <option value="">—</option>
                {g.sizes.map(sz => <option key={sz}>{sz}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={lbl}>Sizes</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {g.sizes.length === 0 && <span style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>No sizes added</span>}
                {g.sizes.map(sz => (
                  <span key={sz} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: sz === g.base_size ? '#1a1a2e' : '#f0f0ee', color: sz === g.base_size ? '#fff' : '#374151' }}>
                    {sz}{sz === g.base_size ? ' ★' : ''}
                  </span>
                ))}
                <button onClick={() => setSizesMgr(gi)} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#eff6ff', color: '#2563eb', border: 'none', cursor: 'pointer' }}>
                  Manage Sizes
                </button>
              </div>
            </div>
            {groups.length > 1 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setGroups(gs => gs.filter((_, i) => i !== gi))}>
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Matrix */}
          <div style={{ overflowX: 'auto', padding: '0 16px 16px' }}>
            {g.sizes.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                Click <strong>Manage Sizes</strong> above to add sizes for this group.
              </div>
            ) : (
              <table style={{ borderCollapse: 'collapse', marginTop: 12, minWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '6px 8px 6px 0', textTransform: 'uppercase', letterSpacing: '0.8px', minWidth: 160 }}>Colour / Wash</th>
                    <th style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '6px 8px', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: 110, whiteSpace: 'nowrap' }}>Ratio</th>
                    {g.sizes.map(sz => (
                      <th key={sz} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, padding: '6px 4px', textTransform: 'uppercase', letterSpacing: '0.5px', color: sz === g.base_size ? '#1a1a2e' : '#9ca3af', minWidth: 58 }}>
                        {sz}{sz === g.base_size ? ' ★' : ''}
                      </th>
                    ))}
                    <th style={{ textAlign: 'right', fontSize: 10, fontWeight: 600, color: '#9ca3af', padding: '6px 0 6px 8px', textTransform: 'uppercase', minWidth: 60 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {g.colors.map((c, ci) => {
                    const colorKey = ck(c)
                    const tot = colorTotal(g, colorKey)
                    const autoRatio = calcAutoRatio(g, colorKey)
                    const isLocked = !!c.ratio_locked
                    return (
                      <tr key={colorKey}>
                        <td style={{ padding: '4px 0', borderBottom: '1px solid #f0f0ee' }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input style={{ ...inp, fontSize: 11 }} value={c.color_name}
                              onChange={e => setGroups(gs => gs.map((grp, i) => {
                                if (i !== gi) return grp
                                const colors = [...grp.colors]
                                colors[ci] = { ...colors[ci], color_name: e.target.value }
                                return { ...grp, colors }
                              }))}
                              placeholder="Colour / wash name" />
                            {g.colors.length > 1 && (
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => setGroups(gs => gs.map((grp, i) => i !== gi ? grp : { ...grp, colors: grp.colors.filter((_, j) => j !== ci) }))}>
                                <Trash2 size={10} />
                              </button>
                            )}
                          </div>
                        </td>
                        {/* Ratio cell */}
                        <td style={{ ...cell, minWidth: 110 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <span style={{ fontSize: 10, fontFamily: 'monospace', color: isLocked ? '#7c3aed' : '#6b7280', fontWeight: isLocked ? 700 : 400 }}>
                              {autoRatio || '—'}
                            </span>
                            {isLocked && <span style={{ fontSize: 9, background: '#f5f3ff', color: '#7c3aed', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>M</span>}
                            <button onClick={() => setRatioModal({ gi, ci })}
                              title="Configure ratio"
                              style={{ background: isLocked ? '#f5f3ff' : 'none', border: isLocked ? '1px solid #ede9fe' : 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', padding: '1px 3px' }}>
                              <Settings2 size={11} color={isLocked ? '#7c3aed' : '#9ca3af'} />
                            </button>
                          </div>
                        </td>
                        {g.sizes.map(sz => (
                          <td key={sz} style={cell}>
                            <input type="number" style={{ ...inp, width: 54, textAlign: 'center', fontSize: 11, padding: '0 4px', background: sz === g.base_size ? '#fafaf8' : '#fff' }}
                              value={g.breakdown[colorKey]?.[sz] || ''}
                              onChange={e => setQty(gi, colorKey, sz, e.target.value)}
                              placeholder="0" />
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, padding: '4px 0 4px 8px', borderBottom: '1px solid #f0f0ee' }}>
                          {tot > 0 ? tot.toLocaleString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: '#fafaf8' }}>
                    <td style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', padding: '8px 0' }}>TOTAL</td>
                    <td />
                    {g.sizes.map(sz => (
                      <td key={sz} style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, padding: '8px 4px' }}>
                        {sizeTotal(g, sz) || '—'}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, padding: '8px 0 8px 8px' }}>
                      {grandTotal(g).toLocaleString()}
                    </td>
                  </tr>
                  {excessCut > 0 && grandTotal(g) > 0 && (
                    <tr style={{ background: '#fdf4ff' }}>
                      <td style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', padding: '6px 0' }}>CUTTING QTY (+{excessCut}%)</td>
                      <td />
                      {g.sizes.map(sz => (
                        <td key={sz} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#7c3aed', padding: '6px 4px' }}>
                          {Math.ceil(sizeTotal(g, sz) * (1 + parseFloat(excessCut) / 100)) || '—'}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 12, color: '#7c3aed', padding: '6px 0 6px 8px' }}>
                        {Math.ceil(grandTotal(g) * (1 + parseFloat(excessCut) / 100)).toLocaleString()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setGroups(gs => gs.map((grp, i) => i !== gi ? grp : { ...grp, colors: [...grp.colors, { _tempId: tempId(), color_name: '', ratio_locked: false, ratio_override: null }] }))}>
                <Plus size={12} /> Add Colour
              </button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
                {grandTotal(g) > 0 && (
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {grandTotal(g).toLocaleString()} pcs
                    {g.unit_price && <span style={{ fontWeight: 700, color: '#1a1a2e', marginLeft: 8 }}>{g.currency} {groupValue(g).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {groups.length > 1 && (
        <div style={{ background: '#1a1a2e', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 24 }}>
          <div><div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Qty</div><div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{groups.reduce((s, g) => s + grandTotal(g), 0).toLocaleString()} pcs</div></div>
          <div><div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order Value</div><div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{groups.reduce((s, g) => s + groupValue(g), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD</div></div>
          {excessCut > 0 && <div><div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Cutting Qty</div><div style={{ fontSize: 16, fontWeight: 800, color: '#c4b5fd' }}>{Math.ceil(groups.reduce((s, g) => s + grandTotal(g), 0) * (1 + parseFloat(excessCut) / 100)).toLocaleString()} pcs</div></div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={() => setGroups(gs => [...gs, newGroup(gs.length + 1)])}><Plus size={14} /> Add Size Group</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !orderId}>{saving ? 'Saving...' : 'Save Matrix'}</button>
        {saved && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Saved</span>}
      </div>

      {/* Manage Sizes Modal */}
      {sizesMgr !== null && groups[sizesMgr] && (() => {
        const g = groups[sizesMgr]
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Manage Sizes</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{g.group_name} · {g.sizes.length} size{g.sizes.length !== 1 ? 's' : ''} selected</div>
                </div>
                <button onClick={() => setSizesMgr(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}><X size={16} /></button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Selected · click ★ to set base size</div>
                  {g.sizes.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#d1d5db', fontStyle: 'italic' }}>No sizes yet — pick from library or type your own below.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {g.sizes.map(sz => (
                        <div key={sz} style={{ display: 'flex', alignItems: 'center', gap: 0, background: sz === g.base_size ? '#1a1a2e' : '#f0f0ee', borderRadius: 6, overflow: 'hidden' }}>
                          <button onClick={() => updGroup(sizesMgr, 'base_size', sz)} style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', color: sz === g.base_size ? '#fbbf24' : '#9ca3af', display: 'flex' }}>
                            <Star size={10} fill={sz === g.base_size ? '#fbbf24' : 'none'} />
                          </button>
                          <span style={{ fontSize: 11, fontWeight: 700, color: sz === g.base_size ? '#fff' : '#374151', paddingRight: 6 }}>{sz}</span>
                          <button onClick={() => toggleSize(sizesMgr, sz)} style={{ padding: '4px 5px', background: 'none', border: 'none', cursor: 'pointer', color: sz === g.base_size ? 'rgba(255,255,255,0.6)' : '#9ca3af', display: 'flex' }}>
                            <X size={9} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={11} /> From Library
                  </div>
                  {libGroups.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#d1d5db', fontStyle: 'italic', padding: '8px 0' }}>No size groups in library yet. Add some in Library → Size Groups.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {libGroups.map(lg => (
                        <div key={lg.id} style={{ background: '#fafaf8', border: '1px solid #e8e8e6', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e', marginBottom: 5 }}>{lg.name}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {(lg.sizes || []).map(sz => {
                                const already = g.sizes.includes(sz)
                                return <span key={sz} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: already ? '#1a1a2e' : '#f0f0ee', color: already ? '#fff' : '#374151' }}>{sz}</span>
                              })}
                            </div>
                          </div>
                          <button onClick={() => applyLibraryGroup(sizesMgr, lg)}
                            style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6, background: '#1a1a2e', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Apply
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '1px solid #f0f0ee', paddingTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Enter Own Size</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none' }}
                      placeholder="Type a size and press Enter (e.g. 3XL, 44/46, One Size...)"
                      value={customSize} onChange={e => setCustomSize(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCustomSize(sizesMgr)} />
                    <button className="btn btn-secondary" onClick={() => addCustomSize(sizesMgr)}><Plus size={14} /> Add</button>
                  </div>
                </div>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={() => setSizesMgr(null)}>Done</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Ratio Modal */}
      {ratioModal && groups[ratioModal.gi] && (
        <RatioModal
          g={groups[ratioModal.gi]}
          ci={ratioModal.ci}
          onClose={() => setRatioModal(null)}
          onApply={(ci, inputs, isLocked, total) => applyRatio(ratioModal.gi, ci, inputs, isLocked, total)}
        />
      )}
    </div>
  )
}
