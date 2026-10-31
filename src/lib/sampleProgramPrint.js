import {supabase} from './supabase'
import {usageObject,usageNumber} from './usageMath'
const safeText=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const dayString=value=>{if(!value)return '';const d=new Date(String(value).slice(0,10)+'T12:00:00');return Number.isNaN(d.getTime())?'':d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}).replace(/ /g,'-')}
function shiftDate(value,days){if(!value)return '';const d=new Date(String(value).slice(0,10)+'T12:00:00');if(Number.isNaN(d.getTime()))return '';d.setDate(d.getDate()+days);return dayString(d.toISOString().slice(0,10))}
export async function buildSampleProgramHTML(row, {bomItems=[],fittingBlocks=[],allRows=[],sampleComments=[],parcelItems=[]}={}) {
    const washColour = r => {const snapshot=Array.isArray(r.wash_snapshot)?r.wash_snapshot:[];const names=[...new Set(snapshot.map(w=>w?.color_name||w?.colour_name||w?.wash_color||w?.wash_colour).filter(Boolean))];return names.join(', ')||(Array.isArray(r.colours)?r.colours.join(', '):'')||r.color||'—'}
    const sampleSize = r => r.base_size || (Array.isArray(r.sizes) ? r.sizes.join(', ') : '') || r.size || '—'
    const qty = Number(row.qty ?? row.req_pcs) || 0
    const orderBOM = bomItems.filter(item=>item.order_id===row.order_id)
    const priority = item => {
      const text = `${item.category || ''} ${item.name || ''}`.toLowerCase()
      if (/fabric|denim|canvas|twill/.test(text)) return 0
      if (/thread/.test(text)) return 1
      if (/zipper|zip\b/.test(text)) return 2
      return 3
    }
    const sortedBOM=[...orderBOM].sort((a,b)=>priority(a)-priority(b)||(a.sort_order||0)-(b.sort_order||0))
    // A sample is cut in one size, so size-group fabric consumption must be
    // resolved from the sample size/group, not from an order-wide average.
    const sizeText=String(sampleSize(row)||'').trim()
    const groupText=String(row.size_group_name||'').trim()
    const normalizeGroup=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'')
    const resolveGroup=ud=>{
      const groups=Object.keys(ud).filter(k=>!k.startsWith('_'))
      const exact=groups.find(g=>normalizeGroup(g)===normalizeGroup(groupText))
      if(exact)return exact
      const age=Number((sizeText.match(/\d+/)||[])[0])
      if(!Number.isFinite(age))return null
      const matches=groups.filter(g=>{
        const years=g.match(/(\d+)\s*[-–]\s*(\d+)/)
        return years && age>=Number(years[1]) && age<=Number(years[2])
      })
      return matches.length===1?matches[0]:null
    }
    const wholePieceUnit = u => /^(pcs?|pieces?|units?|nos?\.?|each|ea)$/i.test(String(u||'').trim())
    const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:4})
    const lastEssentialIndex=sortedBOM.reduce((last,item,index)=>priority(item)<3?index:last,-1)
    const bomRows=sortedBOM.map((item,index)=>{
      const rule=String(item.usage_rule||'Generic')
      const ud=usageObject(item.usage_data)
      let consumption=null
      let reason=''
      if(rule==='Generic'){
        const raw=item.base_qty??ud.generic
        if(raw!=null && raw!=='')consumption=usageNumber(raw)
      }else if(rule==='By Size Group'){
        const key=resolveGroup(ud)
        if(key && ud[key] && ud[key].na!==true)consumption=usageNumber(ud[key])
        else reason='Size group not resolved'
      }else if(rule==='By Color'){
        // Only choose a color if it matches the saved sample colour exactly.
        const colours=[row.color,...(Array.isArray(row.colours)?row.colours:[])].filter(Boolean).map(normalizeGroup)
        const matches=Object.keys(ud).filter(k=>!k.startsWith('_')&&colours.includes(normalizeGroup(k)))
        if(matches.length===1 && ud[matches[0]]?.na!==true)consumption=usageNumber(ud[matches[0]])
        else reason='Colour not resolved'
      }else reason='Usage rule needs review'
      const valid=consumption!==null && Number.isFinite(consumption)
      const required=valid?consumption*qty:null
      const important=priority(item)<3
      const unit=safeText(item.unit||'')
      const itemName=[item.name,item.specification].filter(Boolean).join(' - ')||'—'
      const display=valid?`${fmt(consumption)} ${unit}`:`— ${unit}`
      const needed=valid?`${wholePieceUnit(unit)?Math.ceil(Math.max(0,required-1e-9)):fmt(required)} ${unit}`:`— ${unit}`
      return `<tr class="${important?'important':''} ${index===lastEssentialIndex?'last-essential':''}"><td>${safeText(item.category||'—')}</td><td>${safeText(itemName)}</td><td>${safeText(item.detail||'—')}</td><td title="${safeText(reason)}">${display}</td><td>${needed}</td></tr>`
    }).join('') || '<tr><td colspan="5">No BOM items configured for this order</td></tr>'
    const spec=[...fittingBlocks].filter(b=>b.order_id===row.order_id).map(b=>b.spec_code).filter(Boolean).join(', ') || '—'
    const root=row.root_sample_id || row.parent_sample_id || row.id
    const family=allRows.filter(s=>s.id===root || s.root_sample_id===root || (s.sample_number===row.sample_number && s.order_id===row.order_id))
    const earlier=family.filter(s=>s.id!==row.id && Number(s.version_no||1)<Number(row.version_no||1)).sort((a,b)=>Number(a.version_no||1)-Number(b.version_no||1))
    const parcelFor = s => parcelItems.find(p=>[...(Array.isArray(p.items)?p.items:[]),...(Array.isArray(p.custom_items)?p.custom_items:[])].some(x=>x?.sample_id===s.id || x?.sam_number===s.sample_number || x?.sample_number===s.sample_number))
    const histories=earlier.map(s=>{
      const comments=sampleComments.filter(c=>c.sample_id===s.id || c.root_sample_id===s.id || (c.sam_number===s.sample_number && c.version_label===s.version_label))
      const parcel=parcelFor(s)
      return `<div class="history"><b>${safeText(s.version_label||'V1')}</b> — Sample: ${dayString(s.created_at)||'—'} | Parcel: ${safeText(parcel?.parcel_number||parcel?.parcel_no||'—')} · ${safeText(parcel?.status||'—')} · ${dayString(parcel?.dispatch_date||parcel?.dispatched_at)||'—'}<div>${comments.length?comments.map(c=>`<p><b>${dayString(c.comment_date||c.created_at)||'—'}:</b> ${safeText(c.comment_text||'')}</p>`).join(''):(s.comments ? safeText(typeof s.comments==='string'?s.comments:JSON.stringify(s.comments)) : 'No recorded comments')}</div></div>`
    }).join('') || '<div class="history">No previous versions</div>'
    const start=row.requested_date||row.created_at
    const ready=row.dueDate
    const milestones=[['Start Date',dayString(start)],['Pattern Ready',shiftDate(start,1)],['Send to Wash',shiftDate(ready,-2)],['Sample Ready',dayString(ready)]]
    const timelineConflict=!!(start&&ready&&new Date(String(start).slice(0,10))>new Date(String(ready).slice(0,10)))
    const currentParcel=parcelFor(row)
    const currentComments=sampleComments.filter(c=>c.sample_id===row.id || c.sam_number===row.sample_number)
    const commentsHTML=currentComments.map(c=>`<div class="history"><b>${dayString(c.comment_date||c.created_at)||'—'}</b> · ${safeText(c.user_name||c.created_by||c.author||'')}: ${safeText(c.comment_text||c.comment||'')}</div>`).join('') || '<div class="history">No recorded comments for this version</div>'
    const parcelHTML=currentParcel?`<div class="history"><b>${safeText(currentParcel.parcel_number||currentParcel.parcel_no||'—')}</b> · ${safeText(currentParcel.status||'—')} · ${safeText(currentParcel.courier||currentParcel.courier_name||'—')} · ${safeText(currentParcel.tracking_number||'—')} · Dispatched ${dayString(currentParcel.dispatch_date||currentParcel.dispatched_at)||'—'}</div>`:'<div class="history">No linked parcel record</div>'
    let image=row.order?.style_image_url || row.order?.style_image_base64 || row.order?.image_url || row.order?.picture_url || row.meta?.image_url || ''
    if(!image && row.order?.style_number){
      const {data:variants,error:imageError}=await supabase.from('orders').select('style_image_url,style_image_base64').eq('style_number',row.order.style_number).limit(100)
      if(imageError)console.warn('Sample program image lookup:',imageError.message)
      const match=variants?.find(v=>v.style_image_url||v.style_image_base64)
      image=match?.style_image_url||match?.style_image_base64||''
    }
    const picture=image?`<img class="picture" src="${safeText(image)}" alt="Style image"/>`:'<div class="picture-empty">No image</div>'
    // The production-floor heading uses the saved type and version, not a fixed label.
    const rawType=String(row.sample_type||'').trim()
    const typeLabel=rawType ? (/sample$/i.test(rawType)?rawType:`${rawType} Sample`) : 'Sample'
    const versionLabel=String(row.version||row.version_label||`V${row.version_no||1}`)
    const floorNumber=String(row.sample_number||'').replace(/^SAM-/i,'')
    let printedBy='User not available'
    try {
      const {data:{user}={}}=await supabase.auth.getUser()
      printedBy=user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email||printedBy
    } catch(e) { console.warn('Could not resolve print user',e) }
    const html=`<div class="program">
      <div class="program-head"><div><div class="company">Sampling Program</div><div class="sample-kind">${safeText(typeLabel)} - ${safeText(versionLabel)}</div></div><div class="sam">SAM # ${safeText(floorNumber)}</div></div>
      <div class="info"><div class="fields"><div><b>Job Number</b><span>${safeText(row.order.job_number||'—')}</span></div><div><b>Date Created</b><span>${dayString(row.created_at)||'—'}</span></div><div><b>Buyer</b><span>${safeText(row.order.buyer_name||row.buyer.name||'—')}</span></div><div><b>Merchandiser</b><span>${safeText(row.order.merchandiser_name||'—')}</span></div><div><b>Description</b><span>${safeText(row.order.description||'—')}</span></div><div><b>Size Group</b><span>${safeText(row.size_group_name||'—')}</span></div><div><b>Wash / Colour</b><span>${safeText(washColour(row))}</span></div><div><b>Factory Ref</b><span>${safeText(row.order.factory_ref||'—')}</span></div></div><div class="picture-box">${picture}</div></div>
      <div class="specs"><div><b>Style Number</b><strong>${safeText(row.order.style_number||'—')}</strong></div><div><b>Spec Chart to Use</b><strong>${safeText(spec)}</strong></div><div><b>Sample Size</b><strong>${safeText(sampleSize(row))}</strong></div><div><b>Sample Qty</b><strong>${qty} pcs</strong></div></div>
      <div class="timeline">${milestones.map(([label,date])=>`<div><b>${label}</b><strong>${date||'—'}</strong></div>`).join('')}</div>
      ${timelineConflict?'<div class="warning">Check schedule: sample due date precedes its start date.</div>':''}
      <h2>Style BOM Details</h2><table class="bom"><thead><tr><th>Type</th><th>Item</th><th>Detail</th><th>Consumption / pc</th><th>Required</th></tr></thead><tbody>${bomRows}</tbody></table>
      <h2>Previous Versions of This Sample</h2>${histories}
      <footer>Printed on: ${dayString(new Date().toISOString().slice(0,10))} | User: ${safeText(printedBy)}</footer>
    </div>`
    return html
  }

export function printSamplingHTML(html,title,existingWindow=null){const w=existingWindow||window.open('','_blank','width=1000,height=800');if(!w){alert('Please allow popups to print this document.');return}
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;color:#111;padding:18px}
    h1,h2,h3{margin:0}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}
    .muted{color:#666;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #222;padding:6px 7px;font-size:12px;vertical-align:top}
    th{background:#f3f4f6;text-align:left}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .box{border:1px solid #222;padding:10px}
    .section{margin-top:14px}
    .grid td,.grid th{text-align:center}
    .small{font-size:11px}
    .page-break{page-break-before:always}
    .program{font-size:11px;max-width:190mm;margin:auto}
    .program-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding:4px 0 7px;break-inside:avoid}
    .company{font-size:12px;font-weight:800;letter-spacing:.4px}.program h1{font-size:19px;margin-top:3px}.program .sample-kind{font-size:17px;font-weight:800;margin-top:4px}.sam{font-size:21px;font-weight:800;white-space:nowrap}
    .info{display:grid;grid-template-columns:1fr 110px;gap:12px;margin-top:12px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}
    .fields>div{display:grid;grid-template-columns:100px 1fr;gap:5px;border-bottom:1px solid #ddd;padding-bottom:4px}.fields b{font-size:10px}.fields span{font-size:11px}
    .picture-box{border:1px solid #111;min-height:112px;display:flex;align-items:center;justify-content:center}.picture{max-width:100%;max-height:112px;object-fit:contain;filter:grayscale(1)}.picture-empty{font-size:10px}
    .timeline{display:grid;grid-template-columns:repeat(4,1fr);margin:10px 0 11px;position:relative;gap:5px;break-inside:avoid}
    .timeline>div{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;position:relative;padding:3px 2px}
    .timeline>div:before{content:"";height:7px;width:7px;background:#111;border-radius:50%;display:block;margin-bottom:3px}
    .timeline:before{content:"";position:absolute;top:6px;left:12%;right:12%;border-top:1px solid #555}
    .timeline b{font-size:9px;font-weight:600}.timeline strong{font-size:11px}
    .specs{display:grid;grid-template-columns:repeat(4,1fr);border:2px solid #111;margin-top:12px;break-inside:avoid}
    .specs>div{display:flex;flex-direction:column;align-items:center;text-align:center;padding:11px 4px;gap:6px;border-right:1px solid #111}
    .specs>div:last-child{border-right:0}.specs b{font-size:10px}.specs strong{font-size:14px;font-weight:800}
    .bom th:nth-child(1){width:16%}.bom th:nth-child(2){width:22%}.bom th:nth-child(3){width:34%}.bom th:nth-child(4){width:14%}.bom th:nth-child(5){width:14%}
    .program h2{font-size:13px;text-align:center;margin:12px 0 5px}.bom{margin-top:0}.bom th,.bom td{padding:5px 6px;font-size:10px;background:#fff}.bom .important{font-weight:800}.bom .last-essential td{border-bottom:2px solid #111}.history{border-bottom:1px solid #888;padding:7px 2px;break-inside:avoid}.history p{margin:4px 0}.program footer{border-top:1px solid #111;text-align:right;margin-top:16px;padding-top:6px;font-size:10px}.warning{border:1px solid #111;padding:5px;margin-top:6px;font-weight:700}
    .bom thead{display:table-header-group}.bom tr{break-inside:avoid;page-break-inside:avoid}
    /* A4 print box: 297mm high minus 6mm top and bottom margins.
       Use document flow rather than position:fixed, which Chrome was
       treating as an additional fragment and pushing to page two. */
    @page{size:A4 portrait;margin:6mm 7mm 6mm 7mm}
    @media print {
      html,body{margin:0!important;padding:0!important}
      .program{max-width:none;min-height:280mm;box-sizing:border-box;display:flex;flex-direction:column}
      .program footer{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;flex-shrink:0;margin-top:auto!important;padding-top:2mm;background:#fff;border-top:1px solid #111;font-size:10px}
      .bom tr,.history{break-inside:avoid;page-break-inside:avoid}
    }

  </style></head><body>${html}</body></html>`)
w.document.close();w.focus();setTimeout(()=>w.print(),450)}
