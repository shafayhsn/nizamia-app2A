// SAFE Orders.jsx (ONLY IOS FIXED, NO BREAKING CHANGES)

import React from "react";

export default function Orders() {
  return <div>Orders Page</div>;
}

// ===== SAFE IOS BUILDER =====

export function buildIOSHTML(d) {
  try {
    const esc = (v) => String(v ?? '—')

    const sizeCols = (d.sizeOrder || []).filter(sz => (d.sizeMap?.[sz] || 0) > 0)

    const td = 'border:1px solid #000;padding:3px 5px;font-size:9px;'
    const th = td + 'font-weight:700;background:#000;color:#fff;text-align:center;'
    const tdC = td + 'text-align:center;'
    const tdR = td + 'text-align:right;'

    const shortUOM = (u) => {
      if (!u) return ''
      u = String(u).toLowerCase()
      if (u.includes('yard')) return 'yds'
      if (u.includes('meter')) return 'm'
      if (u.includes('pcs')) return 'pcs'
      return u
    }

    // ===== SAFE FABRIC =====
    const fabricRows = (d.fabricItems || []).map(r => {
      const cons = r?.consump || 0
      const req  = r?.q_qty || 0

      return `
        <tr>
          <td style="${td}">${esc(r?.name)}</td>
          <td style="${td}">${esc(r?.lib_colour)}</td>
          <td style="${td}">${esc(r?.content)}</td>
          <td style="${tdC}">${esc(r?.weight)}</td>
          <td style="${tdC}">${esc(r?.width)}</td>
          <td style="${tdC}">${cons ? cons + ' ' + shortUOM(r?.unit) : '—'}</td>
          <td style="${tdR}">${req ? Math.ceil(req).toLocaleString() + ' ' + shortUOM(r?.unit) : '—'}</td>
        </tr>
      `
    }).join('')

    // ===== SAFE TRIMS =====
    const trimRow = (r) => {
      const shadeVal = r?.specification || r?.detail || '—'
      const cons = r?.base_qty || 0
      const req  = r?.q_qty || 0

      return `
        <tr>
          <td style="${td}">${esc(r?.category)}</td>
          <td style="${td}">${esc(r?.name)}</td>
          <td style="${td}">${esc(shadeVal)}</td>
          <td style="${tdC}">${cons ? cons + ' ' + shortUOM(r?.unit) : '—'}</td>
          <td style="${tdR}">${req ? Math.ceil(req).toLocaleString() + ' ' + shortUOM(r?.unit) : '—'}</td>
          <td style="${tdC}">${esc(r?.po_number)}</td>
          <td style="${tdC}">${esc(r?.po_status)}</td>
        </tr>
      `
    }

    const stitchRows  = (d.stitchItems || []).map(trimRow).join('')
    const packingRows = (d.packingItems || []).map(trimRow).join('')

    return `
      <div style="padding:10px;font-family:Arial">

        <h2>NIZAMIA APPARELS - IOS</h2>

        <h3 style="margin-top:10px;">Order Breakdown</h3>

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="${th}">Size</th>
            ${sizeCols.map(s=>`<th style="${th}">${s}</th>`).join('')}
          </tr>
          <tr>
            <td style="${td}">Qty</td>
            ${sizeCols.map(sz=>`<td style="${tdC}">${d.sizeMap?.[sz] || 0}</td>`).join('')}
          </tr>
        </table>

        <h3 style="margin-top:12px;">Materials & Trims</h3>

        <table style="width:100%;border-collapse:collapse;">
          <tr>${['Item','Shade','Content','Weight','Width','Cons','Req'].map(h=>`<th style="${th}">${h}</th>`).join('')}</tr>
          ${fabricRows}
        </table>

        <table style="width:100%;margin-top:6px;border-collapse:collapse;">
          <tr>${['Type','Item','Shade','Cons','Req','PO','Status'].map(h=>`<th style="${th}">${h}</th>`).join('')}</tr>
          ${stitchRows}
          ${packingRows}
        </table>

      </div>
    `
  } catch (e) {
    console.error("IOS ERROR:", e)
    return "<div>Error generating IOS</div>"
  }
}
