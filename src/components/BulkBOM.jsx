import { Check, ChevronLeft, Search, PackageOpen, Printer } from 'lucide-react'
import './bulkBOM.css'
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MinimizableModal from './ui/MinimizableModal'
import { markTabUpdated } from '../lib/tabNotices'
import { UsageModal } from './wizard/steps/Step3BOM'
import { buildBOMMatrix, normalizeUsageData, normalizeUsageCell, USAGE_RULES } from '../lib/bomUsage'
import { printSamplingHTML } from '../lib/sampleProgramPrint'

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

async function readAll(query) {
  const rows = []
  for (let first = 0; ; first += 500) {
    const page = await read(query.range(first, first + 499))
    rows.push(...page)
    if (page.length < 500) return rows
  }
}

export default function BulkBOM({ buyers, packages, libraryItems }) {
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [name, setName] = useState('')
  const [buyer, setBuyer] = useState('')
  const [step, setStep] = useState(0)
  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState(null)
  const replaceStyles = draft?.replaceStyles || []
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
    await run(async () => setList(await readAll(supabase.from('bulk_bom_drafts').select('*').order('name').order('id'))))
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
    readAll(supabase.from('orders').select('id,style_number,po_number,store_name').eq('buyer_id', buyer).order('id'))
      .then(rows => { if (active) setOrders(rows) })
      .catch(failure => { if (active) setError(failure.message) })
    Promise.all([
      readAll(supabase.from('production_batches').select('id,name').order('name').order('id')),
      readAll(supabase.from('production_batch_orders').select('order_id,batch_id').order('order_id').order('batch_id')),
    ]).then(([allBatches, links]) => {
      if (active) { setBatches(allBatches); setMembership(links) }
    }).catch(() => {})
    return () => { active = false }
  }, [buyer, !!draft])

  useEffect(() => {
    setInventory(null)
    if (step !== 1 || !buyer) return
    let active = true
    readAll(supabase.from('bom_items').select('id,name,category,orders!inner(buyer_id,style_number,po_number)')
      .eq('orders.buyer_id',buyer).order('id')).then(rows => {
      if (!active) return
      const grouped = new Map()
      for (const line of rows) {
        const key = JSON.stringify([line.orders.style_number,line.category])
        if (!grouped.has(key)) grouped.set(key,[])
        grouped.get(key).push(line)
      }
      setInventory(grouped)
    }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [step,buyer])

  const [estimate, setEstimate] = useState(null)
  useEffect(() => {
    if (step !== 2) return
    let active = true
    const timer = setTimeout(async () => {
      try {
        const rows = await read(supabase.rpc('bulk_bom_consumption_totals', {buyer, proposal:draft}))
        if (active) setEstimate({draft, rows:new Map(rows.map(row => [JSON.stringify([row.style,row.material]),row]))})
      } catch (failure) {
        if (active) setEstimate({draft, error:failure.message})
      }
    },350)
    return () => { active = false; clearTimeout(timer) }
  },[step,buyer,draft])

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
    const values = { name: name.trim(), draft, revision: crypto.randomUUID() }
    const query = saved
      ? supabase.from('bulk_bom_drafts').update(values).eq('id', saved.id).eq('revision', saved.revision)
      : supabase.from('bulk_bom_drafts').insert({ ...values, buyer_id: buyer })
    const record = await read(query.select().single())
    setSaved(record)
    return record
  }

  async function beginReview() {
    const record = await save()
    setReview(await read(supabase.rpc('bulk_bom_review_web', { draft_id: record.id, selected_styles: draft.styles })))
    setChecked([])
    setReplacements([])
    setNotice('')
    setStep(3)
  }

  async function loadMatrices() {
    const selected = orders.filter(order => draft.styles.includes(order.style_number))
    async function loadFor(table, column, ids, sort) {
      const pages = []
      for (let start = 0; start < ids.length; start += 100) {
        pages.push(readAll(supabase.from(table).select('*').in(column, ids.slice(start, start + 100))
          .order(sort).order('id')))
      }
      return (await Promise.all(pages)).flat()
    }
    const groups = await loadFor('size_groups', 'order_id', selected.map(order => order.id), 'sort_order')
    const ids = groups.map(group => group.id)
    const [colors, breakdown] = await Promise.all([
      loadFor('size_group_colors', 'size_group_id', ids, 'sort_order'),
      loadFor('size_group_breakdown', 'size_group_id', ids, 'size'),
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
  const changeCount = selectedRows.filter(row => ['Add','Remove'].includes(row.action) || row.action === 'Replace' && (replaceStyles.includes(row.style) || replacements.includes(row.before.id))).length
  const toggle = (values, value) => values.includes(value) ? values.filter(item => item !== value) : [...values, value]
  function consumption(line) {
    if (line?.base_qty != null) return line.base_qty
    const rates = normalizeUsageData(line?.usage_data)
    if (rates.__matrix) return rates.__matrix.map(cell =>
      [cell.sgName, cell.colorName, cell.na ? 'N/A' : cell.consumption, ...(cell.overrides || []).map(o => o.size + ' = ' + (o.na ? 'N/A' : o.consumption))].join(' / ')).join(', ')
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
  const outcome = row => row.issue || (row.action === 'Replace' ? (replaceStyles.includes(row.style) || replacements.includes(row.before.id)) && checked.includes(row.style)
    ? 'Replace existing line' : 'Keep existing line' : row.action === 'Unchanged' ? 'Keep' : row.action)
  const headings = ['PO', 'Store', 'Material', 'Usage', 'Detail / Spec', 'Consumption', 'Wastage', 'Required', 'Change']
  function cells(row) {
    const before = row.before
    const after = row.after || before
    return [[row.po, batch && !batchOrders.has(row.order_id) ? 'Outside batch filter' : ''].filter(Boolean).join(' · '), row.store, [after.category,after.name].filter(Boolean).join(' · '), after.usage_rule, specText(after), consumption(after), after.wastage + '%',
      after.final_qty == null ? '—' : after.final_qty + ' ' + (after.unit || ''),
      [outcome(row), row.action === 'Replace' && ('Existing: ' + [before.usage_rule, specText(before), consumption(before)].filter(Boolean).join(' · '))].filter(Boolean).join(' — ')]
  }

  function printReview() {
    const body = draft.styles.map(style => '<h2>' + esc(style) + ' · ' + (checked.includes(style) ? 'Selected' : 'Unchecked') +
      '</h2><table><thead><tr>' + headings.map(label => '<th>' + esc(label) + '</th>').join('') +
      '</tr></thead><tbody>' + review.filter(row => row.style === style).map(row => '<tr>' +
        cells(row).map(cell => '<td>' + esc(cell) + '</td>').join('') + '</tr>').join('') + '</tbody></table>').join('')
    printSamplingHTML('<h1>Bulk BOM review</h1><p>' + esc(name) + ' · ' +
      esc(buyers.find(item => item.id === buyer)?.name) + '</p>' + body, 'Bulk BOM review')
  }

  async function applyChecked() {
    const replacementIds = selectedRows.filter(row => row.action === 'Replace' && (replaceStyles.includes(row.style) || replacements.includes(row.before.id))).map(row => row.before.id)
    const removed = selectedRows.filter(row => row.action === 'Remove')
    if ((replacementIds.length || removed.length) && !window.confirm(
      'Apply changes across ' + selectedCount + ' POs? Overwrite ' + replacementIds.length + ' existing lines and remove ' + removed.length + ' lines.' +
      (removed.length ? '\n' + categories.map(category => category + ': ' + removed.filter(row => row.before.category === category).length).join(' · ') : '')
    )) return
    await read(supabase.rpc('bulk_bom_review_web', {
      draft_id: saved.id, selected_styles: checked, expected: selectedRows, replace_lines: replacementIds, remove_lines: removed.map(row => row.before.id),
    }))
    markTabUpdated('purchasingPage', 'material')
    setNotice('Applied ' + changeCount + ' BOM lines across ' + selectedCount + ' POs.')
    setChecked([])
    setReplacements([])
    setReview(await read(supabase.rpc('bulk_bom_review_web', { draft_id: saved.id, selected_styles: draft.styles })))
  }

  const canSave = !!buyer && !!name.trim()
  const buyerPackages = packages.filter(item => item.buyer_id === buyer)
  const selectedPackage = buyerPackages.find(item => item.id === packageId)
  return <>
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
          <p className="bulk-bom-context">{draft.styles.length} styles selected. Counts are saved BOM lines across all POs for this buyer. Expand a count for details. Replace entire BOM removes lines omitted from this draft when you confirm Apply.</p>
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">Style</th><th scope="col">Purchase orders</th>{categories.map(category => <th scope="col" key={category}>Current BOM<br/>{category}</th>)}<th>Replace entire BOM</th></tr></thead>
            <tbody>{[...new Set([...visible,...draft.styles])].map(style => <tr key={style}>
              <td><label className="bulk-bom-inline"><input type="checkbox" checked={draft.styles.includes(style)}
                onChange={() => setDraft({...draft, styles:toggle(draft.styles,style), replaceStyles:replaceStyles.filter(value => value !== style)})}/> {style}</label>{!visible.includes(style) && ' · Outside filter'}</td>
              <td>{styleCounts.get(style) || 0}</td>
              {categories.map(category => {
                const lines = inventory?.get(JSON.stringify([style,category])) || []
                return <td key={category}>{!inventory ? '—' : lines.length ? <details><summary aria-label={category + ' lines for ' + style}>{lines.length}</summary>
                  {lines.map(line => <div key={line.id}>PO {line.orders.po_number} · {line.name}</div>)}</details> : 0}</td>
              })}
              <td><input type="checkbox" aria-label={'Replace entire BOM for ' + style} disabled={!draft.styles.includes(style) || !inventory}
                checked={replaceStyles.includes(style)} onChange={() => setDraft({...draft,replaceStyles:toggle(replaceStyles,style)})}/></td>
            </tr>)}</tbody>
          </table></div>
          {!visible.length && !draft.styles.length && <div className="bulk-bom-empty"><Search size={24}/><strong>No matching styles</strong></div>}
        </>}
        {step === 2 && <><h2>Set consumptions</h2>{draft.styles.map(style => <section key={style} className="bulk-bom-group"><h3>{style}</h3>
          <div className="table-wrap"><table><thead><tr><th>Material</th><th>Detail / Spec</th><th>Consumption</th><th>Wastage %</th><th>Total trim quantity</th></tr></thead>
          <tbody>{draft.materials.map(item => {
            const lib = library.get(item.id)
            const settings = item.settings[style] || {}
            const total = estimate?.draft === draft && estimate.rows?.get(JSON.stringify([style,item.id]))
            return <tr key={item.id}><td>{lib?.name || 'Unavailable material'}</td>
              <td><input className="form-control" aria-label={'Detail / Spec for ' + (lib?.name || 'material')}
                value={settings.spec ?? (lib ? librarySpec(lib) : '')} onChange={event => changeSettings(item,style,{spec:event.target.value})}/></td>
              <td>{item.shared && item.usage !== 'By Batch'
                ? <div className="bulk-bom-inline"><input className="form-control" type="number" min="0" step="any"
                    aria-label={'Consumption for ' + lib?.name + ' on ' + style} value={settings.sharedRate ?? item.rate ?? ''}
                    onChange={event => changeSettings(item,style,{sharedRate:event.target.value})}/>
                    <small>{lib?.unit}/pc · {settings.sharedRate == null ? 'Shared rate' : 'Style rate'}</small>
                    {settings.sharedRate != null && <button className="btn btn-secondary" onClick={() => changeSettings(item,style,{sharedRate:undefined})}>Use shared rate</button>}</div>
                : <button className="btn btn-secondary" onClick={() => configure(item,style,lib,settings)}>
                  Configure {item.usage}
                </button>}</td>
              <td><input aria-label={'Wastage for ' + (lib?.name || 'material')} type="number" min="0" step="any"
                className="form-control" placeholder={String(lib?.default_wastage || 5)}
                value={settings.wastage ?? ''} onChange={event => changeSettings(item,style,{wastage:event.target.value})}/></td>
              <td aria-live="polite">{total?.qty != null
                ? [Number(total.qty).toLocaleString(undefined,{maximumFractionDigits:1}), lib?.unit].filter(Boolean).join(' ')
                : '—'}</td>
            </tr>
          })}</tbody></table></div></section>)}</>}
        {step === 3 && <>
          <h2>Review and apply</h2>
          <div className="bulk-bom-review-tools">
            <label className="bulk-bom-inline"><input type="checkbox" checked={ready.length > 0 && ready.every(style => checked.includes(style))}
              onChange={event => setChecked(event.target.checked ? ready : [])}/> Select all ready styles</label>
            <button className="btn btn-secondary" disabled={busy} onClick={() => run(beginReview)}>Refresh review</button>
            <button className="btn btn-secondary" onClick={printReview}><Printer size={14}/> Print Review</button>
          </div>
          {draft.styles.map(style => <section key={style} className="bulk-bom-group bulk-bom-review-group">
            <label className="bulk-bom-inline"><input type="checkbox" checked={checked.includes(style)} disabled={!ready.includes(style) || busy}
              onChange={() => setChecked(toggle(checked,style))}/> {style}{!ready.includes(style) && ' · Needs attention'}</label>
            {replaceStyles.includes(style) && <p>Replace entire BOM · {review.filter(row => row.style === style && row.action === 'Remove').length} existing lines to remove</p>}
            <details><summary>Review POs and stores</summary><div className="table-wrap"><table><thead><tr>
              {headings.map(label => <th key={label}>{label}</th>)}<th>Overwrite</th></tr></thead><tbody>
              {review.filter(row => row.style === style).map(row => <tr key={row.order_id + '|' + (row.before?.id || row.after.library_item_id)}>
                {cells(row).map((cell,index) => <td key={index}>{cell}</td>)}
                <td>{row.action === 'Replace' && <label><input type="checkbox" disabled={replaceStyles.includes(style)} checked={replaceStyles.includes(style) || replacements.includes(row.before.id)}
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
            Apply BOM to {checked.length} styles · {selectedCount} POs
          </button>}
        </footer>
      </section>
      {usageConfig && <UsageModal config={usageConfig} poData={matrices[usageConfig.style]}
        orderData={{style_number: usageConfig.style}} onClose={() => setUsageConfig(null)}
        onSave={(_, usageData) => changeSettings(usageConfig.material, usageConfig.style, { usageData })}/>}
    </MinimizableModal>}
  </>
}
