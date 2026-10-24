// Printable, order-scoped finishing plan. All values are derived from saved wizard records.
const e = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const num = value => Number(value) || 0
const fmt = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US',{maximumFractionDigits:3}) : '—'
const date = value => value ? new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const cell = value => `<td>${e(value)}</td>`
const line = items => `<tr>${items.map(cell).join('')}</tr>`
const section = title => `<h2>${e(title)}</h2>`
const table = (heads,rows) => `<table><thead><tr>${heads.map(x=>`<th>${e(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`

export function buildFinishingPlanHTML(order, data, packs) {
  const groups = data.sizeGroups || []
  const colors = data.colors || []
  const breakdown = data.breakdown || []
  const washing = data.wash || []
  const fin = (data.finishing || [])[0] || {}
  const warnings = []
  const groupRows = []
  let orderTotal = 0
  for (const group of groups) {
    for (const color of colors.filter(c=>String(c.size_group_id)===String(group.id))) {
      const wash = washing.find(w=>String(w.color_id)===String(color.id)) || washing.find(w=>w.color_name===color.color_name)
      const values = (group.sizes || []).map(size=>breakdown.filter(b=>String(b.color_id)===String(color.id)&&String(b.size)===String(size)).reduce((sum,b)=>sum+num(b.qty),0))
      const total = values.reduce((a,b)=>a+b,0)
      if (!total) continue
      orderTotal += total
      const ratioBase = values.filter(v=>v>0).reduce((a,b)=>{function gcd(x,y){return y?gcd(y,x%y):x};return gcd(a,b)},0) || 1
      const ratio = values.map(v=>v?fmt(v/ratioBase):'0').join(' : ')
      const cut = values.map(v=>Math.ceil(v*(1+num(order.excess_cutting_pct || 0)/100)))
      groupRows.push(`<tr class="group"><td colspan="${values.length+2}">${e(color.color_name||'Colour')} · ${e(wash?.wash_type||wash?.wash_ref||'Wash not specified')} · ${e(group.group_name||'Size Group')}</td></tr>`)
      groupRows.push(line(['Sizes',...(group.sizes||[]),'Total']))
      groupRows.push(line(['Order Qty',...values.map(fmt),fmt(total)]))
      groupRows.push(line(['Ratio',...ratio.split(' : '),'—']))
      groupRows.push(line(['Cutting Qty',...cut.map(fmt),fmt(cut.reduce((a,b)=>a+b,0))]))
    }
  }
  if (!groupRows.length) warnings.push('No saved wash/size breakdown is available for this order.')
  if (!packs.length) warnings.push('No finishing packing configurations have been saved.')
  const packRows = []
  const packingList = []
  const barcodeRows = []
  const noteRows = []
  let totalAssigned=0,totalCartons=0,totalCBM=0,cartonCursor=1
  packs.forEach((p,index)=>{
    const cfg = typeof p.config==='string' ? (()=>{try{return JSON.parse(p.config)}catch{return {}}})() : (p.config||{})
    const qty = num(p.qty_assigned ?? p.assigned_qty ?? cfg.qty_assigned)
    const perCarton = num(p.units_per_carton ?? p.pieces_per_carton)
    const perInner = num(p.pieces_per_pack ?? p.pieces_per_inner_pack)
    const cartons = perCarton>0 ? Math.ceil(qty/perCarton) : 0
    const full = perCarton>0 ? Math.floor(qty/perCarton) : 0
    const remainder = perCarton>0 ? qty%perCarton : 0
    const l=num(p.carton_l ?? p.length_cm),w=num(p.carton_w ?? p.width_cm),h=num(p.carton_h ?? p.height_cm)
    const cbm=l&&w&&h ? cartons*l*w*h/1000000 : null
    const gross=p.carton_weight_kg ?? p.weight_kg
    const packName=p.pack_name||`Pack ${index+1}`
    const meta=cfg.__packMeta||{}
    const hanger=meta.hanger || 'Not specified'
    const barcodes=Array.isArray(meta.barcodes)?meta.barcodes:[]
    const additions=Array.isArray(meta.cartonAdditions)?meta.cartonAdditions:[]
    const deptNotes=meta.departmentNotes||''
    barcodeRows.push(`<p class="note"><strong>${e(packName)}:</strong> ${barcodes.length?e(barcodes.join(' · ')):'Not specified'}${additions.length?`<br/>Add in carton: ${e(additions.join(' · '))}`:''}</p>`)
    if(deptNotes) noteRows.push(`<p class="note"><strong>${e(packName)}:</strong> ${e(deptNotes)}</p>`)
    const basis=p.pack_type||p.packing_basis||'—'
    if(!qty) warnings.push(`${packName}: assigned quantity is missing.`)
    if(!perCarton) warnings.push(`${packName}: pieces per carton is missing.`)
    if(!l||!w||!h) warnings.push(`${packName}: carton dimensions are incomplete.`)
    const details=`${full} full${remainder?` + 1 partial (${remainder} pcs)`:''}`
    packRows.push(line([packName,hanger,p.inner_pack_type||'—',perInner||'—',perCarton||'—',fmt(qty),cartons||'—',details]))
    const range=cartons?`${cartonCursor}–${cartonCursor+cartons-1}`:'—'
    cartonCursor+=cartons
    totalAssigned+=qty;totalCartons+=cartons;totalCBM+=cbm||0
    packingList.push(line([range,packName,basis,fmt(qty),perCarton||'—',cartons||'—',perInner?`${p.inner_pack_type||'Inner'} / ${perInner} pcs`:p.inner_pack_type||'—',gross||'—',cbm===null?'—':fmt(cbm)]))
  })
  if(packs.length&&orderTotal&&totalAssigned!==orderTotal&&!fin.use_cutting_qty) warnings.push(`Packing assigned quantity (${fmt(totalAssigned)}) does not match order breakdown (${fmt(orderTotal)}).`)
  const details = [
    ['Buyer',order.buyer_name],['Style',order.style_number],['Job #',order.job_number],['Factory Ref #',order.factory_ref||order.factory_ref_number],
    ['PO #',order.po_number],['Store',order.store_name],['Ship Date',date(order.ship_date)],['Pack Name',packs.map(p=>p.pack_name).filter(Boolean).join(', ')||'—']
  ]
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Finishing Plan — ${e(order.style_number)}</title><style>
  @page{size:A4 portrait;margin:12mm 11mm 15mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#161616;margin:0;font-size:10px;line-height:1.4}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:9px;margin-bottom:12px}header .brand{font-size:18px;font-weight:800;letter-spacing:-.5px}header .title{font-size:26px;font-weight:800;letter-spacing:.5px}header .meta{font-size:9px;color:#555;text-align:right}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #111;padding:5px 0;margin:17px 0 7px;break-after:avoid}table{width:100%;border-collapse:collapse;table-layout:auto;font-size:9px;margin:0 0 10px}th,td{border:1px solid #bbb;padding:5px 6px;text-align:left;vertical-align:top}th{background:#eee;color:#111;font-weight:700}thead{display:table-header-group}tr{break-inside:avoid}.group td{background:#e7e7e7;font-weight:700;padding:6px}.details{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 12px;margin-bottom:10px}.details div{padding:3px 0}.details small{display:block;color:#666;text-transform:uppercase;font-size:8px}.details strong{font-size:10px}.note{color:#444;font-size:9px}.warn{border:1px solid #777;padding:8px 10px;margin-top:12px}.warn strong{display:block;margin-bottom:4px}.approvalFooter{margin-top:32px;break-inside:avoid}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:26px;break-inside:avoid}.signatures div{border:1px solid #888;height:55px;display:flex;align-items:flex-end;justify-content:center;padding:7px;font-weight:bold;font-size:9px}@media print{.approvalFooter{margin-top:35mm}}.printbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px;text-align:right;margin:-0px 0 15px}.printbar button{background:#111;color:white;border:0;border-radius:5px;padding:8px 16px;cursor:pointer}
  @media print{.printbar{display:none}body{margin:0}h2{break-after:avoid}}
  </style></head><body><div class="printbar"><button onclick="window.print()">Print / Save as PDF</button></div>
  <header><div class="brand">NIZAMIA<br/>APPARELS</div><div class="title">FINISHING PLAN</div><div class="meta">${e(order.style_number||'')}<br/>Generated ${e(new Date().toLocaleString('en-GB'))}</div></header>
  <div class="details">${details.map(([k,v])=>`<div><small>${e(k)}</small><strong>${e(v)}</strong></div>`).join('')}</div>
  ${section('1. Order breakdown / size & wash')}${groupRows.length?table([],groupRows):'<p class="note">No size breakdown available.</p>'}
  ${section('2. Packing instructions')}${table(['Pack','Hanger','Inner Type','Pcs / Inner','Pcs / CTN','Assigned Qty','CTNS','Carton Split'],packRows)}
  ${section('3. Tentative packing list')}${table(['CTN Nos.','Pack','Basis','Qty','Pcs / CTN','CTNS','Inner Pack','Gross kg/CTN','CBM'],packingList)}
  <p class="note"><strong>Totals:</strong> ${fmt(totalAssigned)} pieces · ${fmt(totalCartons)} cartons · ${fmt(totalCBM)} m³. Carton numbers are tentative and sequential per packing configuration.</p>
  ${section('4. Barcode / labelling instructions')}${barcodeRows.join('') || '<p class="note">Not specified.</p>'}
  ${section('5. Extra notes for dept.')}${noteRows.join('') || '<p class="note">—</p>'}
  ${warnings.length?`<div class="warn"><strong>Items to verify before production</strong>${warnings.map(w=>`<div>• ${e(w)}</div>`).join('')}</div>`:''}
  <div class="approvalFooter"><div class="signatures">${['Merchandiser','Finishing Manager','General Manager','Director'].map(x=>`<div>${x}</div>`).join('')}</div></div>
  </body></html>`
}
