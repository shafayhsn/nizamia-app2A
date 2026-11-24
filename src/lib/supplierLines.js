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
    const key = merge && item.buyer ? JSON.stringify([item.buyer,item.material,item.description,item.specification,
      item.breakdown,item.unit,item.pack,item.source_type,item.q_number,item.unit_rate]) : index
    if (!groups.has(key)) groups.set(key, { item, sources:[], refs:new Set(), factoryRefs:new Map(), qty:0 })
    const group = groups.get(key)
    group.qty += Number(item.qty) || 0
    if (item.source_id) group.sources.push({id:item.source_id, qty:Number(item.qty) || 0})
    if (item.ref) group.refs.add(item.ref)
    const factoryRef = item.factoryRef || ''
    group.factoryRefs.set(factoryRef, (group.factoryRefs.get(factoryRef) || 0) + (Number(item.qty) || 0))
  }
  return [...groups.values()].map(({item,sources,refs,factoryRefs,qty}) => {
    const pack = item.pack
    const packInfo = pack ? `${pack.size.toLocaleString('en-US')} ${item.unit}/${pack.unit}` : ''
    const info = [packInfo, [...refs].join(', ')]
      .filter(Boolean).join(' · ')
    return {...item, checkingCopyRefs:[...factoryRefs], checkingCopyPackInfo:packInfo, qty:pack ? Math.ceil(qty / pack.size) : qty,unit:pack?.unit || item.unit,
      demand_allocation: sources.length ? {sources,info,packSize:pack?.size || 1} : null}
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
