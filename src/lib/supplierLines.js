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
    if (!groups.has(key)) groups.set(key, { item, sources:[], refs:new Set(), qty:0 })
    const group = groups.get(key)
    group.qty += Number(item.qty) || 0
    if (item.source_id) group.sources.push({id:item.source_id, qty:Number(item.qty) || 0})
    if (item.ref) group.refs.add(item.ref)
  }
  return [...groups.values()].map(({item,sources,refs,qty}) => {
    const pack = item.pack
    const info = [pack && `${pack.size.toLocaleString('en-US')} ${item.unit}/${pack.unit}`, [...refs].join(', ')]
      .filter(Boolean).join(' · ')
    return {...item,qty:pack ? Math.ceil(qty / pack.size) : qty,unit:pack?.unit || item.unit,
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
