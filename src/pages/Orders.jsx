// FINAL Orders.jsx (Demand-based IOS FIX)

export function buildIOSHTML(d, selectedQ) {
  const esc = (v) => String(v ?? '—')

  const td = 'border:1px solid #000;padding:4px;font-size:9px;'
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

  const getRequiredFromDemand = (item) => {
    const qb = item.queue_breakdown || []
    const qRef = selectedQ?.q_number
    const match = qb.find(q => q.q_number === qRef)
    return match ? match.req_qty : 0
  }

  const fabricRows = (d.fabricItems || []).map(r => {
    const cons = r.base_qty || 0
    const req  = getRequiredFromDemand(r)

    return `
      <tr>
        <td style="${td}">${esc(r.name)}</td>
        <td style="${td}">${esc(r.shade)}</td>
        <td style="${tdC}">${cons} ${shortUOM(r.unit)}</td>
        <td style="${tdR}">${req ? Math.ceil(req).toLocaleString() + ' ' + shortUOM(r.unit) : '—'}</td>
      </tr>
    `
  }).join('')

  const trimRows = (d.trimItems || []).map(r => {
    const cons = r.base_qty || 0
    const req  = getRequiredFromDemand(r)

    return `
      <tr>
        <td style="${td}">${esc(r.name)}</td>
        <td style="${td}">${esc(r.shade)}</td>
        <td style="${tdC}">${cons} ${shortUOM(r.unit)}</td>
        <td style="${tdR}">${req ? Math.ceil(req).toLocaleString() + ' ' + shortUOM(r.unit) : '—'}</td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family:Arial;padding:10px">
      <h2>Internal Order Sheet</h2>

      <h3>Materials</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <th style="${th}">Item</th>
          <th style="${th}">Shade</th>
          <th style="${th}">Consump</th>
          <th style="${th}">Required</th>
        </tr>
        ${fabricRows}
      </table>

      <h3 style="margin-top:10px">Trims</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <th style="${th}">Item</th>
          <th style="${th}">Shade</th>
          <th style="${th}">Consump</th>
          <th style="${th}">Required</th>
        </tr>
        ${trimRows}
      </table>
    </div>
  `
}
