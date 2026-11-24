import { configuredCell, buildBOMMatrix, calculateBOMFinalQty, normalizeUsageCell, normalizeUsageData, USAGE_RULES } from './bomUsage.js'

const simpleRules = {
  'By Color': ['colors', 'name'],
  'By Size Group': ['sizeGroups', 'name'],
  'By Individual Sizes': ['allSizes', 'size'],
}

function numberOrNull(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
}

function sameJSON(left, right) {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && sameJSON(left[key], right[key]))
}

function matrixUsage(rule, data, poData, sharedRate) {
  const mappings = poData.sgMatrix.flatMap(group => group.colors.map(color => ({
    sgName: group.sgName, colorName: color.colorName, qty: color.qty, sizes: color.sizes,
  })))
  let required = []
  if (Object.hasOwn(simpleRules, rule)) {
    const [list, field] = simpleRules[rule]
    if (sharedRate !== null) {
      data = Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('_')))
      for (const row of poData[list]) {
        const label = row[field]
        if (label && !label.startsWith('_')) data[label] = { value: sharedRate, na: false }
      }
    }
    required = poData[list].filter(row => row.qty > 0).map(row => {
      const label = row[field]
      return { label, valid: !!label && !label.startsWith('_'), cells: [Object.hasOwn(data, label) ? data[label] : null] }
    })
  } else if (rule === 'Configure Own') {
    const entries = sharedRate !== null
      ? mappings.map(({ sgName, colorName }) => ({ sgName, colorName, consumption: sharedRate, na: false }))
      : data.__matrix || []
    if (sharedRate !== null) data = { ...data, __matrix: entries }
    required = mappings.flatMap(({sgName,colorName,sizes}) => sizes.filter(size=>size.qty>0).map(({size}) => ({
      label:[sgName,colorName,size].join(' / '), valid:!!sgName && !!colorName && !!size,
      cells:entries.filter(entry => entry.sgName===sgName && entry.colorName===colorName).map(entry => {
        const cell = configuredCell(entry,size)
        return {value:cell.consumption,na:cell.na}
      }),
    })))
  } else {
    required = mappings.flatMap(({ sgName, colorName, sizes }) => sizes.filter(size => size.qty > 0).map(({ size }) => ({
      label: [sgName, colorName, size].filter(Boolean).join(' / '), valid: !!sgName && !!colorName && !!size,
      cells: (data.__batches || []).flatMap(batch => (batch.cells || [])
        .filter(cell => cell.sgName === sgName && cell.colorName === colorName && (!cell.size || cell.size === size))
        .map(() => batch.consumption)),
    })))
  }

  const missing = required.filter(({ valid, cells }) => {
    if (!valid || cells.length !== 1) return true
    const cell = normalizeUsageCell(cells[0])
    return !cell.na && !(numberOrNull(cell.value) > 0)
  }).map(entry => entry.label || 'unnamed matrix entry').sort()
  return {
    data,
    issue: !required.length ? 'Missing PO matrix breakdown' : missing.length
      ? 'Missing or overlapping consumption for ' + missing.join(', ') : null,
  }
}

function reviewLine(order, material, libraryItem, poData, existing, hasPacking) {
  const rule = material.settings?.[order.style_number]?.usage || material.usage
  if (!libraryItem || !['Fabric', 'Stitching Trim', 'Packing Trim'].includes(libraryItem.category)) {
    throw Error('A material is unavailable in the local Library. Sync or remove it before reviewing.')
  }
  if (!USAGE_RULES.includes(rule)) throw Error('Invalid material usage')
  const setup = material.settings?.[order.style_number] || {}
  const lib = libraryItem
  const specification = lib.category === 'Fabric' ? lib.colour || null : null
  const defaultDetail = lib.category === 'Fabric'
    ? [lib.composition, lib.weight, lib.width_inches != null && lib.width_inches !== '' ? lib.width_inches + '"' : ''].filter(Boolean).join(', ')
    : lib.description || ''
  const requestedWastage = numberOrNull(setup.wastage)
  const sharedRate = !setup.usage && rule !== 'By Batch' && material.shared ? numberOrNull(setup.sharedRate ?? material.rate) ?? 0 : null
  let data = {
    ...(lib.packing_form ? { _packing_unit: lib.packing_form } : {}),
    ...normalizeUsageData(setup.usageData ?? (rule === 'By Size Group' ? setup.rates : null)),
  }
  let rate = null
  let issue = null
  if (rule === 'Generic') {
    const generic = normalizeUsageCell(data.generic)
    rate = sharedRate ?? numberOrNull(generic.value) ?? numberOrNull(setup.rate)
    if (sharedRate !== null) delete data.generic
    if (sharedRate === null && generic.na) rate = null
    else if (!(rate > 0 && order.total_qty > 0)) issue = 'Missing positive consumption or order quantity'
  } else {
    ({ data, issue } = matrixUsage(rule, data, poData, sharedRate))
  }
  if (requestedWastage < 0) issue = 'Wastage must be zero or greater'
  if (lib.category === 'Packing Trim') {
    if (!lib.unit) issue = 'Missing packing material unit'
    if (/^(ctn|carton|cartons)$/i.test(lib.unit || '') && !hasPacking) {
      issue = 'Missing packing breakdown for carton material'
    }
  }

  const nameKey = value => String(value ?? '').trim().toLowerCase()
  const matches = existing.filter(line => (line.bulk_instance_id ?? null) === (material.lineId ?? null) &&
    (!setup.targets?.[order.id] || setup.targets[order.id]===line.id) && (line.library_item_id === lib.id ||
    (!line.library_item_id && line.category === lib.category && nameKey(line.name) === nameKey(lib.name))))
  if (!matches.length && setup.targets?.[order.id]) issue = 'Selected BOM line changed. Select it again'
  if (matches.length > 1) issue = 'Multiple existing matches. Resolve them in the Order Wizard'
  const before = matches.length === 1 ? matches[0] : null
  if (before?.use_cutting_qty) issue = 'Existing line uses cutting quantity. Review it in the Order Wizard'
  const candidate = {
    bulk_instance_id: material.lineId || null, library_item_id: lib.id, name: lib.name, category: lib.category,
    detail: (setup.spec ?? defaultDetail) || null, specification, unit: lib.unit ?? null,
    usage_rule: rule, usage_data: Object.keys(data).length ? JSON.stringify(data) : null,
    base_qty: rate, wastage: requestedWastage ?? numberOrNull(before?.wastage) ?? (numberOrNull(lib.default_wastage) || 5),
  }
  const quantity = calculateBOMFinalQty(candidate, { totalQty: order.total_qty, poData })
  candidate.final_qty = quantity == null ? null : Number(quantity)
  const unchanged = before && (before.detail || null) === candidate.detail &&
    (before.specification || null) === specification && (before.unit ?? null) === candidate.unit &&
    (before.usage_rule || 'Generic') === rule && numberOrNull(before.wastage) === candidate.wastage &&
    numberOrNull(before.base_qty) === rate && numberOrNull(before.final_qty) === candidate.final_qty &&
    sameJSON(normalizeUsageData(before.usage_data), data)

  return {
    style: order.style_number, order_id: order.id, po: order.po_number, store: order.store_name,
    action: issue ? 'Blocked' : before ? unchanged ? 'Unchanged' : 'Replace' : 'Add',
    issue, before, after: candidate,
  }
}

export function reviewLocalBulkBOM({ buyerId, draft, styles, orders, library, groups, colors, breakdown, lines, finishingPacks }) {
  if (!styles.length || styles.some(style => !draft.styles.includes(style))) throw Error('Select styles from the saved Bulk BOM')
  const materials = draft.materials
  if (!materials.length || new Set(materials.map(material => material.lineId || material.id)).size !== materials.length) {
    throw Error('Select at least one material and list each material once')
  }
  const selected = orders.filter(order => order.buyer_id === buyerId && styles.includes(order.style_number))
  if (styles.some(style => !selected.some(order => order.style_number === style))) {
    throw Error('A selected style has no synchronized orders for this buyer')
  }
  const libraryById = new Map(library.map(item => [item.id, item]))
  return selected.sort((a, b) => a.style_number.localeCompare(b.style_number) || a.id.localeCompare(b.id)).flatMap(order => {
    const orderGroups = groups.filter(group => group.order_id === order.id)
    const ids = new Set(orderGroups.map(group => group.id))
    const orderBreakdown = breakdown.filter(row => ids.has(row.size_group_id))
    const orderColors = colors.filter(color => ids.has(color.size_group_id))
    const poData = buildBOMMatrix(orderGroups, orderColors, orderBreakdown)
    const existing = lines.filter(line => line.order_id === order.id)
    const hasPacking = finishingPacks.some(pack => pack.order_id === order.id)
    const proposed = materials.filter(material => (!material.onlyStyle || material.onlyStyle===order.style_number) &&
      !material.settings?.[order.style_number]?.excluded)
      .map(material => reviewLine(order,material,libraryById.get(material.id),poData,existing,hasPacking))
    const matched = new Set(proposed.map(row=>row.before?.id))
    return proposed.concat(existing.filter(line=>!matched.has(line.id)).map(line=>({
      style:order.style_number,order_id:order.id,po:order.po_number,store:order.store_name,
      action:draft.replaceStyles?.includes(order.style_number) ? 'Remove' : 'Keep', before:line,after:null,issue:null,
    })))
  })
}
