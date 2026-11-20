import { supabase } from './supabase'
import { purchasingLookup } from './poReview'
import { formatDate as fmtDate } from './utils'

const esc = value => String(value ?? '—').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c])

function normalizeUsageData(value) {
  if (!value) return {}
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) || {} } catch { return {} }
}

const displayQueueLabel = (label) => String(label || '').split('__APP2A_QC__')[0]
const parseQueueCustomComponents = (q) => {
  const raw = q?.custom_components
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  }
  return []
}


export async function fetchProgramData(q, ord, orderData = null) {
  const safeQuery = async (queryPromise, fallback) => {
    try {
      const { data, error } = await queryPromise
      if (error) return fallback
      return data ?? fallback
    } catch (e) {
      return fallback
    }
  }

  const [bom, washing, embellishments, finishing, packs, sgs, fitBlocks, pos, poi, libs, suppliers] = orderData
    ? await (async () => {
      const { bom, wash, embs, finishing, finishingPacks, sizeGroups, fits, pos, poItems } = orderData
      const libraryIds = [...new Set(bom.map(item => item.library_item_id).filter(Boolean))]
      const supplierIds = [...new Set(pos.map(po => po.supplier_id).filter(Boolean))]
      const [libraries, vendors] = await Promise.all([
        libraryIds.length ? safeQuery(supabase.from('library_items').select('*').in('id',libraryIds),[]) : [],
        supplierIds.length ? safeQuery(supabase.from('suppliers').select('id,name').in('id',supplierIds),[]) : [],
      ])
      return [bom,wash,embs,finishing[0],finishingPacks,sizeGroups,fits,pos,poItems,libraries,vendors]
    })()
    : await Promise.all([
    safeQuery(supabase.from('bom_items').select('*').eq('order_id', q.order_id).order('sort_order'), []),
    safeQuery(supabase.from('washing').select('*').eq('order_id', q.order_id), []),
    safeQuery(supabase.from('embellishments').select('*').eq('order_id', q.order_id), []),
    safeQuery(supabase.from('finishing').select('*').eq('order_id', q.order_id).maybeSingle(), null),
    safeQuery(supabase.from('finishing_packs').select('*').eq('order_id', q.order_id).order('sort_order'), []),
    safeQuery(supabase.from('size_groups').select('id,group_name,sizes,base_size').eq('order_id', q.order_id).order('sort_order'), []),
    safeQuery(supabase.from('fitting_blocks').select('block_name,sort_order').eq('order_id', q.order_id).order('sort_order'), []),
    safeQuery(purchasingLookup(supabase.from('purchase_orders').select('id,po_number,status,created_at').eq('order_id', q.order_id).order('created_at', { ascending: false }),{orderId:q.order_id}), []),
    safeQuery(purchasingLookup(supabase.from('purchase_order_items').select('po_id,description,specification,source_type,source_id,sort_order').order('sort_order'),{lines:true}), []),
    safeQuery(supabase.from('library_items').select('*'), []),
    safeQuery(supabase.from('suppliers').select('id,name'), []),
  ])

  const sgIds = (sgs || []).map(x => x.id)
  let colors = orderData?.colors || [], bd = orderData?.breakdown || []
  if (!orderData && sgIds.length) {
    const [c, b] = await Promise.all([
      safeQuery(supabase.from('size_group_colors').select('id,size_group_id,color_name,sort_order').in('size_group_id', sgIds).order('sort_order'), []),
      safeQuery(supabase.from('size_group_breakdown').select('size_group_id,color_id,size,qty').in('size_group_id', sgIds), []),
    ])
    colors = c || []
    bd = b || []
  }

  const sgMap = Object.fromEntries((sgs || []).map(g => [g.id, g]))
  const rawGroupName = q.size_group_id ? (sgMap[q.size_group_id]?.group_name || null) : null
  const cleanQLabel = displayQueueLabel(q.label)
  const fitName = (fitBlocks && fitBlocks[0]?.block_name) || '—'
  const qSgs = q.size_group_id ? (sgs || []).filter(g => g.id === q.size_group_id) : (sgs || [])

  const expandSelectedSizes = (labelText, availableSizes = []) => {
    const txt = String(labelText || '').trim()
    if (!txt) return []
    const sizes = (availableSizes || []).map(String)

    const rangeMatch = txt.match(/(\d+)\s*-\s*(\d+)/)
    if (rangeMatch) {
      const a = parseInt(rangeMatch[1], 10)
      const b = parseInt(rangeMatch[2], 10)
      return sizes.filter(sz => {
        const n = parseInt(String(sz).replace(/[^\d]/g, ''), 10)
        return Number.isFinite(n) && n >= Math.min(a,b) && n <= Math.max(a,b)
      })
    }

    const explicit = txt.split(/[,/]/).map(s => s.trim()).filter(Boolean)
    const matched = explicit.filter(v => sizes.includes(String(v)))
    return matched
  }

  const allGroupSizes = qSgs.length ? ((qSgs[0].sizes || []).map(String)) : []
  const selectedGroupSizes = expandSelectedSizes(cleanQLabel || q.size_group_label || rawGroupName, allGroupSizes)
  const effectiveSizes = selectedGroupSizes.length ? selectedGroupSizes : allGroupSizes

  const earlyNorm = (v) => String(v ?? '').trim().toLowerCase()
  const savedCustomComponents = parseQueueCustomComponents(q)
  const ruleNorm = earlyNorm(q.split_rule)
  const isCustomRule = ruleNorm.includes('custom')

  const makeComponentSpec = (g, c, gi, ci) => {
    const componentSizeMap = {}
    ;(g.sizes || []).map(String).forEach(sz => {
      const row = bd.find(b => b.size_group_id === g.id && b.color_id === c.id && String(b.size) === String(sz))
      const qty = parseFloat(row?.qty) || 0
      if (qty > 0) componentSizeMap[String(sz)] = qty
    })
    const componentQty = Object.values(componentSizeMap).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
    if (!(componentQty > 0)) return null
    return {
      key: `${gi}__${ci}__${g.group_name}__${c.color_name}`,
      label: `${c.color_name} / ${g.group_name}`,
      colorName: c.color_name,
      groupName: g.group_name,
      sizeGroupId: g.id,
      colorId: c.id,
      sizes: (g.sizes || []).map(String),
      sizeMap: componentSizeMap,
      qty: componentQty,
    }
  }

  const normalizeCustomComponentSpec = (component, idx) => {
    const colorName = component?.colour || component?.color || component?.wash || component?.color_name || component?.wash_name || '—'
    const groupName = component?.size_group || component?.sizeGroup || component?.size_group_name || component?.groupName || '—'
    const rawSizeMap = component?.qty_by_size || component?.qtyBySize || component?.sizeMap || {}
    const declaredSizes = Array.isArray(component?.sizes) ? component.sizes.map(String) : Object.keys(rawSizeMap).map(String)
    const sizeMap = {}
    declaredSizes.forEach(sz => {
      const qty = parseFloat(rawSizeMap?.[sz]) || 0
      if (qty > 0) sizeMap[String(sz)] = qty
    })
    Object.entries(rawSizeMap || {}).forEach(([sz, qtyRaw]) => {
      const qty = parseFloat(qtyRaw) || 0
      if (qty > 0 && !sizeMap[String(sz)]) sizeMap[String(sz)] = qty
    })
    const sizes = declaredSizes.length ? declaredSizes : Object.keys(sizeMap)
    const qty = parseFloat(component?.total_qty ?? component?.totalQty) || Object.values(sizeMap).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
    if (!(qty > 0) && !Object.values(sizeMap).some(v => (parseFloat(v) || 0) > 0)) return null
    return {
      key: component?.key || `custom_component_${idx}`,
      label: `${colorName} / ${groupName}`,
      colorName,
      groupName,
      sizeGroupId: component?.size_group_id || null,
      colorId: component?.color_id || null,
      sizes: sizes.map(String),
      sizeMap,
      qty,
      source: 'custom_components',
    }
  }

  const customComponentSpecs = savedCustomComponents
    .map((component, idx) => normalizeCustomComponentSpec(component, idx))
    .filter(Boolean)

  const allComponentSpecs = []
  ;(sgs || []).forEach((g, gi) => {
    const groupColors = colors.filter(c => c.size_group_id === g.id).sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0))
    groupColors.forEach((c, ci) => {
      const spec = makeComponentSpec(g, c, gi, ci)
      if (spec) allComponentSpecs.push(spec)
    })
  })

  const parseLabelParts = (label) => {
    const cleaned = displayQueueLabel(label || '').replace(/^.*?·\s*/, '').trim()
    const parts = cleaned.split('/').map(x => x.trim()).filter(Boolean)
    return {
      color: parts[0] || cleaned || '',
      group: parts.length > 1 ? parts.slice(1).join(' / ') : cleaned || '',
    }
  }

  const parts = parseLabelParts(q.label)
  const qColorName = q.color_name || parts.color || ''
  const qGroupName = rawGroupName || q.size_group_name || q.size_group_label || parts.group || ''

  const selectedQueueComponents = (() => {
    // CRITICAL IOS RULE:
    // IOS must be the proven single-variant table repeated for each actual
    // 1 wash/colour × 1 size-group component inside the selected queue.
    // Never invent components from the full order matrix for Custom queues.
    if (isCustomRule) {
      return customComponentSpecs
    }
    if (ruleNorm.includes('full po')) {
      return allComponentSpecs
    }
    if (ruleNorm.includes('colour') && ruleNorm.includes('size group')) {
      return allComponentSpecs.filter(comp =>
        (!qColorName || earlyNorm(comp.colorName) === earlyNorm(qColorName)) &&
        (!qGroupName || earlyNorm(comp.groupName) === earlyNorm(qGroupName))
      )
    }
    if (ruleNorm.includes('ratio')) {
      return allComponentSpecs.filter(comp =>
        (!qColorName || earlyNorm(comp.colorName) === earlyNorm(qColorName)) &&
        (!qGroupName || earlyNorm(comp.groupName) === earlyNorm(qGroupName))
      )
    }
    if (ruleNorm.includes('colour') || ruleNorm.includes('wash')) {
      return allComponentSpecs.filter(comp => !qColorName || earlyNorm(comp.colorName) === earlyNorm(qColorName))
    }
    if (ruleNorm.includes('size group')) {
      return allComponentSpecs.filter(comp =>
        (q.size_group_id && String(comp.sizeGroupId) === String(q.size_group_id)) ||
        (!q.size_group_id && qGroupName && earlyNorm(comp.groupName) === earlyNorm(qGroupName))
      )
    }
    return allComponentSpecs.filter(comp =>
      (!qColorName || earlyNorm(comp.colorName) === earlyNorm(qColorName)) &&
      (!qGroupName || earlyNorm(comp.groupName) === earlyNorm(qGroupName))
    )
  })()

  const groupName = selectedQueueComponents.length === 1
    ? selectedQueueComponents[0].groupName
    : (cleanQLabel || qGroupName || rawGroupName || '—')

  const sizeMap = {}
  selectedQueueComponents.forEach(comp => {
    Object.entries(comp.sizeMap || {}).forEach(([sz, qty]) => {
      sizeMap[String(sz)] = (sizeMap[String(sz)] || 0) + (parseFloat(qty) || 0)
    })
  })

  const sizeOrder = [...new Set(selectedQueueComponents.flatMap(comp => comp.sizes || []))]
    .filter(sz => (parseFloat(sizeMap[String(sz)]) || 0) > 0)
  const ratioVals = sizeOrder.map(sz => parseFloat(sizeMap[sz]) || 0)
  const positive = ratioVals.filter(v => v > 0)
  const gcd = (a, b) => b ? gcd(b, a % b) : a
  const ratioBase = positive.length ? positive.map(v => Math.round(v)).reduce((a, b) => gcd(a, b)) : 0
  const ratioMap = {}
  sizeOrder.forEach(sz => {
    const val = parseFloat(sizeMap[sz]) || 0
    ratioMap[sz] = ratioBase && val ? Math.round(val / ratioBase) : 0
  })

  const totalQty = parseFloat(ord.total_qty) || 0
  const queueQty = parseFloat(q.qty) || Object.values(sizeMap).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
  const ratio = totalQty > 0 ? queueQty / totalQty : 0

  const wastageFactor = (x) => 1 + ((parseFloat(x) || 0) / 100)
  
  
  const normalizeUD = (ud) => {
    if (!ud) return {}
    if (typeof ud === 'string') {
      try { return JSON.parse(ud) } catch (e) { return {} }
    }
    return ud
  }

  const usageNumeric = (v) => {
    if (v == null) return 0
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    if (typeof v === 'string') {
      const n = parseFloat(v)
      return Number.isFinite(n) ? n : 0
    }
    if (typeof v === 'object') {
      if (v.na || v.disabled) return 0
      const candidate = v.value ?? v.qty ?? v.consumption ?? v.cons ?? v.consump ?? v.amount ?? v.base_qty ?? 0
      const n = parseFloat(candidate)
      return Number.isFinite(n) ? n : 0
    }
    return 0
  }

  const norm = (v) => String(v ?? '').trim().toLowerCase()

  const pickKnownName = (raw, options = []) => {
    const rawNorm = norm(raw)
    if (!rawNorm) return null
    const direct = options.find(opt => norm(opt) === rawNorm)
    if (direct) return direct
    return options.find(opt => rawNorm.includes(norm(opt)) || norm(opt).includes(rawNorm)) || null
  }

  const selectedSizes = Object.keys(sizeMap || {}).filter(sz => (parseFloat(sizeMap[sz]) || 0) > 0)

  // Build the same order-level size/color context Purchasing uses
  const pd = {
    colors: [],
    sizeGroups: [],
    allSizes: [],
    sgMatrix: [],
    sgColorTotals: {},
    sgColorSizeMatrix: {},
    sizeGroupMap: {},
  }

  ;(sgs || []).forEach(g => {
    pd.sizeGroupMap[g.id] = { id:g.id, name:g.group_name, sizes:g.sizes||[], base_size:g.base_size || null }
    const groupColors = (colors || []).filter(c => c.size_group_id === g.id)
    const groupSizes = (g.sizes || []).map(String)
    let groupQty = 0
    const matrixColors = []
    pd.sgColorTotals[g.group_name] = pd.sgColorTotals[g.group_name] || {}
    pd.sgColorSizeMatrix[g.group_name] = pd.sgColorSizeMatrix[g.group_name] || {}

    groupColors.forEach(c => {
      const sizeVals = {}
      let colorQty = 0
      groupSizes.forEach(sz => {
        const row = (bd || []).find(b => b.size_group_id === g.id && b.color_id === c.id && String(b.size) === String(sz))
        const qty = parseFloat(row?.qty) || 0
        sizeVals[String(sz)] = qty
        colorQty += qty
      })
      groupQty += colorQty
      pd.colors.push({ name:c.color_name, qty:colorQty })
      pd.sgColorTotals[g.group_name][c.color_name] = colorQty
      pd.sgColorSizeMatrix[g.group_name][c.color_name] = sizeVals
      matrixColors.push({ colorName:c.color_name, qty:colorQty, sizeMap:sizeVals })
    })

    pd.sizeGroups.push({ id:g.id, name:g.group_name, qty:groupQty })
    pd.sgMatrix.push({ sgName:g.group_name, qty:groupQty, colors:matrixColors })
    groupSizes.forEach(sz => {
      const qty = matrixColors.reduce((s, c) => s + (parseFloat(c.sizeMap?.[String(sz)]) || 0), 0)
      pd.allSizes.push({ size:String(sz), qty, sgName:g.group_name })
    })
  })

  const getQueueContext = (queue) => {
    const splitRule = queue.split_rule || 'None'
    const label = String(queue.label || '').trim()
    const splitParts = label.split('/').map(x => x.trim()).filter(Boolean)
    const knownColors = (pd?.colors || []).map(c => c.name)
    const knownGroups = (pd?.sizeGroups || []).map(g => g.name)
    const inferredColor = pickKnownName(splitParts[0], knownColors)
    const inferredGroup = pickKnownName(splitParts[splitParts.length - 1], knownGroups)
    const queueColorName = orderData ? null : pickKnownName(queue.color_name, knownColors) || inferredColor || null
    const groupFromId = queue.size_group_id ? (pd?.sizeGroupMap?.[queue.size_group_id]?.name || null) : null
    const effectiveGroupName = orderData ? null : pickKnownName(groupFromId, knownGroups) || inferredGroup || pickKnownName(rawGroupName, knownGroups) || null

    const includeCell = (sgName, colorName) => {
      if (splitRule === 'Custom' && selectedQueueComponents.length) {
        return selectedQueueComponents.some(comp => norm(comp.groupName) === norm(sgName) && norm(comp.colorName) === norm(colorName))
      }
      const sgMatch = !effectiveGroupName || norm(sgName) === norm(effectiveGroupName)
      const colorMatch = !queueColorName || norm(colorName) === norm(queueColorName)
      if (splitRule === 'By Colour' || splitRule === 'By Wash') return colorMatch
      if (splitRule === 'By Size Group') return sgMatch
      if (splitRule === 'Colour × Size Group' || splitRule === 'By Ratio') return sgMatch && colorMatch
      return true
    }

    const sizeQtyForQueue = (size) => {
      let total = 0
      const matrix = pd?.sgColorSizeMatrix || {}
      Object.entries(matrix).forEach(([sgName, colorMap]) => {
        Object.entries(colorMap || {}).forEach(([colorName, sizes]) => {
          if (includeCell(sgName, colorName)) total += parseFloat(sizes?.[String(size)]) || 0
        })
      })
      return total
    }

    const colorQtyForQueue = (wanted) => {
      let total = 0
      const matrix = pd?.sgColorTotals || {}
      Object.entries(matrix).forEach(([sgName, colorMap]) => {
        Object.entries(colorMap || {}).forEach(([colorName, qty]) => {
          if (norm(colorName) !== norm(wanted)) return
          if (includeCell(sgName, colorName)) total += parseFloat(qty) || 0
        })
      })
      return total
    }

    const sizeGroupQtyForQueue = (wanted) => {
      let total = 0
      const matrix = pd?.sgColorTotals || {}
      Object.entries(matrix).forEach(([sgName, colorMap]) => {
        if (norm(sgName) !== norm(wanted)) return
        Object.entries(colorMap || {}).forEach(([colorName, qty]) => {
          if (includeCell(sgName, colorName)) total += parseFloat(qty) || 0
        })
      })
      return total
    }

    const queueQty = parseFloat(queue.qty) || 0
    return { groupName: effectiveGroupName, splitRule, queueColorName, queueQty, sizeQtyForQueue, colorQtyForQueue, sizeGroupQtyForQueue }
  }

  const calcReqQtyForQueue = (item, queue) => {
    const { groupName: ctxGroupName, queueColorName, queueQty, sizeQtyForQueue, colorQtyForQueue, sizeGroupQtyForQueue } = getQueueContext(queue)
    const ruleRaw = item.usage_rule || 'Generic'
    const rule = String(ruleRaw).trim()
    const ud = normalizeUD(item.usage_data)
    const wastageFactor = 1 + ((orderData && item.wastage != null && item.wastage !== '' ? Number(item.wastage) || 0 : parseFloat(item.wastage) || 5) / 100)
    const base = parseFloat(item.base_qty) || 0

    if (rule === 'Generic' || !rule) return base * queueQty * wastageFactor
    if (rule === 'By Color' || rule === 'By Colour') {
      return Object.entries(ud || {}).reduce((s,[colorName, cons]) => s + (usageNumeric(cons) * colorQtyForQueue(colorName) * wastageFactor), 0)
    }
    if (rule === 'By Size Group') {
      return Object.entries(ud || {}).reduce((s,[sgName, cons]) => s + (usageNumeric(cons) * sizeGroupQtyForQueue(sgName) * wastageFactor), 0)
    }
    if (rule === 'By Individual Sizes' || rule === 'By Individual Size') {
      return Object.entries(ud || {}).reduce((s,[size, cons]) => s + (usageNumeric(cons) * sizeQtyForQueue(size) * wastageFactor), 0)
    }
    if (rule === 'Configure Own') {
      if (Array.isArray(ud.__matrix)) {
        return ud.__matrix.reduce((s,m)=> {
          const sgName = pickKnownName(m.sgName, pd.sizeGroups.map(g => g.name)) || m.sgName
          const colorName = pickKnownName(m.colorName, pd.colors.map(c => c.name)) || m.colorName
          if ((queue.split_rule === 'Colour × Size Group' || queue.split_rule === 'By Ratio') && (!ctxGroupName || !queueColorName)) return s
          if (queue.split_rule === 'By Size Group' && !ctxGroupName) return s
          if ((queue.split_rule === 'By Colour' || queue.split_rule === 'By Wash') && !queueColorName) return s
          const matchesGroup = !ctxGroupName || norm(sgName) === norm(ctxGroupName) || (queue.split_rule === 'By Colour' && norm(queueColorName) === norm(colorName))
          const matchesColor = !queueColorName || norm(colorName) === norm(queueColorName) || queue.split_rule === 'By Size Group'
          if (!matchesGroup || !matchesColor) return s
          const cellQty = pd.sgColorTotals?.[sgName]?.[colorName] || 0
          return s + (usageNumeric(m.consumption) * cellQty * wastageFactor)
        },0)
      }
      const groups = ud.__groups || []
      return groups.reduce((s,g)=> {
        const sizes = g.sizes || []
        const qty = sizes.reduce((sq,sz)=>sq + sizeQtyForQueue(sz), 0)
        return s + (usageNumeric(g.consumption) * qty * wastageFactor)
      },0)
    }
    if (rule === 'By Batch') {
      const rows = Array.isArray(ud?.batches) ? ud.batches : (Array.isArray(ud) ? ud : [])
      return rows.reduce((s,row) => {
        const colorName = row.color || row.color_name || row.colour || null
        if (colorName && queueColorName && norm(colorName) !== norm(queueColorName)) return s
        const rowSizesRaw = row.sizes || row.selectedSizes || row.size_group || row.size || []
        const rowSizes = Array.isArray(rowSizesRaw) ? rowSizesRaw : String(rowSizesRaw || '').split(',').map(x=>x.trim()).filter(Boolean)
        const matchedQty = rowSizes.length ? rowSizes.reduce((sq, sz) => sq + sizeQtyForQueue(sz), 0) : queueQty
        return s + usageNumeric(row) * matchedQty * wastageFactor
      },0)
    }
    return base * queueQty * wastageFactor
  }

  const getConsumpForQueue = (item, queue) => {
    const { groupName: ctxGroupName, queueColorName, queueQty, sizeQtyForQueue, colorQtyForQueue, sizeGroupQtyForQueue } = getQueueContext(queue)
    const ruleRaw = item.usage_rule || 'Generic'
    const rule = String(ruleRaw).trim()
    const ud = normalizeUD(item.usage_data)
    const base = parseFloat(item.base_qty) || 0

    const pickSingle = (vals) => {
      const clean = (vals || []).map(v => parseFloat(v) || 0).filter(v => v > 0)
      if (!clean.length) return base
      const uniq = [...new Set(clean.map(v => Number(v.toFixed(4))))]
      return uniq[0] || base
    }

    if (rule === 'Generic' || !rule) return base

    if (rule === 'By Color' || rule === 'By Colour') {
      const vals = Object.entries(ud || {})
        .filter(([colorName]) => colorQtyForQueue(colorName) > 0)
        .map(([, cons]) => usageNumeric(cons))
      return pickSingle(vals)
    }

    if (rule === 'By Size Group') {
      const vals = Object.entries(ud || {})
        .filter(([sgName]) => sizeGroupQtyForQueue(sgName) > 0)
        .map(([, cons]) => usageNumeric(cons))
      return pickSingle(vals)
    }

    if (rule === 'By Individual Sizes' || rule === 'By Individual Size') {
      const vals = Object.entries(ud || {})
        .filter(([size]) => sizeQtyForQueue(size) > 0)
        .map(([, cons]) => usageNumeric(cons))
      return pickSingle(vals)
    }

    if (rule === 'Configure Own') {
      if (Array.isArray(ud.__matrix)) {
        const vals = ud.__matrix.flatMap((m) => {
          const sgName = pickKnownName(m.sgName, pd.sizeGroups.map(g => g.name)) || m.sgName
          const colorName = pickKnownName(m.colorName, pd.colors.map(c => c.name)) || m.colorName
          if ((queue.split_rule === 'Colour × Size Group' || queue.split_rule === 'By Ratio') && (!ctxGroupName || !queueColorName)) return []
          if (queue.split_rule === 'By Size Group' && !ctxGroupName) return []
          if ((queue.split_rule === 'By Colour' || queue.split_rule === 'By Wash') && !queueColorName) return []
          const matchesGroup = !ctxGroupName || norm(sgName) === norm(ctxGroupName) || (queue.split_rule === 'By Colour' && norm(queueColorName) === norm(colorName))
          const matchesColor = !queueColorName || norm(colorName) === norm(queueColorName) || queue.split_rule === 'By Size Group'
          if (!matchesGroup || !matchesColor) return []
          const cellQty = pd.sgColorTotals?.[sgName]?.[colorName] || 0
          return cellQty > 0 ? [usageNumeric(m.consumption)] : []
        })
        return pickSingle(vals)
      }
      const groups = ud.__groups || []
      const vals = groups.flatMap((g) => {
        const sizes = g.sizes || []
        const qty = sizes.reduce((sq, sz) => sq + sizeQtyForQueue(sz), 0)
        return qty > 0 ? [usageNumeric(g.consumption)] : []
      })
      return pickSingle(vals)
    }

    if (rule === 'By Batch') {
      const rows = Array.isArray(ud?.batches) ? ud.batches : (Array.isArray(ud) ? ud : [])
      const vals = rows.flatMap((row) => {
        const colorName = row.color || row.color_name || row.colour || null
        if (colorName && queueColorName && norm(colorName) !== norm(queueColorName)) return []
        const rowSizesRaw = row.sizes || row.selectedSizes || row.size_group || row.size || []
        const rowSizes = Array.isArray(rowSizesRaw) ? rowSizesRaw : String(rowSizesRaw || '').split(',').map(x => x.trim()).filter(Boolean)
        const matchedQty = rowSizes.length ? rowSizes.reduce((sq, sz) => sq + sizeQtyForQueue(sz), 0) : queueQty
        return matchedQty > 0 ? [usageNumeric(row)] : []
      })
      return pickSingle(vals)
    }

    return base
  }
const libMap = Object.fromEntries((libs || []).map(x => [x.id, x]))
  const fabricItems = (bom || []).filter(x => x.category === 'Fabric').map(x => {
    const lib = x.library_item_id ? libMap[x.library_item_id] : null
    const consump = getConsumpForQueue(x, q)
    return {
      ...x,
      q_qty: calcReqQtyForQueue(x, q),
      shade: lib?.colour || lib?.color || x.specification || x.detail || '—',
      lib_colour: lib?.colour || lib?.color || '—',
      content: lib?.composition || x.detail || '—',
      weight: lib?.weight || lib?.gsm || '—',
      width: lib?.width_inches ? `${lib.width_inches}”` : (lib?.width ? `${lib.width}”` : '—'),
      consump: consump || 0,
    }
  })

  const poItemsBySource = {}
  ;(poi || []).forEach(item => {
    const k = `${item.source_type || ''}::${item.source_id || ''}`
    if (!poItemsBySource[k]) poItemsBySource[k] = []
    poItemsBySource[k].push(item)
  })

  const trimItems = (bom || []).filter(x => x.category !== 'Fabric').map(x => {
    let linkedItem = null
    const sourceLinked = orderData
      ? (poi || []).find(it=>String(it.source_id || '') === String(x.id))
      : (poi || []).find(it => String(it.source_type || '').toLowerCase() === 'queue' && String(it.source_id || '') === String(q.id))
    if (sourceLinked) linkedItem = sourceLinked
    if (!linkedItem) {
      const itemName = String(x.name || '').toLowerCase()
      linkedItem = (poi || []).find(it => (orderData
        ? String(it.description || '').trim().toLowerCase()===itemName && String(it.specification || '').trim().toLowerCase()===String(x.specification || '').trim().toLowerCase()
        : String(it.description || '').toLowerCase().includes(itemName) && (String(it.specification || '').includes(q.q_number || '') || String(it.specification || '').includes(q.label || ''))))
    }
    if (!linkedItem && !orderData) {
      const itemName = String(x.name || '').toLowerCase()
      linkedItem = (poi || []).find(it => String(it.description || '').toLowerCase().includes(itemName))
    }
    const po = linkedItem ? (pos || []).find(p => p.id === linkedItem.po_id) : null
    const consump = getConsumpForQueue(x, q)
    return {
      ...x,
      q_qty: calcReqQtyForQueue(x, q),
      shade: x.specification || x.detail || '—',
      consump: consump || 0,
      po_number: po?.po_number || '—',
      po_status: po?.status || '—',
      po_date: po?.po_date,
      supplierName: (suppliers || []).find(s=>s.id===po?.supplier_id)?.name,
    }
  })

  const stitchItems = trimItems.filter(x => String(x.category || '').toLowerCase().includes('stitch'))
  const packingItems = trimItems.filter(x => !String(x.category || '').toLowerCase().includes('stitch'))
  const washName = ((washing || []).find(w => !q.color_name || w.color_name === q.color_name)?.wash_type) || q.color_name || '—'
  const cuttingPct = Number.isFinite(parseFloat(ord.excess_cutting_pct)) ? parseFloat(ord.excess_cutting_pct) : 0
  const cuttingQty = sizeOrder.reduce((s, sz) => s + Math.round((parseFloat(sizeMap[sz]) || 0) * (1 + cuttingPct / 100)), 0)
  const embellishmentText = (embellishments || []).map(x => `${x.technique || 'Embellishment'} @${x.placement || '—'}`)
  const firstPackRaw = (packs || [])[0] || {}
  const firstPackMeta = firstPackRaw.config?.__packMeta || {}
  const firstPack = {
    ...firstPackRaw,
    pieces_per_inner_pack: firstPackRaw.pieces_per_inner_pack || firstPackRaw.inner_pieces || firstPackMeta.pieces_per_inner_pack,
    pcs_per_carton: firstPackRaw.pcs_per_carton || firstPackRaw.units_per_carton,
  }
  const blisterEach = firstPack.pieces_per_inner_pack || firstPack.inner_pieces || '—'
  const cartonEach = firstPack.pcs_per_carton || '—'
  const blisterTotal = blisterEach && blisterEach !== '—' ? Math.ceil(queueQty / parseFloat(blisterEach || 1)) : '—'
  const cartonTotal = cartonEach && cartonEach !== '—' ? Math.ceil(queueQty / parseFloat(cartonEach || 1)) : '—'

  const makeRatioMap = (sizes, map) => {
    const vals = (sizes || []).map(sz => parseFloat(map?.[sz]) || 0)
    const pos = vals.filter(v => v > 0)
    const rb = pos.length ? pos.map(v => Math.round(v)).reduce((a, b) => gcd(a, b)) : 0
    const out = {}
    ;(sizes || []).forEach(sz => {
      const val = parseFloat(map?.[sz]) || 0
      out[sz] = rb && val ? Math.round(val / rb) : 0
    })
    return out
  }
  const customQueueMissingComponents = isCustomRule && !customComponentSpecs.length

  const variantBlocks = selectedQueueComponents.length
    ? selectedQueueComponents.map(comp => {
        const compSizes = (comp.sizes || []).filter(sz => (parseFloat(comp.sizeMap?.[sz]) || 0) > 0)
        const compRatio = makeRatioMap(compSizes, comp.sizeMap)
        const compCutting = compSizes.reduce((sum, sz) => sum + Math.round((parseFloat(comp.sizeMap?.[sz]) || 0) * (1 + cuttingPct / 100)), 0)
        return { ...comp, sizeOrder: compSizes, ratioMap: compRatio, cuttingQty: compCutting }
      })
    : [{ label: groupName || washName || '—', colorName: q.color_name || null, groupName, sizeMap, sizeOrder, ratioMap, qty: queueQty, cuttingQty }]

  return {
    orderScoped: Boolean(orderData), samples: orderData?.samples || [], finishing,
    ord, q: { ...q, label: cleanQLabel }, groupName, fitName, washName, sizeMap, sizeOrder, ratioMap, variantBlocks, customQueueMissingComponents,
    fabricItems, trimItems, stitchItems, packingItems,
    embItems: embellishments, embellishmentText,
    finishingPacks: (packs || []).map(p => {
      const cfg = p.config || {}
      const meta = cfg.__packMeta || {}
      return {
        ...p,
        pack_basis: p.pack_basis || p.pack_type || meta.packing_basis || 'By Q#',
        inner_pack_type: p.inner_pack_type || meta.inner_pack_type || '—',
        pieces_per_inner_pack: p.pieces_per_inner_pack || p.inner_pieces || meta.pieces_per_inner_pack || '',
        pcs_per_carton: p.pcs_per_carton || p.units_per_carton || '',
        carton_style: p.carton_style || p.hang_flat || meta.carton_style || 'Flat Packed',
      }
    }),
    packs: packs,
    cuttingQty, cuttingPct,
    blisterEach, blisterTotal, cartonEach, cartonTotal,
  }
}


export function buildTrimsProgramHTML(d) {
  if (d.customQueueMissingComponents) {
    return `<div style="width:210mm;min-height:297mm;padding:12mm;font-family:Arial,sans-serif;color:#000;box-sizing:border-box;">
      <div style="font-size:22px;font-weight:700;margin-bottom:8mm;">Trims Program Blocked</div>
      <div style="border:2px solid #000;padding:8mm;font-size:14px;line-height:1.5;">
        <strong>Custom queue missing component data.</strong><br/>
        Regenerate this queue after running the <code>order_queues.custom_components</code> migration.
      </div>
    </div>`
  }
  const qRef = d.orderScoped ? d.ord.factory_ref || d.ord.style_number || 'Order' : d.q.q_number || 'Queued'
  const blocks = Array.isArray(d.variantBlocks) && d.variantBlocks.length ? d.variantBlocks : []
  const cuttingPct = Number.isFinite(parseFloat(d.cuttingPct)) ? parseFloat(d.cuttingPct) : 0
  const fmtInt = (v) => Math.round(parseFloat(v) || 0).toLocaleString('en-US')
  const titleCase = (v) => String(v || '').replace(/(^|\s|\/|-)([a-z])/g, (_, a, b) => `${a}${b.toUpperCase()}`)
  const gcdLocal = (a, b) => b ? gcdLocal(b, a % b) : Math.abs(a)
  const makeRatioMapLocal = (sizes, map) => {
    const vals = (sizes || []).map(sz => Math.round(parseFloat(map?.[sz]) || 0)).filter(v => v > 0)
    const base = vals.length ? vals.reduce((a, b) => gcdLocal(a, b)) : 0
    const out = {}
    ;(sizes || []).forEach(sz => {
      const v = Math.round(parseFloat(map?.[sz]) || 0)
      out[sz] = base && v ? Math.round(v / base) : 0
    })
    return out
  }
  const th = 'border:1px solid #000;padding:2.2px 3px;font-size:8.4px;font-weight:700;text-align:center;vertical-align:middle;line-height:1.12;white-space:nowrap;'
  const td = 'border:1px solid #000;padding:2.2px 3px;font-size:8.25px;vertical-align:middle;line-height:1.15;'
  const tdC = td + 'text-align:center;'
  const tdR = td + 'text-align:right;'
  const blk = 'background:#000;color:#fff;letter-spacing:1.5px;text-transform:uppercase;'

  const blockTables = blocks.map((block) => {
    const sizes = (block.sizeOrder || block.sizes || []).filter(sz => (parseFloat(block.sizeMap?.[sz]) || 0) > 0)
    const ratioMap = block.ratioMap || makeRatioMapLocal(sizes, block.sizeMap || {})
    const cutMap = {}
    sizes.forEach(sz => { cutMap[sz] = Math.round((parseFloat(block.sizeMap?.[sz]) || 0) * (1 + cuttingPct / 100)) })
    const orderTotal = sizes.reduce((sum, sz) => sum + (parseFloat(block.sizeMap?.[sz]) || 0), 0)
    const ratioTotal = sizes.reduce((sum, sz) => sum + (parseFloat(ratioMap?.[sz]) || 0), 0)
    const cutTotal = sizes.reduce((sum, sz) => sum + (parseFloat(cutMap?.[sz]) || 0), 0)
    const label = `${block.colorName || block.washName || '—'} / ${block.groupName || '—'}`
    const head = sizes.map(sz => `<th style="${th}${blk}">${esc(sz)}</th>`).join('')
    const qtyCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(block.sizeMap?.[sz])}</td>`).join('')
    const ratioCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(ratioMap?.[sz])}</td>`).join('')
    const cutCells = sizes.map(sz => `<td style="${tdR}">${fmtInt(cutMap?.[sz])}</td>`).join('')
    return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:1.2mm;page-break-inside:avoid;">
      <thead><tr><th style="${th}${blk};width:24%">Size Group / Wash</th><th style="${th}${blk};width:18%">Details</th>${head}<th style="${th}${blk};width:10%">Total</th></tr></thead>
      <tbody>
        <tr><td style="${tdC};font-weight:700;text-transform:uppercase;" rowspan="4">${esc(titleCase(label))}</td><td style="${td};font-weight:700;">Order Quantity</td>${qtyCells}<td style="${tdR};font-weight:700;">${fmtInt(orderTotal)}</td></tr>
        <tr><td style="${td};font-weight:700;">Ratio</td>${ratioCells}<td style="${tdR};font-weight:700;">${fmtInt(ratioTotal)}</td></tr>
        <tr><td style="${td};font-weight:700;">Cutting Qty +${esc(cuttingPct)}%</td>${cutCells}<td style="${tdR};font-weight:700;">${fmtInt(cutTotal)}</td></tr>
        <tr><td style="${td};color:#555;">Zipper Usage/Size</td>${sizes.map(() => `<td style="${tdC}">&nbsp;</td>`).join('')}<td style="${tdC}">&nbsp;</td></tr>
      </tbody>
    </table>`
  }).join('') || '<div style="border:1px solid #000;padding:6mm;font-size:12px;font-weight:700;">No saved breakdown data found.</div>'

  const shortUom = (u) => { if (!u) return 'pcs'; const x=String(u).toLowerCase(); if (x.includes('yard')||x==='yds') return 'yds'; if (x.includes('meter')||x==='m') return 'm'; if (x.includes('roll')) return 'roll'; if (x.includes('kg')) return 'kg'; if (x.includes('cone')) return 'cone'; if (x.includes('set')) return 'set'; if (x.includes('ctn')) return 'ctn'; return u }
  const usageNum = (v) => { if (v == null) return 0; if (typeof v === 'number') return Number.isFinite(v)?v:0; if (typeof v === 'string') return parseFloat(v)||0; if (typeof v === 'object') return parseFloat(v.value ?? v.qty ?? v.consumption ?? v.cons ?? v.consump ?? v.amount ?? v.base_qty ?? 0) || 0; return 0 }
  const normalizePackMeta = (raw) => { const ud = normalizeUsageData(raw); return { perPack: parseFloat(ud?._packing_qty ?? ud?.packing_qty ?? ud?.pack_qty ?? ud?.qty_per_pack ?? ud?.per_pack_qty ?? 0), packUnit: String(ud?._packing_unit ?? ud?.packing_unit ?? ud?.pack_unit ?? ud?.req_unit ?? '').trim(), itemUnit: shortUom(ud?._packing_base_unit || ud?.base_unit || ud?.consump_unit || ud?.uom || '') } }
  const formatConsump = (value, uom) => { const n=parseFloat(value)||0; if(n<=0)return '—'; const shown=Math.abs(n-Math.round(n))<.0001?String(Math.round(n)):n.toFixed(2).replace(/\.00$/,''); return `${shown} ${uom}` }
  const formatPackLogic = (item) => { const meta=normalizePackMeta(item?.usage_data); if (!(meta.perPack>0)) return '—'; const left=Number.isInteger(meta.perPack)?String(Math.trunc(meta.perPack)):meta.perPack.toFixed(2).replace(/\.00$/,''); const numeratorUnit=meta.itemUnit||shortUom(item?.unit); return `${left}${numeratorUnit ? ` ${numeratorUnit}` : ''}/${meta.packUnit || 'pack'}` }
  const formatReq = (qty, item) => { const req=parseFloat(qty)||0; if (!(req>0)) return '—'; const meta=normalizePackMeta(item?.usage_data); if(meta.perPack>0){ const packs=Math.ceil(req/meta.perPack); const baseLabel=String(meta.packUnit||'pack').trim().toLowerCase().replace(/s$/,''); return `${packs.toLocaleString()} ${packs===1?baseLabel:`${baseLabel}s`}`; } return `${Math.ceil(req).toLocaleString()} ${shortUom(item?.unit)}` }
  const trimType = (item) => String(item.category || '').toLowerCase().includes('stitch') ? 'Stitching' : 'Packing'
  const poText = (v) => (!v || v === '—' || String(v).toLowerCase() === 'pending') ? 'X' : String(v)
  const circle = '<span style="display:inline-block;width:10px;height:10px;border:1.4px solid #000;border-radius:50%;"></span>'
  const parentTd = td + 'background:#e6e6e6;font-weight:700;color:#000;'
  const parentTdC = tdC + 'background:#e6e6e6;font-weight:700;color:#000;'
  const parentTdR = tdR + 'background:#e6e6e6;font-weight:700;color:#000;'
  const queueSizeQty = {}; (blocks || []).forEach(b => Object.entries(b.sizeMap || {}).forEach(([sz, qty]) => { queueSizeQty[String(sz)] = (queueSizeQty[String(sz)] || 0) + (parseFloat(qty) || 0) }))
  const wastageFactor = (item) => 1 + ((d.orderScoped && item?.wastage != null && item.wastage !== '' ? Number(item.wastage) || 0 : parseFloat(item?.wastage) || 5) / 100)
  const childBreakdownRows = (item) => {
    const rule = String(item.usage_rule || 'Generic').trim(); const ud=normalizeUsageData(item.usage_data); const base=parseFloat(item.base_qty)||parseFloat(item.consump)||0; const wf=wastageFactor(item); const rows=[]
    if (rule === 'By Individual Sizes' || rule === 'By Individual Size') Object.entries(ud||{}).forEach(([sz, consRaw]) => { const q=parseFloat(queueSizeQty[String(sz)])||0; const cons=usageNum(consRaw); if(q>0&&cons>0) rows.push({desc:`Size ${sz}`, cons, req:q*cons*wf}) })
    else if (d.orderScoped && ['By Size Group','By Color','By Colour','Configure Own'].includes(rule)) {
      const normalize = value => String(value || '').trim().toLowerCase()
      const matches = (a,b) => normalize(a) === normalize(b)
      const quantity = predicate => blocks.filter(predicate).reduce((sum, block) => sum + block.qty, 0)
      const add = (desc, raw, qty) => {
        const cons = usageNum(raw)
        if (qty > 0 && cons > 0) rows.push({ desc, cons, req:qty*cons*wf })
      }
      if (rule !== 'Configure Own') {
        const key = rule === 'By Size Group' ? 'groupName' : 'colorName'
        Object.entries(ud).forEach(([name,raw]) => add(name,raw,quantity(block => matches(block[key],name))))
      } else if (Array.isArray(ud.__matrix)) {
        ud.__matrix.forEach(row => add([row.colorName,row.sgName].filter(Boolean).join(' / '),row.consumption,
          quantity(block => matches(block.colorName,row.colorName) && matches(block.groupName,row.sgName))))
      } else if (Array.isArray(ud.__groups)) {
        ud.__groups.forEach(group => {
          const sizes = Array.isArray(group.sizes) ? group.sizes : []
          add(sizes.length ? `Sizes ${sizes.join(', ')}` : group.name,group.consumption,
            sizes.reduce((sum,size) => sum + (queueSizeQty[size] || 0),0))
        })
      }
    }
    else if (rule === 'By Size Group' || rule === 'By Color' || rule === 'By Colour') Object.entries(ud||{}).filter(([key]) => !d.orderScoped || !key.startsWith('_')).forEach(([key, consRaw]) => { const cons=usageNum(consRaw); if(cons>0) rows.push({desc:String(key), cons, req:parseFloat(item.q_qty)||0}) })
    else if (rule === 'Configure Own' && Array.isArray(ud?.__matrix)) ud.__matrix.forEach(m => { const cons=usageNum(m.consumption); if(cons>0) rows.push({desc:[m.colorName,m.sgName].filter(Boolean).join(' / ') || item.shade || item.specification || '—', cons, req:parseFloat(item.q_qty)||0}) })
    else if (rule === 'Configure Own' && Array.isArray(ud?.__groups)) ud.__groups.forEach(g => { const cons=usageNum(g.consumption); const sizes=Array.isArray(g.sizes)?g.sizes.join(', '):''; if(cons>0) rows.push({desc:sizes?`Sizes ${sizes}`:(g.name||'Custom Group'), cons, req:parseFloat(item.q_qty)||0}) })
    if(!rows.length) rows.push({desc:item.shade||item.specification||item.detail||'—', cons:base, req:parseFloat(item.q_qty)||0})
    return rows
  }
  const trimRows = (d.trimItems || []).flatMap((item) => {
    const children = childBreakdownRows(item)
    const parent = `<tr><td style="${parentTd}">${esc(trimType(item))}</td><td style="${parentTd}">${esc(item.name || '—')}</td><td style="${parentTd}">${esc(item.shade || item.specification || item.detail || '—')}</td><td style="${parentTdC}">&nbsp;</td><td style="${parentTdC};white-space:nowrap;">${esc(formatPackLogic(item))}</td><td style="${parentTdR}">${esc(formatReq(item.q_qty, item))}</td><td style="${parentTdC}">${esc(poText(item.po_number))}</td><td style="${parentTdC}">${d.orderScoped ? esc(fmtDate(item.po_date)) : esc(poText(item.po_status))}</td><td style="${parentTdC}">${d.orderScoped ? esc(item.supplierName) : circle}</td>${d.orderScoped ? '' : `<td style="${parentTdC}">${circle}</td>`}</tr>`
    const childRows = children.map(ch => `<tr><td style="${tdC};color:#555;">↳</td><td style="${td}">&nbsp;</td><td style="${td}">${esc(ch.desc || '—')}</td><td style="${tdC};white-space:nowrap;">${formatConsump(ch.cons, shortUom(item.unit))}</td><td style="${tdC}">&nbsp;</td><td style="${tdR};white-space:nowrap;">${esc(formatReq(ch.req, item))}</td><td style="${tdC}">&nbsp;</td><td style="${tdC}">&nbsp;</td><td style="${tdC}">&nbsp;</td>${d.orderScoped ? '' : `<td style="${tdC}">&nbsp;</td>`}</tr>`).join('')
    return [parent + childRows]
  }).join('') || `<tr><td style="${tdC}" colspan="${d.orderScoped ? 9 : 10}">No trims configured</td></tr>`

  return `<div style="width:210mm;min-height:297mm;padding:6mm 7mm;box-sizing:border-box;font-family:Arial,sans-serif;color:#000;background:#fff;"><style>@page{size:A4;margin:0}body{margin:0;background:#fff}*{box-sizing:border-box}tr{page-break-inside:avoid}.tp-page{page-break-after:auto}</style><div class="tp-page" style="min-height:285mm;display:flex;flex-direction:column;"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;align-items:start;font-size:8.5px;margin-bottom:3mm;"><div>Document Ref#TP-${esc(qRef)}</div><div style="text-align:center;">Date Created: ${new Date().toLocaleDateString('en-GB')} - ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div><div style="text-align:right;">Username: ${esc(d.printedBy || (d.orderScoped ? '—' : 'admin'))}</div></div><div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:2px solid #000;padding-bottom:2mm;margin-bottom:2.5mm;"><div><div style="font-size:21px;font-weight:700;line-height:.92;">NIZAMIA<br/>APPARELS</div></div><div style="text-align:center;font-size:21px;font-weight:700;text-transform:uppercase;">Trims Program</div><div style="text-align:right;font-size:30px;font-weight:700;">${esc(qRef)}</div></div><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:5mm;"><tr>${[['Brand', d.ord.buyer_name], ['Style Ne', d.ord.style_number], ['Fit Name', d.fitName || '—'], ['PO#', d.ord.po_number], ['Factory Ref', d.ord.factory_ref || d.ord.job_number], ['Store', d.ord.store_name], ['Ship Date', fmtDate(d.ord.ship_date)]].map(([k,v]) => `<td style="font-size:8.8px;font-weight:700;vertical-align:top;">${esc(k)}<br/><span style="font-weight:700;">${esc(v || '—')}</span></td>`).join('')}</tr></table><div style="font-size:12px;font-weight:700;margin-bottom:1mm;">Order Breakdown / Order Quantity</div>${blockTables}<div style="font-size:12px;font-weight:700;margin:2mm 0 1mm;">Trims Detailed Sheet</div><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:4mm;"><colgroup><col style="width:8%"/><col style="width:14%"/><col style="width:27%"/><col style="width:8%"/><col style="width:9%"/><col style="width:10%"/><col style="width:7%"/><col style="width:8%"/>${d.orderScoped ? '<col style="width:9%"/>' : '<col style="width:4.5%"/><col style="width:4.5%"/>'}</colgroup><thead><tr>${(d.orderScoped ? ['Type','Item','Shade / Description','Consump','Pack','Req','PO#','PO Date','Supplier'] : ['Type','Item','Shade / Description','Consump','Pack','Req','PO#','Status','Approval','Testing']).map(h => `<th style="${th}${blk};font-size:7.6px;white-space:normal;letter-spacing:.8px;">${h}</th>`).join('')}</tr></thead><tbody>${trimRows}</tbody></table><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:auto;"><tr>${['Merchandiser','Store Manager','General Manager','Director'].map(lbl => `<td style="border:1px solid #000;height:20mm;position:relative;text-align:center;font-size:11px;font-weight:700;"><div style="position:absolute;left:0;right:0;bottom:3mm;">${esc(lbl)}</div></td>`).join('')}</tr></table></div></div>`
}



export function fetchOrderProgramData(order, data, printedBy) {
  const reference = order.style_number || order.id
  return fetchProgramData({ order_id: order.id, split_rule: 'Full PO', label: reference }, order, data)
    .then(program => ({ ...program, printedBy }))
}

const number = value => Number(value) || 0
const format = value => value == null || value === '' ? '—'
  : Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 })
const total = quantities => quantities.reduce((sum, value) => sum + number(value), 0)

function orderTable(headers, records) {
  if (!records.length) return ''
  return `<table><thead><tr>${headers.map(label=>`<th>${esc(label)}</th>`).join('')}</tr></thead>
    <tbody>${records.map(row=>`<tr>${row.map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
function sizeTable(block, cuttingPct) {
  const cols = block.sizeOrder || []
  if (!cols.length) return ''
  const quantity = cols.map(size => number(block.sizeMap[size]))
  const ratios = cols.map(size => number(block.ratioMap[size]))
  const cutting = quantity.map(qty => Math.round(qty * (1 + cuttingPct / 100)))
  const title = esc(block.colorName || block.label) + '<br>' + esc(block.groupName || '')
  const rows = [['Order Quantity',quantity],['Ratio',ratios],[`Cutting Qty +${cuttingPct}%`,cutting]]
  return `<table class="ios-breakdown"><thead><tr>
    ${['Size Group / Wash','Details',...cols,'Total'].map(label=>`<th>${esc(label)}</th>`).join('')}
    </tr></thead><tbody>${rows.map(([label,values],i)=>`<tr>
      ${i===0?`<th class="ios-variant" rowspan="${rows.length}">${title}</th>`:''}
      <td><strong>${esc(label)}</strong></td>${[...values,total(values)].map(value=>`<td>${format(value)}</td>`).join('')}
    </tr>`).join('')}</tbody></table>`
}
function packingSection(packs) {
  const rows = [], missing = [], instructions = []
  packs.forEach((pack,index) => {
    const cfg = normalizeUsageData(pack.config)
    const metadata = cfg.__packMeta || {}
    const name = pack.pack_name || `Pack ${index + 1}`
    const qty = number(pack.qty_assigned ?? pack.assigned_qty ?? cfg.qty_assigned)
    const perInner = number(pack.pieces_per_pack || pack.pieces_per_inner_pack || pack.inner_pieces || metadata.pieces_per_inner_pack)
    const perCarton = number(pack.units_per_carton || pack.pcs_per_carton)
    const innerType = pack.inner_pack_type || metadata.inner_pack_type || 'Inner packs'
    const style = pack.carton_style || pack.hang_flat || metadata.carton_style
    const basis = pack.pack_type || pack.pack_basis || metadata.packing_basis
    const note = [basis,style,metadata.departmentNotes].filter(Boolean).join(' · ')
    if (note) instructions.push(`${name} · ${note}`)
    const absent = []
    if (qty > 0 && perInner > 0) rows.push([name,innerType,format(perInner),format(Math.ceil(qty/perInner))])
    else if (perInner > 0) absent.push('assigned quantity for inner packs')
    else absent.push('pieces per inner pack')
    if (qty > 0 && perCarton > 0) rows.push([name,'Cartons',format(perCarton),format(Math.ceil(qty/perCarton))])
    else if (perCarton > 0) absent.push('assigned quantity for cartons')
    else absent.push('pieces per carton')
    if (absent.length) missing.push(`${name} · ${absent.join(', ')} missing`)
  })
  return { rows, missing, instructions }
}
function reportQuantity(item) {
  const data = normalizeUsageData(item.usage_data)
  const requirement = number(item.q_qty)
  const packSize = number(data._packing_qty ?? data.packing_qty ?? data.pack_qty ?? data.qty_per_pack ?? data.per_pack_qty)
  const packUnit = data._packing_unit || data.packing_unit || data.pack_unit || data.req_unit
  const unit = item.unit || ''
  const consumptionUnit = data._packing_base_unit || data.base_unit || unit
  const pack = packSize > 0 && packUnit ? `${format(packSize)} ${consumptionUnit}/${packUnit}` : '—'
  const required = packSize > 0 && packUnit
    ? `${format(Math.ceil(requirement / packSize))} ${packUnit}`
    : [format(item.q_qty), unit].filter(Boolean).join(' ')
  return { consumption: item.consump > 0 ? `${format(item.consump)} ${unit}` : '—', pack, required }
}

export function buildOrderIOS(program) {
  const { ord, variantBlocks, cuttingPct, fabricItems, trimItems, samples, embItems, packs } = program
  const ref = ord.style_number || ord.po_number || 'Order'
  const blocks = variantBlocks.filter(block => block.sizeOrder?.length && number(block.qty) > 0)
  const orderQty = total(blocks.map(block=>block.qty))
  const cutQty = total(blocks.map(block=>block.cuttingQty))
  const dates = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Karachi', dateStyle:'short', timeStyle:'short', hour12:true })
  const packing = packingSection(packs || [])
  const savedFinishingNotes = [program.finishing?.packing_notes, program.finishing?.notes].filter(Boolean)
  const decoration = embItems.map(item => [item.description, item.technique, item.placement].filter(Boolean).join(' · ')).filter(Boolean)
  const fields = [['Brand',ord.brand_name || ord.buyer_name],['Style Number',ord.style_number],['Fit Name',program.fitName],
    ['PO#',ord.po_number],['Factory Ref',ord.factory_ref || ord.job_number],['Store',ord.store_name],['Ship Date',fmtDate(ord.ship_date)]]
  const sampleRows = samples.map(sample => {
    const wash = Array.isArray(sample.wash_snapshot) ? sample.wash_snapshot.map(s=>s?.color_name || s?.colour_name || s?.wash_color || s?.wash_colour).filter(Boolean).join(', ') : ''
    const size = sample.base_size || (Array.isArray(sample.sizes) ? sample.sizes.join(', ') : sample.sizes) || sample.size
    const qty = sample.req_pcs ?? sample.qty
    return [sample.sample_number, sample.sample_type, wash || (Array.isArray(sample.colours) ? sample.colours.join(', ') : sample.color),
      size, sample.version_label || (sample.version_no ? 'V'+sample.version_no : null),
      qty == null ? null : format(qty)+' pcs', fmtDate(sample.due_date), sample.status]
  })
  const fabric = fabricItems.map(item=>{
    const { consumption, required } = reportQuantity(item)
    return [item.name,item.shade,item.content,item.weight,item.width,consumption,required]
  })
  const trims = trimItems.map(item=>{
    const { consumption,pack,required } = reportQuantity(item)
    return [String(item.category || '').toLowerCase().includes('stitch')?'Stitching':item.category,
      item.name,item.shade,consumption,pack,required,item.po_number,item.po_status]
  })
  const materialHTML = [
    orderTable(['Item','Shade','Content','Weight','Width','Consump','Required'],fabric),
    orderTable(['Type','Item','Shade','Consump','Pack','Req','PO#','Status'],trims)
  ].join('')
  return `<style>
    @page{size:A4;margin:0}html,body{margin:0;background:#fff}
    .order-ios{width:210mm;box-sizing:border-box;padding:5mm 4mm 4mm;color:#000;background:#fff;font:9px/1.22 Arial,sans-serif;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .order-ios header{display:flex;justify-content:space-between;gap:6px;font-size:8px;margin-bottom:1mm}
    .order-ios .ios-band{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:2px solid #000;padding:0 0 2mm;margin-bottom:1mm}
    .ios-company strong{font-size:18px}.ios-company small{display:block;font-size:8px;font-weight:700;letter-spacing:1.65px}
    .ios-round{display:grid;place-items:center;width:13mm;height:13mm;border-radius:50%;background:#000;color:#fff;font-weight:700}
    .ios-ref{text-align:right;font-size:23px;font-weight:700;overflow-wrap:anywhere}
    .ios-meta{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-bottom:2mm}
    .ios-meta strong{display:block}.ios-meta span{overflow-wrap:anywhere}
    .order-ios h2{font-size:11px;margin:1.5mm 0 1mm;break-after:avoid}
    .order-ios p{margin:1mm 0}
    .order-ios table{width:100%;border-collapse:collapse;margin:0 0 1.5mm;table-layout:auto}
    .order-ios th,.order-ios td{border:1px solid #000;padding:2.4px 3.5px;font-size:8.6px;overflow-wrap:anywhere}
    .order-ios thead th{background:#000;color:#fff;text-transform:uppercase;letter-spacing:.4px;text-align:left}
    .order-ios thead{display:table-header-group}.order-ios tr{break-inside:avoid}
    .order-ios .ios-breakdown{break-inside:avoid;table-layout:auto}
    .ios-breakdown thead th,.ios-breakdown td:nth-last-child(-n+1){text-align:center}
    .ios-breakdown td:not(:first-child){text-align:center}.ios-breakdown .ios-variant{min-width:28mm;text-align:center}
    .order-ios .ios-totals{width:64mm;margin-left:auto;break-inside:avoid;font-weight:700;text-align:right}
    .order-ios .ios-signatures{margin-top:9mm;break-inside:avoid;table-layout:fixed}
    .ios-signatures td{width:25%;height:17mm;text-align:center;vertical-align:bottom;padding:2mm;font-weight:700}
  </style><article class="order-ios">
    <header><span>Document Ref#IOS-${esc(ref)}</span><span>Date Created: ${esc(dates.format(new Date()))}</span><span>Username: ${esc(program.printedBy)}</span></header>
    <div class="ios-band"><div class="ios-company"><strong>NIZAMIA APPARELS</strong><small>INTERNAL ORDER SHEET</small></div>
      <div class="ios-round">IOS</div><div class="ios-ref">${esc(ord.factory_ref || ref)}</div></div>
    <div class="ios-meta">${fields.map(([label,value])=>`<div><strong>${esc(label)}</strong><span>${esc(value)}</span></div>`).join('')}</div>
    <h2>Order Breakdown</h2>
    ${blocks.map(block=>sizeTable(block,cuttingPct)).join('') || '<p>No saved order breakdown.</p>'}
    ${blocks.length?`<table class="ios-totals"><tbody><tr><td>Total Order Quantity</td><td>${format(orderQty)}</td></tr>
      <tr><td>Total Cutting Quantity</td><td>${format(cutQty)}</td></tr></tbody></table>`:''}
    <h2>Sampling Required</h2>${orderTable(['SAM #','Sample Type','Wash / Colour','Size','Version','Quantity','Due Date','Status'],sampleRows) || '<p>No sampling requirements recorded.</p>'}
    <h2>Materials &amp; Trims Requirements</h2>${materialHTML || '<p>No materials or trims recorded.</p>'}
    <h2>Packing Instructions</h2>
    ${decoration.length?`<p><strong>Embellishment &amp; Decoration</strong> · ${esc(decoration.join(' / '))}</p>`:''}
    ${[...savedFinishingNotes,...packing.instructions].map(note=>`<p>${esc(note)}</p>`).join('')}
    ${orderTable(['Pack','Type','Each','Total'],packing.rows)}
    ${!packing.rows.length ? '<p>Packing information missing</p>' : ''}
    ${packing.missing.map(note=>`<p>${esc(note)}</p>`).join('')}
    <table class="ios-signatures"><tbody><tr>${['CONTRACTOR / VENDOR','MERCHANDISER','GENERAL MANAGER','CEO / DIRECTOR'].map(label=>`<td>${label}</td>`).join('')}</tr></tbody></table>
  </article>`
}
