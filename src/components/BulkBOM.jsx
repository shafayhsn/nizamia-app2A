import { Check, ChevronLeft, Search, PackageOpen, Printer } from 'lucide-react'
import './bulkBOM.css'
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MinimizableModal from './ui/MinimizableModal'
import { markTabUpdated } from '../lib/tabNotices'
import { UsageModal } from './wizard/steps/Step3BOM'
import { buildBOMMatrix, normalizeUsageData, normalizeUsageCell, USAGE_RULES } from '../lib/bomUsage'
import { saveDesktopPdf } from '../lib/saveDesktopPdf.mjs'
import { reviewLocalBulkBOM } from '../lib/bulkBOMLocalReview'
import { useAppDialogs } from './ui/AppDialogs'

const steps = ['Select Trims', 'Select Styles', 'Set Consumptions', 'Review & Apply']
const categories = ['Fabric', 'Stitching Trim', 'Packing Trim']
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const emptyDraft = { materials: [], styles: [] }

function librarySpec(item) {
  if (item.category !== 'Fabric') return item.description || ''
  return [item.composition, item.weight, item.width_inches && item.width_inches + '"'].filter(Boolean).join(', ')
}

async function read(query) {
  const { data, error } = await query
  if (error) throw error
  if (data == null) throw new Error('Connect to NZOS to use Bulk BOM.')
  return data
}

async function localRequest(action, fields = {}) {
  const response = await fetch('/api/offline/bulk-bom', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, action }),
  })
  const result = await response.json()
  if (!response.ok) throw Error(result.error || 'Bulk BOM could not be saved')
  return result.data
}

const withoutLocalMetadata = row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_local_')))

export default function BulkBOM({ buyers, packages, libraryItems }) {
  const { confirm, Dialogs } = useAppDialogs()
  const [baseline, setBaseline] = useState(null)
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [name, setName] = useState('')
  const [buyer, setBuyer] = useState('')
  const [step, setStep] = useState(0)
  const [orders, setOrders] = useState([])
  const [batches, setBatches] = useState([])
  const [membership, setMembership] = useState([])
  const [matrices, setMatrices] = useState({})
  const [usageConfig, setUsageConfig] = useState(null)
  const [batch, setBatch] = useState('')
  const [search, setSearch] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [review, setReview] = useState([])
  const [checked, setChecked] = useState([])
  const [replacements, setReplacements] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [list, setList] = useState(null)
  const library = new Map(libraryItems.filter(item => categories.includes(item.category)).map(item => [item.id, item]))

  async function run(action) {
    setBusy(true)
    setError('')
    try { await action() }
    catch (failure) { setError(failure.message || String(failure)) }
    finally { setBusy(false) }
  }

  async function openList() {
    await run(async () => setList(await localRequest('list')))
  }

  function open(record) {
    setList(null)
    setSaved(record)
    setName(record?.name || '')
    setBuyer(record?.buyer_id || '')
    setDraft(record?.draft || emptyDraft)
    setStep(0)
    setBatch('')
    setSearch('')
    setPackageId('')
    setMaterialId('')
    setNotice('')
    setError('')
  }

  useEffect(() => {
    setOrders([])
    setBatches([])
    setMembership([])
    setMatrices({})
    if (!draft || !buyer) return
    let active = true
    read(supabase.from('orders').select('id,style_number,po_number,store_name').eq('buyer_id', buyer).order('id'))
      .then(rows => { if (active) setOrders(rows) })
      .catch(failure => { if (active) setError(failure.message) })
    Promise.all([
      read(supabase.from('production_batches').select('id,name').order('name')),
      read(supabase.from('production_batch_orders').select('order_id,batch_id').order('order_id')),
    ]).then(([allBatches, links]) => {
      if (active) { setBatches(allBatches); setMembership(links) }
    }).catch(() => {})
    return () => { active = false }
  }, [buyer, !!draft])

  function add(ids) {
    const existing = new Set(draft.materials.map(item => item.id))
    const additions = [...new Set(ids)].filter(id => library.has(id) && !existing.has(id))
    setDraft(current => ({ ...current, materials: [...current.materials,
      ...additions.map(id => ({ id, usage: 'Generic', shared: false, rate: '', settings: {} }))] }))
    setNotice(additions.length + ' added' + (ids.length > additions.length ? '. Existing or unavailable materials skipped.' : '.'))
  }

  function changeMaterial(id, change) {
    setDraft(current => ({ ...current, materials: current.materials.map(item => item.id === id ? { ...item, ...change } : item) }))
  }

  function changeSettings(item, style, change) {
    changeMaterial(item.id, { settings: { ...item.settings, [style]: { ...item.settings[style], ...change } } })
  }

  async function save() {
    const record = await localRequest('save', { name, draft, buyerId: buyer, id: saved?.id, expectedRevision: saved?.revision })
    setSaved(record)
    return record
  }

  async function beginReview() {
    await save()
    const [currentOrders, groups, colors, breakdown, lines, finishingPacks] = await Promise.all([
      read(supabase.from('orders').select('*').eq('buyer_id', buyer).order('id')),
      ...['size_groups', 'size_group_colors', 'size_group_breakdown', 'bom_items', 'finishing_packs']
        .map(table => read(supabase.from(table).select('*').order('id'))),
    ])
    const poOrders = currentOrders.filter(order => draft.styles.includes(order.style_number))
    if (poOrders.some(order => order._local_only || order._local_edited)) {
      throw Error('Sync earlier edits to the selected orders before applying Bulk BOM.')
    }
    const makeClean = rows => rows.map(withoutLocalMetadata)
    const cleanGroups = makeClean(groups)
    const cleanColors = makeClean(colors)
    const cleanBreakdown = makeClean(breakdown)
    const cleanLines = makeClean(lines)
    setReview(reviewLocalBulkBOM({ buyerId: buyer, draft, styles: draft.styles, orders: poOrders,
      library: libraryItems, groups: cleanGroups, colors: cleanColors, breakdown: cleanBreakdown,
      lines: cleanLines, finishingPacks }))
    setBaseline(new Map(poOrders.map(order => {
      const orderGroups = cleanGroups.filter(row => row.order_id === order.id)
      const ids = new Set(orderGroups.map(row => row.id))
      return [order.id, { step_bom: order.step_bom ?? null, total_qty: order.total_qty ?? null,
        groups: orderGroups, colors: cleanColors.filter(row => ids.has(row.size_group_id)),
        breakdown: cleanBreakdown.filter(row => ids.has(row.size_group_id)),
        lines: cleanLines.filter(row => row.order_id === order.id) }]
    })))
    setChecked([])
    setReplacements([])
    setNotice('')
    setStep(3)
  }

  async function loadMatrices() {
    const selected = orders.filter(order => draft.styles.includes(order.style_number))
    const loadFor = (table, column, ids) => ids.length
      ? read(supabase.from(table).select('*').in(column, ids).order('id')) : Promise.resolve([])
    const groups = await loadFor('size_groups', 'order_id', selected.map(order => order.id))
    const ids = groups.map(group => group.id)
    const [colors, breakdown] = await Promise.all([
      loadFor('size_group_colors', 'size_group_id', ids),
      loadFor('size_group_breakdown', 'size_group_id', ids),
    ])
    const styleByOrder = new Map(selected.map(order => [order.id, order.style_number]))
    const styleByGroup = new Map(groups.map(group => [group.id, styleByOrder.get(group.order_id)]))
    setMatrices(Object.fromEntries(draft.styles.map(style => [style, buildBOMMatrix(
      groups.filter(group => styleByOrder.get(group.order_id) === style),
      colors.filter(color => styleByGroup.get(color.size_group_id) === style),
      breakdown.filter(row => styleByGroup.get(row.size_group_id) === style),
    )])))
    setStep(2)
  }

  function configure(item, style, lib, settings) {
    const usageData = settings.usageData ?? (item.usage === 'Generic'
      ? { generic: { value: settings.rate ?? '', na: false } }
      : item.usage === 'By Size Group' ? settings.rates : {})
    setUsageConfig({
      material: item,
      style,
      rule: item.usage,
      item: {
        name: lib?.name,
        detail: settings.spec ?? (lib ? librarySpec(lib) : ''),
        wastage: settings.wastage ?? (lib?.default_wastage || 5),
        usage_data: { ...(lib?.packing_form ? { _packing_unit: lib.packing_form } : {}), ...usageData },
      },
    })
  }

  const styleCounts = new Map()
  orders.forEach(order => {
    if (order.style_number) styleCounts.set(order.style_number, (styleCounts.get(order.style_number) || 0) + 1)
  })
  const batchOrders = new Set(membership.filter(link => link.batch_id === batch).map(link => link.order_id))
  const visible = [...new Set(orders.filter(order => order.style_number && (!batch || batchOrders.has(order.id)) &&
    order.style_number.toLowerCase().includes(search.toLowerCase())).map(order => order.style_number))].sort()
  const ready = (draft?.styles || []).filter(style => review.some(row => row.style === style) &&
    !review.some(row => row.style === style && row.action === 'Blocked'))
  const selectedRows = review.filter(row => checked.includes(row.style))
  const selectedCount = new Set(selectedRows.map(row => row.order_id)).size
  const changeCount = selectedRows.filter(row => row.action === 'Add' || replacements.includes(row.before?.id)).length
  const toggle = (values, value) => values.includes(value) ? values.filter(item => item !== value) : [...values, value]
  function consumption(line) {
    if (line?.base_qty != null) return line.base_qty
    const rates = normalizeUsageData(line?.usage_data)
    if (rates.__matrix) return rates.__matrix.map(cell =>
      [cell.sgName, cell.colorName, cell.na ? 'N/A' : cell.consumption].join(' / ')).join(', ')
    if (rates.__batches) return rates.__batches.map(batch =>
      batch.name + ' (' + batch.cells.map(cell => [cell.sgName, cell.colorName, cell.size].filter(Boolean).join(' / ')).join(', ') +
      '): ' + batch.consumption).join('; ')
    return Object.entries(rates).filter(([key]) => !key.startsWith('_'))
      .map(([key, rate]) => {
        const cell = normalizeUsageCell(rate)
        return key + ': ' + (cell.na ? 'N/A' : cell.value)
      }).join(', ')
  }
  const specText = line => [line?.detail, line?.specification].filter(Boolean).join(' · ')
  const outcome = row => row.issue || (row.action === 'Replace' ? replacements.includes(row.before.id) && checked.includes(row.style)
    ? 'Replace existing line' : 'Keep existing line' : row.action)
  const headings = ['PO', 'Store', 'Material', 'Usage', 'Detail / Spec', 'Consumption', 'Wastage', 'Required', 'Change']
  function cells(row) {
    const { after, before } = row
    return [[row.po, batch && !batchOrders.has(row.order_id) ? 'Outside batch filter' : ''].filter(Boolean).join(' · '), row.store, after.name, after.usage_rule, specText(after), consumption(after), after.wastage + '%',
      after.final_qty == null ? '—' : after.final_qty + ' ' + (after.unit || ''),
      [outcome(row), row.action === 'Replace' && ('Existing: ' + [before.usage_rule, specText(before), consumption(before)].filter(Boolean).join(' · '))].filter(Boolean).join(' — ')]
  }

  async function printReview() {
    const body = draft.styles.map(style => '<h2>' + esc(style) + ' · ' + (checked.includes(style) ? 'Selected' : 'Unchecked') +
      '</h2><table><thead><tr>' + headings.map(label => '<th>' + esc(label) + '</th>').join('') +
      '</tr></thead><tbody>' + review.filter(row => row.style === style).map(row => '<tr>' +
        cells(row).map(cell => '<td>' + esc(cell) + '</td>').join('') + '</tr>').join('') + '</tbody></table>').join('')
    await saveDesktopPdf('<html><head><title>Bulk BOM review</title><style>' +
      'body{font:12px Arial} table{border-collapse:collapse;width:100%} th,td{border:1px solid #555;padding:5px;text-align:left}' +
      '</style></head><body><h1>Bulk BOM review</h1><p>' + esc(name) + ' · ' +
      esc(buyers.find(item => item.id === buyer)?.name) + '</p>' + body + '</body></html>', 'Bulk BOM review')

  }

  async function applyChecked() {
    const replacementIds = new Set(selectedRows.filter(row => row.action === 'Replace' && replacements.includes(row.before.id)).map(row => row.before.id))
    if (replacementIds.size && !await confirm('Overwrite ' + replacementIds.size + ' selected existing BOM lines?', {
      title: 'Confirm BOM overwrites', confirmText: 'Overwrite when synced',
    })) return
    const changes = new Map()
    for (const row of selectedRows) {
      if (row.action !== 'Add' && !replacementIds.has(row.before?.id)) continue
      const lines = changes.get(row.order_id) || []
      lines.push({ existingId: row.before?.id ?? null, after: row.after })
      changes.set(row.order_id, lines)
    }
    await localRequest('queue', { buyerId: buyer, orders: [...changes].map(([orderId, lines]) => ({
      orderId, lines, expected: baseline.get(orderId),
    })) })
    window.dispatchEvent(new Event('app2a-offline-data-changed'))
    markTabUpdated('purchasingPage', 'material')
    setNotice('Saved ' + changeCount + ' BOM lines on this device. Changes will sync when connected.')
    setChecked([])
    setReplacements([])
    setStep(0)

  }

  const canSave = !!buyer && !!name.trim()
  const buyerPackages = packages.filter(item => item.buyer_id === buyer)
  const selectedPackage = buyerPackages.find(item => item.id === packageId)
  return <>
    <Dialogs />
    <button className="btn btn-secondary" disabled={busy} onClick={openList}>Saved Bulk BOMs</button>
    <button className="btn btn-primary" onClick={() => open(null)}>Build Bulk BOM</button>
    {error && !draft && !list && <span role="alert">{error}</span>}
    {list && <MinimizableModal title="Saved Bulk BOMs" onClose={() => setList(null)}>
      <section className="card" style={{padding: 20, width: 'min(700px, 90vw)'}}>
        <header className="section-header"><h2>Saved Bulk BOMs</h2><button className="btn btn-secondary" onClick={() => setList(null)}>Close</button></header>
        {list.length ? list.map(record => <p key={record.id}><button className="btn btn-secondary" onClick={() => open(record)}>{record.name}</button>{' '}
          {buyers.find(item => item.id === record.buyer_id)?.name} · {record.applied_at ? 'Previously applied' : 'Draft'}</p>) : <p>No saved Bulk BOMs.</p>}
      </section>
    </MinimizableModal>}
    {draft && <MinimizableModal title="Bulk BOM Creation" onClose={() => !busy && setDraft(null)}>
      <section className="bulk-bom">
        <nav className="bulk-bom-steps" aria-label="Bulk BOM steps">
          {steps.map((label, index) => <button key={label} type="button"
            aria-current={step === index ? 'step' : undefined}
            disabled={busy || index >= step} onClick={() => setStep(index)}>
            <span className="bulk-bom-step-number" data-complete={index < step}>
              {index < step ? <Check size={12} strokeWidth={3}/> : index + 1}
            </span>
            {label}
          </button>)}
        </nav>
        <div className="bulk-bom-body" key={step}>
          {error && <p className="bulk-bom-error" role="alert">{error}</p>}
          {notice && <p className="bulk-bom-notice" role="status">{notice}</p>}
        {step === 0 && <>
          <h2>Materials and usage</h2>
          <div className="bulk-bom-fields">
          <label className="bulk-bom-field">BOM name <input placeholder="Enter a name for this BOM" className="form-control" maxLength={160} value={name} onChange={event => setName(event.target.value)}/></label>
          <label className="bulk-bom-field">Buyer <select className="form-control" disabled={!!saved || busy} value={buyer} onChange={event => {
            setBuyer(event.target.value); setBatch(''); setSearch(''); setPackageId(''); setMaterialId(''); setNotice(''); setError(''); setDraft(emptyDraft)
          }}><option value="">Select one buyer</option>{buyers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <div className="bulk-bom-tools">
            <div className="bulk-bom-tool"><label className="bulk-bom-field">Trim package <select className="form-control" disabled={!buyer} value={packageId} onChange={event => setPackageId(event.target.value)}>
              <option value="">Select package</option>{buyerPackages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button className="btn btn-secondary" disabled={!selectedPackage} onClick={() => add((selectedPackage.bom_preset_items || []).map(item => item.library_item_id))}>Import Trim Package</button></div>
            <div className="bulk-bom-tool"><label className="bulk-bom-field">Library material <select className="form-control" disabled={!buyer} value={materialId} onChange={event => setMaterialId(event.target.value)}>
              <option value="">Select material</option>{categories.map(category => <optgroup key={category} label={category}>
                {[...library.values()].filter(item => item.category === category).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>)}</select></label>
            <button className="btn btn-secondary" disabled={!materialId} onClick={() => add([materialId])}>Add Material</button></div>
          </div>
          <div className="table-wrap"><table><thead><tr>{['Category','Material','Usage','Same Consumption Per Style','Actions'].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{draft.materials.map(item => <tr key={item.id}>
              <td>{library.get(item.id)?.category}</td><td>{library.get(item.id)?.name || 'Unavailable material'}</td>
              <td><select className="form-control" aria-label="Usage" value={item.usage} onChange={event => changeMaterial(item.id,{
                usage:event.target.value,
                settings:Object.fromEntries(Object.entries(item.settings).map(([style, settings]) =>
                  [style, { spec: settings.spec, wastage: settings.wastage }])),
              })}>
                {USAGE_RULES.map(rule => <option key={rule}>{rule}</option>)}</select></td>
              <td><div className="bulk-bom-inline"><label><input type="checkbox" disabled={item.usage === 'By Batch'} checked={item.shared && item.usage !== 'By Batch'} onChange={event => changeMaterial(item.id,{shared:event.target.checked})}/> Same rate</label>{' '}
                <input aria-label="Shared consumption" type="number" min="0" step="any" disabled={!item.shared || item.usage === 'By Batch'} value={item.rate} onChange={event => changeMaterial(item.id,{rate:event.target.value})}/></div></td>
              <td><button className="btn btn-secondary" onClick={() => setDraft({...draft, materials:draft.materials.filter(row => row.id !== item.id)})}>Remove</button></td>
            </tr>)}</tbody></table></div>
          {!draft.materials.length && <div className="bulk-bom-empty"><PackageOpen size={26}/>
            <strong>No materials added</strong>
            <span>{buyer ? 'Import a trim package or add a library material.' : 'Choose a buyer to get started.'}</span>
          </div>}
        </>}
        {step === 1 && <>
          <h2>Select styles</h2>
          <div className="bulk-bom-tools bulk-bom-filters">
            <label className="bulk-bom-field">Find styles <input className="form-control" value={search} onChange={event => setSearch(event.target.value)}/></label>
            <label className="bulk-bom-field">Internal batch filter <select className="form-control" value={batch} onChange={event => setBatch(event.target.value)}>
              <option value="">All batches</option>{batches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button className="btn btn-secondary" onClick={() => setDraft({...draft, styles:[...new Set([...draft.styles,...visible])]})}>Select visible styles</button>
          </div>
          <p className="bulk-bom-context">{draft.styles.length} styles selected. Each style includes all its POs for this buyer.</p>
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">Style</th><th scope="col">Purchase orders</th><th scope="col">Batch filter</th></tr></thead>
            <tbody>{[...new Set([...visible,...draft.styles])].map(style => <tr key={style}>
              <td><label className="bulk-bom-inline"><input type="checkbox" checked={draft.styles.includes(style)}
                onChange={() => setDraft({...draft, styles:toggle(draft.styles,style)})}/> {style}</label></td>
              <td>{styleCounts.get(style) || 0}</td>
              <td>{!visible.includes(style) ? 'Outside filter' : '—'}</td>
            </tr>)}</tbody>
          </table></div>
          {!visible.length && !draft.styles.length && <div className="bulk-bom-empty"><Search size={24}/><strong>No matching styles</strong></div>}
        </>}
        {step === 2 && <><h2>Set consumptions</h2>{draft.styles.map(style => <section key={style} className="bulk-bom-group"><h3>{style}</h3>
          <div className="table-wrap"><table><thead><tr><th>Material</th><th>Detail / Spec</th><th>Consumption</th><th>Wastage %</th></tr></thead>
          <tbody>{draft.materials.map(item => {
            const lib = library.get(item.id)
            const settings = item.settings[style] || {}
            return <tr key={item.id}><td>{lib?.name || 'Unavailable material'}</td>
              <td><input className="form-control" aria-label={'Detail / Spec for ' + (lib?.name || 'material')}
                value={settings.spec ?? (lib ? librarySpec(lib) : '')} onChange={event => changeSettings(item,style,{spec:event.target.value})}/></td>
              <td>{item.shared && item.usage !== 'By Batch'
                ? <span>{item.rate || '—'} {lib?.unit} · shared rate</span>
                : <button className="btn btn-secondary" onClick={() => configure(item,style,lib,settings)}>
                  Configure {item.usage}
                </button>}</td>
              <td><input aria-label={'Wastage for ' + (lib?.name || 'material')} type="number" min="0" step="any"
                className="form-control" placeholder={String(lib?.default_wastage || 5)}
                value={settings.wastage ?? ''} onChange={event => changeSettings(item,style,{wastage:event.target.value})}/></td>
            </tr>
          })}</tbody></table></div></section>)}</>}
        {step === 3 && <>
          <h2>Review and apply</h2>
          <div className="bulk-bom-review-tools">
            <label className="bulk-bom-inline"><input type="checkbox" checked={ready.length > 0 && ready.every(style => checked.includes(style))}
              onChange={event => setChecked(event.target.checked ? ready : [])}/> Select all ready styles</label>
            <button className="btn btn-secondary" onClick={() => run(printReview)}><Printer size={14}/> Print Review</button>
          </div>
          {draft.styles.map(style => <section key={style} className="bulk-bom-group bulk-bom-review-group">
            <label className="bulk-bom-inline"><input type="checkbox" checked={checked.includes(style)} disabled={!ready.includes(style) || busy}
              onChange={() => setChecked(toggle(checked,style))}/> {style}{!ready.includes(style) && ' · Needs attention'}</label>
            <details><summary>Review POs and stores</summary><div className="table-wrap"><table><thead><tr>
              {headings.map(label => <th key={label}>{label}</th>)}<th>Overwrite</th></tr></thead><tbody>
              {review.filter(row => row.style === style).map(row => <tr key={row.order_id + '|' + row.after.library_item_id}>
                {cells(row).map((cell,index) => <td key={index}>{cell}</td>)}
                <td>{row.action === 'Replace' && <label><input type="checkbox" checked={replacements.includes(row.before.id)}
                  onChange={() => setReplacements(toggle(replacements,row.before.id))}/> Replace</label>}</td>
              </tr>)}</tbody></table></div></details>
          </section>)}
        </>}
        </div>
        <footer className="bulk-bom-footer">
          {step > 0 && <button className="btn btn-secondary" disabled={busy} onClick={() => setStep(step - 1)}><ChevronLeft size={14}/> Back</button>}
          {step < 3 && <button className="btn btn-secondary" disabled={busy || !canSave} onClick={() => run(async () => { await save(); setNotice('Draft saved.') })}>Save Draft</button>}
          <span className="bulk-bom-spacer"/>
          {step === 0 && <button className="btn btn-primary" disabled={busy || !canSave || !draft.materials.length} onClick={() => setStep(1)}>Next Step</button>}
          {step === 1 && <button className="btn btn-primary" disabled={busy || !draft.styles.length} onClick={() => run(loadMatrices)}>Next Step</button>}
          {step === 2 && <button className="btn btn-primary" disabled={busy} onClick={() => run(beginReview)}>Review Bulk BOM</button>}
          {step === 3 && <button className="btn btn-primary" disabled={busy || !changeCount} onClick={() => run(applyChecked)}>
            Queue BOM for {checked.length} styles · {selectedCount} POs
          </button>}
        </footer>
      </section>
      {usageConfig && <UsageModal config={usageConfig} poData={matrices[usageConfig.style]}
        orderData={{style_number: usageConfig.style}} onClose={() => setUsageConfig(null)}
        onSave={(_, usageData) => changeSettings(usageConfig.material, usageConfig.style, { usageData })}/>}
    </MinimizableModal>}
  </>
}
