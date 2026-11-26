export function packFor(raw) {
  let usage = raw || {}
  if (typeof usage === 'string') {
    try { usage = JSON.parse(usage) || {} } catch { usage = {} }
  }
  const unit = String(usage._packing_unit || '').trim().toLowerCase()
  const size = Number(usage._packing_qty)
  return unit && size > 0 ? { unit, size } : null
}

export function buildSupplierLines(lines, merge) {
  const groups = new Map()
  for (const [index,item] of lines.entries()) {
    // By Batch appends internal wash and size assignments to its display text.
    // The batch name identifies the supplier variant, while sources track allocation.
    const batchName = item.checkingCopyBatchName
    const key = merge && item.buyer ? JSON.stringify([item.buyer,item.material,item.description,item.specification,
      batchName ? ['batch', batchName.trim()]
        : item.fabricSizeGroup ? ['fabric-size-group', item.q_number] : ['breakdown', item.breakdown, item.q_number],
      item.unit,item.pack,item.source_type,item.unit_rate]) : index
    if (!groups.has(key)) groups.set(key, { item, sources:[], refs:new Set(), styles:new Set(), jobs:new Set(), factoryRefs:new Map(), fabricSizeGroups:new Set(), qty:0, count:0 })
    const group = groups.get(key)
    group.count++
    if (item.fabricSizeGroup) group.fabricSizeGroups.add(item.fabricSizeGroup)
    group.qty += Number(item.qty) || 0
    if (item.source_id) group.sources.push({id:item.source_id, qty:Number(item.qty) || 0})
    if (item.ref) group.refs.add(item.ref)
    if (item.styleNumber) group.styles.add(item.styleNumber)
    if (item.jobNumber) group.jobs.add(item.jobNumber)
    const factoryRef = item.factoryRef || ''
    group.factoryRefs.set(factoryRef, (group.factoryRefs.get(factoryRef) || 0) + (Number(item.qty) || 0))
  }
  return [...groups.values()].map(({item,sources,refs,styles,jobs,factoryRefs,fabricSizeGroups,qty,count}) => {
    const pack = item.pack
    const packInfo = pack ? `${pack.size.toLocaleString('en-US')} ${item.unit}/${pack.unit}` : ''
    const info = [packInfo, [...refs].join(', ')]
      .filter(Boolean).join(' · ')
    const combinedBatch = count > 1 && item.checkingCopyBatchName?.trim()
    const variant = combinedBatch ? {breakdown:combinedBatch, checkingCopyOriginalBreakdown:combinedBatch} : {}
    if (fabricSizeGroups.size > 1) {
      variant.breakdown = [...fabricSizeGroups].join(' / ')
      if (item.q_number) variant.breakdown += ` [${item.q_number}]`
    }
    return {...item, ...variant, checkingCopyRefs:[...factoryRefs], checkingCopyPackInfo:packInfo, qty:pack ? Math.ceil(qty / pack.size) : qty,unit:pack?.unit || item.unit,
      demand_allocation: sources.length ? {sources,info,packSize:pack?.size || 1,
        styles:[...styles], jobs:[...jobs], factoryRefs:[...factoryRefs.keys()].filter(Boolean)} : null}
  })
}

export function purchasedQuantities(lines) {
  const quantities = Object.create(null)
  for (const line of lines) {
    const allocation = line.demand_allocation
    const sources = allocation?.sources || [{id:line.source_id,qty:line.qty}]
    const total = sources.reduce((sum,source) => sum + Number(source.qty),0)
    if (!total) continue
    for (const source of sources) {
      if (!source.id) continue
      const qty = Number(line.qty) * (allocation?.packSize || 1) * Number(source.qty) / total
      quantities[source.id] = (quantities[source.id] || 0) + qty
    }
  }
  return quantities
}


export function checkingCopyLines(items, showFactoryRefs) {
  const hasValue = value => String(value ?? '').trim() !== ''
  return items.filter(item => [item.description, item.specification, item.breakdown, item.qty, item.unit_rate]
    .some(hasValue)).map(item => {
    const qty = hasValue(item.qty) ? Math.round(Number(item.qty)) : null
    const unitRate = hasValue(item.unit_rate) ? Number(item.unit_rate) : null
    const amount = qty === null || unitRate === null ? null : Math.round(qty * unitRate)
    const breakdown = item.breakdown === item.checkingCopyOriginalBreakdown
      ? item.checkingCopyBatchName : item.breakdown
    const refs = showFactoryRefs ? (item.checkingCopyRefs || []) : []
    const sourceQty = refs.reduce((sum, [, value]) => sum + value, 0)
    let factoryRefs = ''
    if (sourceQty > 0 && qty !== null && refs.some(([ref]) => ref)) {
      const shares = refs.map(([ref, value]) => {
        const exact = qty * value / sourceQty
        return { ref, qty: Math.floor(exact), remainder: exact - Math.floor(exact) }
      })
      const remaining = qty - shares.reduce((sum, share) => sum + share.qty, 0)
      const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder)
      byRemainder.slice(0, remaining).forEach(share => { share.qty++ })
      factoryRefs = shares.filter(share => share.qty !== 0)
        .map(share => `${share.ref || 'No ref'}: ${share.qty.toLocaleString('en-US')} ${item.unit || ''}`.trim()).join(' · ')
    }
    return { ...item, qty, unit_rate:unitRate, amount, breakdown, factoryRefs }
  })
}

export function hardMergeSupplierLines(lines, fields) {
  const first = lines[0]
  if (lines.length < 2) throw new Error('Select at least two PO lines.')
  const signature = line => JSON.stringify([line.buyer, line.unit, line.pack?.unit, line.pack?.size,
    line.demand_allocation?.packSize, line.source_type, Boolean(line.demand_allocation?.sources?.length)])
  if (lines.some(line => signature(line) !== signature(first) ||
    ((line.source_id || line.demand_allocation?.sources?.length) &&
      (!line.buyer || !line.demand_allocation?.sources?.length)))) {
    throw new Error('Select lines with the same buyer, unit, pack configuration and demand source type.')
  }
  if (lines.some(line => !line.description?.trim() || !Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0)) {
    throw new Error('Every selected line needs a description and a positive quantity.')
  }

  const sources = new Map()
  const refs = new Map()
  const collect = (entries, qty, target) => {
    const total = entries.reduce((sum, [, value]) => sum + Number(value), 0)
    if (total <= 0) return
    for (const [key, value] of entries) {
      target.set(key, (target.get(key) || 0) + qty * Number(value) / total)
    }
  }
  for (const line of lines) {
    collect((line.demand_allocation?.sources || []).map(source => [source.id, source.qty]), Number(line.qty), sources)
    const lineRefs = line.checkingCopyRefs || []
    collect(lineRefs.length ? lineRefs : [['', 1]], Number(line.qty), refs)
  }
  const unique = field => [...new Set(lines.flatMap(line => line.demand_allocation?.[field] || []))]
  const qty = Number(lines.reduce((sum, line) => sum + Number(line.qty), 0).toPrecision(15))
  const amount = fields.unit_rate === '' ? '' : (qty * Number(fields.unit_rate)).toFixed(2)
  return {
    ...first, ...fields, qty, amount,
    checkingCopyBatchName:undefined, checkingCopyOriginalBreakdown:undefined, checkingCopyRefs:[...refs],
    q_number:[...new Set(lines.map(line => line.q_number).filter(Boolean))].join(', '),
    demand_allocation:sources.size ? {
      sources:[...sources].map(([id, sourceQty]) => ({id, qty:sourceQty})),
      packSize:first.demand_allocation.packSize,
      factoryRefs:unique('factoryRefs'), styles:unique('styles'), jobs:unique('jobs'),
      info:[first.checkingCopyPackInfo, unique('factoryRefs').join(', ')].filter(Boolean).join(' · '),
    } : null,
  }
}
