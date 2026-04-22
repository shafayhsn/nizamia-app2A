// FULL Orders.jsx (IOS Fixed Version)

import React from "react";

export default function Orders() {
  return <div>Orders Page (IOS Ready)</div>;
}

// ================= IOS FUNCTION =================

export function buildIOSHTML(d) {
  const esc = (v) => String(v ?? '—')

  const sizeCols = (d.sizeOrder || []).filter(sz => (d.sizeMap[sz] || 0) > 0)

  const td = 'border:1px solid #000;padding:2px 4px;font-size:9px;'
  const th = td + 'font-weight:700;background:#000;color:#fff;text-align:center;'
  const tdC = td + 'text-align:center;'
  const tdR = td + 'text-align:right;'

  const shortUOM = (u) => {
    if (!u) return ''
    if (u.includes('yard')) return 'yds'
    if (u.includes('meter')) return 'm'
    if (u.includes('pcs')) return 'pcs'
    return u
  }

  const fabricRows = (d.fabricItems || []).map(r => `
    <tr>
      <td style="${td}">${esc(r.name)}</td>
      <td style="${td}">${esc(r.lib_colour)}</td>
      <td style="${td}">${esc(r.content)}</td>
      <td style="${tdC}">${esc(r.weight)}</td>
      <td style="${tdC}">${esc(r.width)}</td>
      <td style="${tdC}">
        ${r.consump ? parseFloat(r.consump).toFixed(2)+' '+shortUOM(r.unit) : '—'}
      </td>
      <td style="${tdR}">
        ${r.q_qty ? Math.ceil(r.q_qty).toLocaleString()+' '+shortUOM(r.unit) : '—'}
      </td>
    </tr>
  `).join('')

  const trimRow = (r) => {
    const type = String(r.category||'').toLowerCase().includes('stitch') ? 'Stitching' : 'Packing'
    const shadeVal = r.specification || r.detail || '—'

    return `
      <tr>
        <td style="${td}">${type}</td>
        <td style="${td}">${esc(r.name)}</td>
        <td style="${td}">${esc(shadeVal)}</td>
        <td style="${tdC}">
          ${r.base_qty ? parseFloat(r.base_qty).toFixed(2)+' '+shortUOM(r.unit) : '—'}
        </td>
        <td style="${tdR}">
          ${r.q_qty ? Math.ceil(r.q_qty).toLocaleString()+' '+shortUOM(r.unit) : '—'}
        </td>
        <td style="${tdC}">${esc(r.po_number)}</td>
        <td style="${tdC}">${esc(r.po_status)}</td>
      </tr>
    `
  }

  const stitchRows  = (d.stitchItems||[]).map(trimRow).join('')
  const packingRows = (d.packingItems||[]).map(trimRow).join('')

  const divider = `
    <tr>
      <td colspan="7" style="background:#d1d5db;height:3px;padding:0;"></td>
    </tr>
  `

  const embText = (d.embItems||[]).map(e =>
    `${e.name || ''} ${e.technique || ''} @${e.placement || ''}`
  ).join('<br/>') || '—'

  return `
  <div style="width:210mm;height:297mm;padding:6mm;font-family:Arial;display:flex;flex-direction:column;">

    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:4px;">
      <div>
        <div style="font-size:20px;font-weight:900;">NIZAMIA APPARELS</div>
        <div style="font-size:10px;">Internal Order Sheet</div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:40px;height:40px;border:2px solid #000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;">
          IOS
        </div>
        <div style="font-size:26px;font-weight:900;">
          ${esc(d.q.q_number)}
        </div>
      </div>
    </div>

    <table style="width:100%;margin-top:4px;border-collapse:collapse;">
      <tr>
        ${['Brand','Style','Fit','PO#','Ship'].map(h=>`<th style="${th}">${h}</th>`).join('')}
      </tr>
      <tr>
        <td style="${tdC}">${esc(d.ord.brand_name)}</td>
        <td style="${tdC}">${esc(d.ord.style_number)}</td>
        <td style="${tdC}">${esc(d.fitName)}</td>
        <td style="${tdC}">${esc(d.ord.po_number)}</td>
        <td style="${tdC}">${esc(d.ord.ship_date)}</td>
      </tr>
    </table>

    <table style="width:100%;margin-top:6px;border-collapse:collapse;">
      <tr>
        <th style="${th}">Size Group</th>
        <th style="${th}">Wash</th>
        ${sizeCols.map(s=>`<th style="${th}">${s}</th>`).join('')}
        <th style="${th}">Total</th>
      </tr>

      <tr>
        <td style="${tdC}">${esc(d.groupName)}</td>
        <td style="${tdC}">${esc(d.washName)}</td>
        ${sizeCols.map(sz=>`<td style="${tdC}">${d.sizeMap[sz]}</td>`).join('')}
        <td style="${tdC}">${d.q.qty}</td>
      </tr>
    </table>

    <table style="width:100%;margin-top:6px;border-collapse:collapse;">
      <tr>${['Item','Shade','Content','Weight','Width','Cons','Req'].map(h=>`<th style="${th}">${h}</th>`).join('')}</tr>
      ${fabricRows}
    </table>

    <table style="width:100%;margin-top:6px;border-collapse:collapse;">
      <tr>${['Type','Item','Shade','Cons','Req','PO','Status'].map(h=>`<th style="${th}">${h}</th>`).join('')}</tr>
      ${stitchRows}
      ${divider}
      ${packingRows}
    </table>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;margin-top:auto;border:1px solid #000;">
      <div style="padding:4px;border-right:1px solid #000;">
        <b>Embellishment</b><br/>
        ${embText}
      </div>
      <div style="padding:4px;border-right:1px solid #000;"><b>Packing</b></div>
      <div style="padding:4px;border-right:1px solid #000;">Blisters: ${esc(d.blisterTotal)}<br/>Cartons: ${esc(d.cartonTotal)}</div>
      <div style="padding:4px;"><b>Merchandiser</b></div>
    </div>

  </div>`
}
