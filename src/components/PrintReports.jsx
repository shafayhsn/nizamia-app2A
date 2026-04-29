import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { X, Printer, FileText, ChevronRight } from 'lucide-react'

// ── Logo (base64 embedded, no network dep) ────────────────────────────────────
const LOGO_SRC = 'data:image/png;base64,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'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtNum(n, dec = 0) {
  if (n == null || n === '') return '—'
  return parseFloat(n).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtUSD(v) {
  if (!v) return '—'
  const n = parseFloat(v)
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + (n / 1000).toFixed(0) + 'k'
  return '$' + n.toFixed(0)
}
const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

const PO_TERMS_KEY = 'nizamia_po_terms_conditions'

const COMPANY_INFO_KEY = 'nizamia_company_info'
const DEFAULT_COMPANY_INFO = {
  name: 'NIZAMIA APPARELS',
  tagline: 'Manufacturer & Exporter of Knitted and Woven Garments',
  address: 'RCC14, SHED NR 2, ESTATE AVENUE ROAD, SITE INDUSTRIAL AREA,\nKARACHI 75700, PAKISTAN',
  website: 'www.nizamia.com'
}
const DEFAULT_PO_TERMS = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat. Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan et iusto odio dignissim qui tem vel eum iriure dolor in hendrerit.'
const NOTES_META_RE = /\n?\[PO_META:(\{.*?\})\]\s*$/i

function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]))
}
function getPOTerms() {
  return localStorage.getItem(PO_TERMS_KEY) || DEFAULT_PO_TERMS
}

function getCompanyInfo() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPANY_INFO_KEY) || '{}')
    return { ...DEFAULT_COMPANY_INFO, ...saved }
  } catch {
    return DEFAULT_COMPANY_INFO
  }
}
function companyAddressLine(company) {
  const address = String(company.address || '').split(/\r?\n/).map(line => escapeHTML(line)).join('<br/>')
  const website = company.website ? ` | ${escapeHTML(company.website)}` : ''
  return `${address}${website}`
}
function getPOVersion(notes) {
  const raw = String(notes || '')
  const m = raw.match(NOTES_META_RE)
  if (!m) return 1
  try { return Math.max(1, parseInt(JSON.parse(m[1]).version, 10) || 1) } catch { return 1 }
}
function bumpPrintCount(poNumber) {
  const key = `nizamia_po_print_count_${poNumber || 'unknown'}`
  const next = (parseInt(localStorage.getItem(key), 10) || 0) + 1
  localStorage.setItem(key, String(next))
  return next
}
function amountInWords(num, currency = 'PKR') {
  const n = Math.round(parseFloat(num) || 0)
  if (!n) return `Zero ${currency} only.`
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  const belowHundred = x => x < 20 ? ones[x] : `${tens[Math.floor(x/10)]}${x%10 ? ' ' + ones[x%10] : ''}`
  const belowThousand = x => `${x >= 100 ? ones[Math.floor(x/100)] + ' hundred' + (x%100 ? ' ' : '') : ''}${x%100 ? belowHundred(x%100) : ''}`
  const parts = []
  let rem = n
  ;[['crore',10000000], ['lakh',100000], ['thousand',1000]].forEach(([label, value]) => {
    const q = Math.floor(rem / value)
    if (q) { parts.push(`${belowThousand(q)} ${label}`); rem %= value }
  })
  if (rem) parts.push(belowThousand(rem))
  return `${parts.join(' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase())} ${currency} only.`
}


// ── Shared CSS injected into print window ────────────────────────────────────
const PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; font-size: 12px; color: #0d0d0d; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 0; }
  .page { width: 210mm; height: 297mm; padding: 14mm 16mm 14mm 16mm; position: relative; page-break-after: always; overflow: hidden; display: flex; flex-direction: column; }
  .page:last-child { page-break-after: avoid; }
  body { margin: 0; padding: 0; }
  @media print { body, html { margin: 0; padding: 0; } }

  /* Header */
  .doc-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 10px; border-bottom: 2px solid #0d0d0d; margin-bottom: 16px; }
  .doc-header-left { display: flex; align-items: center; gap: 10px; }
  .doc-header-left img { width: 36px; height: 36px; object-fit: contain; }
  .doc-header-left .brand { }
  .doc-header-left .brand-name { font-size: 15px; font-weight: 800; letter-spacing: -0.3px; line-height: 1; }
  .doc-header-left .brand-sub { font-size: 8px; font-weight: 600; color: #6b7280; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .doc-header-right { text-align: right; }
  .doc-header-right .doc-type { font-size: 8px; font-weight: 700; color: #9ca3af; letter-spacing: 2px; text-transform: uppercase; }
  .doc-header-right .doc-title { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
  .doc-header-right .doc-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }

  /* KPI bar */
  .kpi-bar { display: grid; gap: 1px; background: #e5e7eb; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-bottom: 20px; }
  .kpi-cell { background: #fff; padding: 10px 14px; }
  .kpi-label { font-size: 8px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
  .kpi-value { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; }
  .kpi-sub { font-size: 10px; color: #6b7280; margin-top: 2px; }

  /* Info grid (order details box) */
  .info-grid { display: grid; gap: 1px; background: #e5e7eb; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-bottom: 20px; }
  .info-cell { background: #fff; padding: 8px 12px; }
  .info-label { font-size: 8px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 3px; }
  .info-value { font-size: 12px; font-weight: 700; }

  /* Section header */
  .section-title { font-size: 15px; font-weight: 800; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  thead tr { background: #f9fafb; }
  th { font-size: 8px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; padding: 7px 10px; text-align: left; border-bottom: 1.5px solid #e5e7eb; white-space: nowrap; }
  td { font-size: 11px; padding: 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .total-row td { font-weight: 700; border-top: 1.5px solid #e5e7eb; border-bottom: none; }
  .mono { font-family: 'Courier New', monospace; }
  .bold { font-weight: 700; }
  .muted { color: #9ca3af; font-style: italic; }
  .right { text-align: right; }
  .center { text-align: center; }

  /* Status badges */
  .badge { display: inline-block; font-size: 8px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
  .badge-red { background: #fef2f2; color: #dc2626; }
  .badge-amber { background: #fff7ed; color: #d97706; }
  .badge-green { background: #f0fdf4; color: #16a34a; }
  .badge-blue { background: #eff6ff; color: #2563eb; }
  .badge-grey { background: #f3f4f6; color: #6b7280; }

  /* Footer */
  .doc-footer { position: absolute; bottom: 10mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  .doc-footer span { font-size: 8px; color: #9ca3af; }

  /* Signature line */
  .sig-block { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 20px; padding-top: 14px; border-top: 1px solid #e5e7eb; }
  .sig-label { font-size: 8px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 14px; }
  .sig-line { border-bottom: 1px solid #0d0d0d; margin-bottom: 4px; height: 1px; }
  .sig-name { font-size: 10px; color: #374151; }

  /* Notes box */
  .notes-box { border: 1px solid #e5e7eb; border-radius: 5px; padding: 10px 12px; min-height: 48px; margin-bottom: 18px; }
  .notes-label { font-size: 8px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }

  /* Tolerance notice */
  .notice { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 5px; padding: 8px 12px; margin-bottom: 14px; font-size: 10px; }
  .notice-label { font-size: 8px; font-weight: 700; color: #d97706; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3px; }

  /* Two-col layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 14px; }
  .sub-section-title { font-size: 9px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #f0f0ee; }
  .sub-row { display: flex; justify-content: space-between; font-size: 10px; padding: 3px 0; border-bottom: 1px solid #f9fafb; }
  .sub-row:last-child { border-bottom: none; }
  .sub-key { color: #6b7280; }
  .sub-val { font-weight: 600; }

  /* Artwork thumbnails */
  .artwork-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
  .artwork-card { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
  .artwork-thumb { height: 90px; background: #f9fafb; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #e5e7eb; }
  .artwork-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .artwork-thumb-placeholder { color: #d1d5db; font-size: 22px; }
  .artwork-info { padding: 8px; }
  .artwork-name { font-size: 11px; font-weight: 700; margin-bottom: 2px; }
  .artwork-desc { font-size: 9px; color: #6b7280; line-height: 1.4; }
  .artwork-status { font-size: 8px; font-weight: 700; margin-top: 4px; }

  /* Process checkboxes */
  .process-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-bottom: 14px; }
  .process-item { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  .process-item:nth-child(3n) { border-right: none; }
  .process-cb { width: 13px; height: 13px; border: 1.5px solid #d1d5db; border-radius: 2px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .process-cb.checked { background: #0d0d0d; border-color: #0d0d0d; }
  .process-cb.checked::after { content: ''; display: block; width: 7px; height: 5px; border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(-45deg) translateY(-1px); }

  /* Sample card specific */
  .sample-page { width: 210mm; min-height: 297mm; padding: 0; position: relative; page-break-after: always; }
  .sample-card { width: 100%; height: 148mm; padding: 8mm 8mm 8mm 14mm; position: relative; overflow: hidden; display: flex; flex-direction: column; }
  .sample-card-inner { display: flex; gap: 6mm; flex: 1; }
  .sample-main { flex: 1; display: flex; flex-direction: column; gap: 0; }
  .sample-right { width: 34mm; flex-shrink: 0; display: flex; flex-direction: column; gap: 4mm; }
  .sample-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3mm; padding-bottom: 2mm; border-bottom: 1px solid #e5e7eb; }
  .sample-logo { display: flex; align-items: center; gap: 5px; }
  .sample-logo img { width: 22px; height: 22px; object-fit: contain; }
  .sample-logo-text .brand { font-size: 12px; font-weight: 800; letter-spacing: -0.3px; }
  .sample-logo-text .sub { font-size: 6px; font-weight: 600; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; }
  .sample-card-title { text-align: center; }
  .sample-card-title .title { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
  .sample-card-title .subtitle { font-size: 7px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; }
  .sample-num-block { text-align: right; }
  .sample-copy-label { font-size: 7px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; }
  .sample-num { font-size: 14px; font-weight: 800; font-family: 'Courier New', monospace; letter-spacing: -0.5px; }
  .sample-grid { display: grid; grid-template-columns: 80px 1fr; gap: 0; border: 1px solid #e5e7eb; margin-bottom: 2mm; flex: 1; }
  .sample-row { display: contents; }
  .sample-cell-label { font-size: 7px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; padding: 3px 5px; border-bottom: 1px solid #f0f0ee; border-right: 1px solid #f0f0ee; background: #fafaf8; display: flex; align-items: center; }
  .sample-cell-value { font-size: 10px; font-weight: 600; padding: 3px 7px; border-bottom: 1px solid #f0f0ee; display: flex; align-items: center; }
  .sample-cell-value.large { font-size: 12px; font-weight: 800; }
  .sample-sizes { display: flex; gap: 3px; flex-wrap: wrap; }
  .sample-size-box { border: 1px solid #0d0d0d; padding: 1px 6px; font-size: 9px; font-weight: 700; border-radius: 2px; }
  .bom-items { font-size: 8px; color: #374151; line-height: 1.6; column-count: 2; column-gap: 8px; padding: 3px 5px; border-bottom: 1px solid #f0f0ee; }
  .bom-item { break-inside: avoid; }
  .bom-item::before { content: '▸ '; color: #9ca3af; }
  .sample-right-section { border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; }
  .sample-right-label { font-size: 6px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; padding: 3px 5px; border-bottom: 1px solid #f0f0ee; background: #fafaf8; }
  .sample-wash-area { height: 30mm; display: flex; align-items: center; justify-content: center; background: #f9fafb; }
  .sample-wash-area img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .sample-status-box { border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px; }
  .sample-status-label { font-size: 6px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 5px; }
  .sample-status-item { display: flex; align-items: center; gap: 5px; font-size: 9px; font-weight: 700; margin-bottom: 3px; }
  .sample-status-cb { width: 10px; height: 10px; border: 1.5px solid #d1d5db; border-radius: 1px; flex-shrink: 0; }
  .sample-hole { position: absolute; left: 5mm; top: 50%; transform: translateY(-50%); width: 6mm; height: 6mm; border: 1px dashed #d1d5db; border-radius: 50%; }
  .cut-line { width: 100%; border: none; border-top: 1.5px dashed #d1d5db; position: relative; display: flex; align-items: center; justify-content: center; margin: 0; }
  .cut-label { background: #fff; padding: 0 8px; font-size: 8px; color: #9ca3af; letter-spacing: 1px; text-transform: uppercase; display: flex; align-items: center; gap: 4px; }

  /* PO specific */
  .po-header-box { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e5e7eb; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-bottom: 20px; }
  .po-left { background: #fff; padding: 14px 16px; }
  .po-right { background: #fff; padding: 14px 16px; }
  .po-number { font-size: 22px; font-weight: 800; font-family: 'Courier New', monospace; letter-spacing: -0.5px; margin-bottom: 10px; }
  .po-meta-row { display: flex; gap: 20px; margin-bottom: 6px; }
  .po-meta-item .lbl { font-size: 8px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; }
  .po-meta-item .val { font-size: 11px; font-weight: 700; }
  .po-supplier-name { font-size: 14px; font-weight: 800; margin-bottom: 4px; }
  .po-supplier-addr { font-size: 10px; color: #374151; line-height: 1.5; }
  .po-divider { border: none; border-top: 1px solid #e5e7eb; margin: 10px 0; }
  .po-totals { margin-left: auto; width: 260px; margin-bottom: 14px; }
  .po-total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; border-bottom: 1px solid #f3f4f6; }
  .po-total-row.grand { font-weight: 800; font-size: 13px; border-top: 1.5px solid #0d0d0d; border-bottom: none; padding-top: 6px; margin-top: 4px; }
  .tc-box { border: 1px solid #e5e7eb; border-radius: 5px; padding: 10px 12px; margin-bottom: 16px; }
  .tc-label { font-size: 8px; font-weight: 700; color: #9ca3af; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
  .tc-text { font-size: 9px; color: #374151; line-height: 1.6; }

  /* Business overview */
  .overview-kpi { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: #e5e7eb; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-bottom: 20px; }
  .status-overdue { color: #dc2626; font-weight: 700; }
  .status-atrisk { color: #d97706; font-weight: 700; }
  .status-ontrack { color: #16a34a; font-weight: 600; }
`


const PRINT_SPEC_BREAKDOWN_RE = /\n?\[Break-down:\s*([\s\S]*)\]\s*$/i
const PRINT_NOTES_TAX_RE = /\n?\[PO_TAX:(\{.*?\})\]\s*$/i
function decodePrintSpec(spec) {
  const raw = String(spec || '')
  const m = raw.match(PRINT_SPEC_BREAKDOWN_RE)
  return { specification: raw.replace(PRINT_SPEC_BREAKDOWN_RE, '').trim(), breakdown: m ? m[1].trim() : '' }
}
function decodePrintTax(notes) {
  const raw = String(notes || '')
  const m = raw.match(PRINT_NOTES_TAX_RE)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}
function extractQReference(po, order) {
  const items = po.items || po.purchase_order_items || []
  const refs = new Set()
  items.forEach(it => {
    const dec = decodePrintSpec(it.specification)
    const txt = `${it.breakdown || dec.breakdown || ''} ${it.specification || ''}`
    ;(txt.match(/Q\d+/gi) || []).forEach(q => refs.add(q.toUpperCase()))
  })
  return Array.from(refs).join(', ') || order?.q_number || po.q_number || '—'
}

// ── Print helper: open new window, write HTML, trigger print ─────────────────

function createPrintFrame(message = 'Preparing document…') {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.setAttribute('aria-hidden', 'true')
  document.body.appendChild(frame)
  const w = frame.contentWindow
  if (!w) {
    frame.remove()
    return null
  }
  w.__printFrame = frame
  w.document.open()
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preparing print…</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#374151">${message}</body></html>`)
  w.document.close()
  return w
}

function cleanupPrintTarget(w) {
  try {
    const frame = w && w.__printFrame
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame)
  } catch (e) {}
}

export function openPrintWindow(message = 'Preparing document…') {
  return createPrintFrame(message)
}

export function printHTML(html, targetWindow = null) {
  const w = targetWindow || createPrintFrame('Preparing print…')
  if (!w) {
    window.alert('Could not prepare print preview.')
    return
  }
  w.document.open()
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`)
  w.document.close()
  const finalize = () => cleanupPrintTarget(w)
  try { w.onafterprint = finalize } catch (e) {}
  setTimeout(() => {
    try {
      w.focus()
      w.print()
    } catch (e) {
      cleanupPrintTarget(w)
    }
    setTimeout(finalize, 2000)
  }, 300)
}

// ── Page wrapper ─────────────────────────────────────────────────────────────
function pageWrap(content, footerLeft, footerRight, pageNum, totalPages) {
  return `
  <div class="page">
    ${content}
    <div class="doc-footer">
      <span>${footerLeft}</span>
      <span>${footerRight} &nbsp; ${pageNum} / ${totalPages}</span>
    </div>
  </div>`
}

// ── Doc header ───────────────────────────────────────────────────────────────
function docHeader(docType, docTitle, docSub) {
  return `
  <div class="doc-header">
    <div class="doc-header-left">
      <img src="${LOGO_SRC}" />
      <div class="brand">
        <div class="brand-name">Nizamia Apparels</div>
        <div class="brand-sub">Karachi · Pakistan</div>
      </div>
    </div>
    <div class="doc-header-right">
      <div class="doc-type">${docType}</div>
      <div class="doc-title">${docTitle}</div>
      <div class="doc-sub">${docSub}</div>
    </div>
  </div>`
}

// ── Order info bar ────────────────────────────────────────────────────────────
function orderInfoBar(o, extra = []) {
  const cells = [
    { label: 'Job No.', value: o.job_number || '—' },
    { label: 'Style', value: o.style_number || '—' },
    ...extra,
    { label: 'Total Qty', value: o.total_qty ? o.total_qty.toLocaleString() + ' pcs' : '—' },
    { label: 'Ex-Factory', value: fmtDate(o.ship_date) },
  ]
  const cols = cells.length
  return `
  <div class="info-grid" style="grid-template-columns: repeat(${cols}, 1fr); margin-bottom: 20px;">
    ${cells.map(c => `<div class="info-cell"><div class="info-label">${c.label}</div><div class="info-value">${c.value}</div></div>`).join('')}
  </div>`
}

// ── Status badge ──────────────────────────────────────────────────────────────
function statusBadge(status) {
  const map = { OVERDUE: 'red', 'AT RISK': 'amber', 'ON TRACK': 'green', Draft: 'amber', Confirmed: 'green', Cancelled: 'grey', Pending: 'amber', Approved: 'green', Rejected: 'red' }
  const cls = map[status] || 'grey'
  return `<span class="badge badge-${cls}">${status}</span>`
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 1: Business Overview
// ─────────────────────────────────────────────────────────────────────────────
export async function buildBusinessOverview() {
  const { data: orders } = await supabase.from('orders')
    .select('*').not('status', 'eq', 'Cancelled').order('ship_date', { ascending: true })

  if (!orders?.length) return '<p>No active orders.</p>'

  const now = new Date()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const weekEnd  = new Date(now); weekEnd.setDate(now.getDate() + 7)

  const totalQty   = orders.reduce((s, o) => s + (o.total_qty || 0), 0)
  const totalValue = orders.reduce((s, o) => s + (parseFloat(o.total_value_usd) || 0), 0)
  const overdue    = orders.filter(o => o.ship_date && new Date(o.ship_date) < now)
  const dueMonth   = orders.filter(o => o.ship_date && new Date(o.ship_date) <= monthEnd)
  const dueWeek    = orders.filter(o => o.ship_date && new Date(o.ship_date) <= weekEnd)

  // Buyer summary
  const buyerMap = {}
  orders.forEach(o => {
    if (!o.buyer_name) return
    if (!buyerMap[o.buyer_name]) buyerMap[o.buyer_name] = { orders: 0, qty: 0, value: 0, exFty: null, overdue: 0 }
    buyerMap[o.buyer_name].orders++
    buyerMap[o.buyer_name].qty   += o.total_qty || 0
    buyerMap[o.buyer_name].value += parseFloat(o.total_value_usd) || 0
    if (o.ship_date && new Date(o.ship_date) < now) buyerMap[o.buyer_name].overdue++
    if (o.ship_date && (!buyerMap[o.buyer_name].exFty || new Date(o.ship_date) < new Date(buyerMap[o.buyer_name].exFty))) {
      buyerMap[o.buyer_name].exFty = o.ship_date
    }
  })

  // Order status calc
  function orderStatus(o) {
    if (!o.ship_date) return 'ON TRACK'
    const d = new Date(o.ship_date)
    if (d < now) return 'OVERDUE'
    if (d <= weekEnd) return 'AT RISK'
    return 'ON TRACK'
  }

  const kpiHtml = `
  <div class="overview-kpi">
    <div class="kpi-cell"><div class="kpi-label">Active Orders</div><div class="kpi-value">${orders.length}</div><div class="kpi-sub">across ${[...new Set(orders.map(o=>o.job_number).filter(Boolean))].length} jobs</div></div>
    <div class="kpi-cell"><div class="kpi-label">Total Units</div><div class="kpi-value">${totalQty.toLocaleString()}</div><div class="kpi-sub">pcs in production</div></div>
    <div class="kpi-cell"><div class="kpi-label">Total Value</div><div class="kpi-value">${fmtUSD(totalValue)}</div><div class="kpi-sub">USD confirmed POs</div></div>
    <div class="kpi-cell"><div class="kpi-label">Shipments Due</div><div class="kpi-value">${dueMonth.length}</div><div class="kpi-sub">this month · ${dueWeek.length} this week</div></div>
  </div>`

  const ordersTableRows = orders.slice(0, 20).map(o => {
    const st = orderStatus(o)
    return `<tr>
      <td class="mono bold">${o.job_number || '—'}</td>
      <td><strong>${o.buyer_name || '—'}</strong><br><span style="color:#9ca3af;font-size:10px">${o.style_number} · ${o.description || ''}</span></td>
      <td class="right mono">${o.total_qty?.toLocaleString() || '—'}</td>
      <td class="right">${o.total_value_usd ? '$' + parseFloat(o.total_value_usd).toLocaleString(undefined,{maximumFractionDigits:0}) : '—'}</td>
      <td style="color:${st==='OVERDUE'?'#dc2626':st==='AT RISK'?'#d97706':'#374151'};font-weight:${st!=='ON TRACK'?700:400}">${fmtDate(o.ship_date)}${st==='OVERDUE'?' !':''}</td>
      <td>${o.ship_mode || 'Sea'}</td>
      <td>${statusBadge(st)}</td>
    </tr>`
  }).join('')

  const buyerRows = Object.entries(buyerMap).sort((a,b) => b[1].value - a[1].value).map(([name, d]) => `
    <tr>
      <td class="bold">${name}</td>
      <td class="right">${d.orders}</td>
      <td class="right mono">${d.qty.toLocaleString()}</td>
      <td class="right bold">$${d.value.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
      <td>${fmtDate(d.exFty)}</td>
      <td class="right" style="color:${d.overdue>0?'#dc2626':'#374151'};font-weight:${d.overdue>0?700:400}">${d.overdue || 0}</td>
    </tr>
  `).join('')

  const content = `
  ${docHeader('Executive Report', 'Business Overview', 'All Active Orders · Generated ' + today)}
  ${kpiHtml}
  <div class="section-title">Active Orders — Status Overview</div>
  <table>
    <thead><tr>
      <th>Job</th><th>Buyer · Style · Description</th><th class="right">Qty</th>
      <th class="right">Value USD</th><th>Ex-Factory</th><th>Ship Mode</th><th>Status</th>
    </tr></thead>
    <tbody>
      ${ordersTableRows}
      <tr class="total-row"><td colspan="2">TOTAL</td><td class="right mono">${totalQty.toLocaleString()}</td><td class="right">${fmtUSD(totalValue)}</td><td colspan="3" style="text-align:right;font-size:10px;color:#9ca3af">${Math.min(orders.length,20)} shown / ${orders.length}</td></tr>
    </tbody>
  </table>
  <div class="section-title">Summary by Buyer</div>
  <table>
    <thead><tr>
      <th>Buyer</th><th class="right">Active Orders</th><th class="right">Total Units</th>
      <th class="right">Total Value</th><th>Nearest Ex-Fty</th><th class="right">Overdue</th>
    </tr></thead>
    <tbody>
      ${buyerRows}
      <tr class="total-row">
        <td>TOTAL</td>
        <td class="right">${orders.length}</td>
        <td class="right mono">${totalQty.toLocaleString()}</td>
        <td class="right bold">$${totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
        <td></td>
        <td class="right" style="color:${overdue.length>0?'#dc2626':'inherit'}">${overdue.length}</td>
      </tr>
    </tbody>
  </table>`

  return pageWrap(content, 'Nizamia Apparels · Karachi, Pakistan — Confidential · For CEO use only · Generated ' + today, '', 1, 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 2: Order Summary
// ─────────────────────────────────────────────────────────────────────────────
async function buildOrderSummary(orders) {
  const pages = []
  for (const o of orders) {
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', o.id).order('sort_order')
    const sgIds = (sgs || []).map(g => g.id)
    const { data: colors } = sgIds.length ? await supabase.from('size_group_colors').select('*').in('size_group_id', sgIds).order('sort_order') : { data: [] }
    const { data: bd } = sgIds.length ? await supabase.from('size_group_breakdown').select('*').in('size_group_id', sgIds) : { data: [] }

    const unitPrice = o.total_qty && o.total_value_usd ? parseFloat(o.total_value_usd) / o.total_qty : null
    const pkrRate = 278.5
    const pkrVal = o.total_value_usd ? parseFloat(o.total_value_usd) * pkrRate : null

    const kpiHtml = `
    <div style="display:grid;grid-template-columns:80px 1fr;gap:1px;background:#e5e7eb;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px;">
      <div style="background:#f9fafb;display:flex;align-items:center;justify-content:center;padding:12px;">
        ${o.style_image_base64 ? `<img src="${o.style_image_base64}" style="max-width:64px;max-height:64px;object-fit:contain;border-radius:4px;" />` : '<div style="width:56px;height:56px;background:#e5e7eb;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:9px;text-align:center;">No Image</div>'}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e5e7eb;">
        <div class="kpi-cell"><div class="kpi-label">Total Units</div><div class="kpi-value">${o.total_qty?.toLocaleString() || '—'}</div><div class="kpi-sub">pcs · ${(colors||[]).filter((c,i,a)=>a.findIndex(x=>x.color_name===c.color_name)===i).length} colours</div></div>
        <div class="kpi-cell"><div class="kpi-label">Order Value</div><div class="kpi-value">${o.total_value_usd ? '$'+parseFloat(o.total_value_usd).toLocaleString(undefined,{maximumFractionDigits:0}) : '—'}</div><div class="kpi-sub">USD${unitPrice ? ' · $'+unitPrice.toFixed(2)+'/pc' : ''}</div></div>
        <div class="kpi-cell"><div class="kpi-label">PKR Equiv.</div><div class="kpi-value">${pkrVal ? (pkrVal/1000000).toFixed(2)+'M' : '—'}</div><div class="kpi-sub">@ ${pkrRate}</div></div>
        <div class="kpi-cell"><div class="kpi-label">Ship Mode</div><div class="kpi-value" style="font-size:16px">${o.ship_mode || 'Sea'}</div><div class="kpi-sub">${o.incoterms || 'FOB'} ${o.port_of_loading || 'Karachi'}</div></div>
      </div>
    </div>`

    const detailCells = [
      { label: 'Job No.', value: o.job_number || '—' }, { label: 'Buyer', value: o.buyer_name || '—' }, { label: 'PO Number', value: o.po_number || '—' },
      { label: 'Style Number', value: o.style_number || '—' }, { label: 'Description', value: o.description || '—' }, { label: 'Season', value: o.season || '—' },
      { label: 'Merchandiser', value: o.merchandiser_name || '—' }, { label: 'Factory Ref', value: o.factory_ref || '—' }, { label: 'Ex-Factory', value: fmtDate(o.ship_date) },
    ]
    const detailHtml = `
    <div class="section-title">Order Details</div>
    <div class="info-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
      ${detailCells.map(c=>`<div class="info-cell"><div class="info-label">${c.label}</div><div class="info-value">${c.value}</div></div>`).join('')}
    </div>`

    // PO breakdown table — one row per colour across all size groups
    const colourMap = {}
    ;(colors||[]).forEach(c => { if (!colourMap[c.color_name]) colourMap[c.color_name] = { colorId: c.id, groupId: c.size_group_id } })
    const allSizes = [...new Set((sgs||[]).flatMap(g => g.sizes || []))]

    let breakdownRows = ''
    let grandTotal = 0
    const colTotals = {}
    allSizes.forEach(sz => { colTotals[sz] = 0 })
    let totalQtyCol = 0, totalValueCol = 0

    Object.entries(colourMap).forEach(([colName]) => {
      const rowBd = (bd||[]).filter(b => (colors||[]).find(c => c.color_name === colName && c.id === b.color_id))
      const sizeQtys = {}
      allSizes.forEach(sz => {
        const q = rowBd.find(b => b.size === sz)?.qty || 0
        sizeQtys[sz] = q
        colTotals[sz] = (colTotals[sz] || 0) + q
      })
      const rowTotal = Object.values(sizeQtys).reduce((s,v)=>s+v,0)
      const rowValue = unitPrice ? rowTotal * unitPrice : null
      grandTotal += rowTotal
      totalQtyCol += rowTotal
      totalValueCol += rowValue || 0
      breakdownRows += `<tr>
        <td class="bold">${colName}</td>
        ${allSizes.map(sz=>`<td class="right mono">${sizeQtys[sz]||0}</td>`).join('')}
        <td class="right mono bold">${rowTotal.toLocaleString()}</td>
        ${unitPrice ? `<td class="right">$${unitPrice.toFixed(2)}</td><td class="right bold">$${(rowTotal*unitPrice).toLocaleString(undefined,{maximumFractionDigits:0})}</td>` : ''}
      </tr>`
    })

    breakdownRows += `<tr class="total-row">
      <td>TOTAL</td>
      ${allSizes.map(sz=>`<td class="right mono">${(colTotals[sz]||0).toLocaleString()}</td>`).join('')}
      <td class="right mono">${grandTotal.toLocaleString()}</td>
      ${unitPrice ? `<td></td><td class="right bold">$${totalValueCol.toLocaleString(undefined,{maximumFractionDigits:0})}</td>` : ''}
    </tr>`

    const breakdownHtml = `
    <div class="section-title">PO Breakdown</div>
    <table>
      <thead><tr>
        <th>Colour / Wash</th>
        ${allSizes.map(sz=>`<th class="right">${sz}</th>`).join('')}
        <th class="right">Total</th>
        ${unitPrice ? '<th class="right">Unit Price</th><th class="right">Value USD</th>' : ''}
      </tr></thead>
      <tbody>${breakdownRows}</tbody>
    </table>`

    const notesHtml = `
    <div class="notes-box"><div class="notes-label">Special Instructions / Buyer Comments</div><div style="font-size:10px;color:#374151;min-height:24px">${o.notes || ''}</div></div>
    <div class="sig-block">
      <div><div class="sig-label">Prepared By</div><div class="sig-line"></div><div class="sig-name">${o.merchandiser_name || '—'} · Merchandiser</div></div>
      <div><div class="sig-label">Approved By</div><div class="sig-line"></div></div>
      <div><div class="sig-label">Date</div><div class="sig-line"></div><div class="sig-name">${today}</div></div>
    </div>`

    pages.push(pageWrap(
      docHeader('Confirmed Order Document', 'Order Summary', `${o.job_number||'—'} · ${o.style_number||'—'} · ${today}`) + kpiHtml + detailHtml + breakdownHtml + notesHtml,
      'Nizamia Apparels · Karachi, Pakistan — Internal Document · ' + today,
      '',
      pages.length + 1, orders.length
    ))
  }
  return pages.join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 3: Fabric Plan
// ─────────────────────────────────────────────────────────────────────────────
async function buildFabricPlan(orders) {
  const pages = []
  for (const o of orders) {
    const { data: bom } = await supabase.from('bom_items').select('*').eq('order_id', o.id).eq('category', 'Fabric').order('sort_order')
    const { data: sgs } = await supabase.from('size_groups').select('*').eq('order_id', o.id).order('sort_order')
    const sgIds = (sgs||[]).map(g=>g.id)
    const { data: colors } = sgIds.length ? await supabase.from('size_group_colors').select('*').in('size_group_id', sgIds).order('sort_order') : { data: [] }
    const { data: bd } = sgIds.length ? await supabase.from('size_group_breakdown').select('*').in('size_group_id', sgIds) : { data: [] }
    const { data: pos } = await supabase.from('purchase_orders').select('*, purchase_order_items(*)').eq('order_id', o.id)

    const colourQtyMap = {}
    ;(colors||[]).forEach(c => { colourQtyMap[c.color_name] = (colourQtyMap[c.color_name]||0) + ((bd||[]).filter(b=>b.color_id===c.id).reduce((s,b)=>s+(b.qty||0),0)) })
    const uniqueColours = Object.entries(colourQtyMap)

    // Fabric requirements table
    function calcGrossQty(item) {
      const wastage = parseFloat(item.wastage)||0
      const rule = item.usage_rule || 'Generic'
      const ud = item.usage_data
      let net = 0
      if (rule === 'Generic') { net = (parseFloat(item.base_qty)||parseFloat(ud?.generic)||0) * (o.total_qty||0) }
      else if (rule === 'By Color' && ud) { net = Object.entries(ud).reduce((s,[n,c]) => s + (parseFloat(c)||0)*(colourQtyMap[n]||0), 0) }
      else if (rule === 'By Size Group' && ud) {
        const sgQtyMap = {}
        ;(sgs||[]).forEach(g => { sgQtyMap[g.group_name] = (bd||[]).filter(b=>b.size_group_id===g.id).reduce((s,b)=>s+(b.qty||0),0) })
        net = Object.entries(ud).reduce((s,[n,c]) => s + (parseFloat(c)||0)*(sgQtyMap[n]||0), 0)
      }
      const gross = net * (1 + wastage/100)
      return { net: net.toFixed(0), gross: gross.toFixed(0) }
    }

    const fabricRows = (bom||[]).map(item => {
      const { net, gross } = calcGrossQty(item)
      return `<tr>
        <td><div class="bold">${item.name}</div>${item.detail ? `<div style="font-size:9px;color:#6b7280">${item.detail}</div>` : ''}</td>
        <td>${item.detail || '—'}</td>
        <td class="right">${item.usage_rule||'Generic'}</td>
        <td class="right">${item.wastage||0}%</td>
        <td class="right mono">${fmtNum(net)}</td>
        <td class="right mono bold">${fmtNum(gross)}</td>
        <td>${item.unit||'yd'}</td>
      </tr>`
    }).join('')

    // Colour breakdown: for "By Color" fabrics show per-colour qty
    const byColorFabrics = (bom||[]).filter(i => i.usage_rule === 'By Color' && i.usage_data)
    let colBreakdownHtml = ''
    if (uniqueColours.length > 0) {
      const colHeaders = byColorFabrics.map(f => `<th class="right">${f.name.length > 12 ? f.name.slice(0,12)+'…' : f.name}</th>`).join('')
      const colRows = uniqueColours.map(([colName, qty]) => {
        const fabCols = byColorFabrics.map(f => {
          const cons = parseFloat(f.usage_data[colName])||0
          const gross = (cons * qty * (1 + (parseFloat(f.wastage)||0)/100)).toFixed(0)
          return `<td class="right mono">${fmtNum(gross)}</td>`
        }).join('')
        const rowTotal = byColorFabrics.reduce((s,f) => {
          const cons = parseFloat(f.usage_data?.[colName])||0
          return s + cons * qty * (1+(parseFloat(f.wastage)||0)/100)
        }, 0)
        return `<tr><td class="bold">${colName}</td><td class="right mono">${qty.toLocaleString()}</td>${fabCols}<td class="right mono bold">${fmtNum(rowTotal.toFixed(0))}</td></tr>`
      }).join('')
      const totalCols = byColorFabrics.map(f => {
        const t = uniqueColours.reduce((s,[n,q]) => s + (parseFloat(f.usage_data?.[n])||0)*q*(1+(parseFloat(f.wastage)||0)/100), 0)
        return `<td class="right mono bold">${fmtNum(t.toFixed(0))}</td>`
      }).join('')
      const grandT = byColorFabrics.reduce((s,f) => s + uniqueColours.reduce((ss,[n,q]) => ss + (parseFloat(f.usage_data?.[n])||0)*q*(1+(parseFloat(f.wastage)||0)/100), 0), 0)

      colBreakdownHtml = `
      <div class="section-title">Colour Breakdown</div>
      <table>
        <thead><tr><th>Colour</th><th class="right">Order Qty</th>${colHeaders}<th class="right">Total</th></tr></thead>
        <tbody>
          ${colRows}
          <tr class="total-row"><td>TOTAL</td><td class="right mono">${(o.total_qty||0).toLocaleString()}</td>${totalCols}<td class="right mono bold">${fmtNum(grandT.toFixed(0))}</td></tr>
        </tbody>
      </table>`
    }

    // Sourcing status from POs
    const poRows = (pos||[]).flatMap(po =>
      (po.purchase_order_items||[]).filter(li => {
        const n = (li.description||'').toLowerCase()
        return (bom||[]).some(b => n.includes((b.name||'').toLowerCase().slice(0,6)))
      }).map(li => `<tr>
        <td class="bold">${li.description}</td>
        <td>${(pos||[]).find(p=>p.id===po.id) ? '—' : '—'}</td>
        <td class="mono">${po.po_number||'—'}</td>
        <td>${fmtDate(po.po_date)}</td>
        <td>${fmtDate(po.delivery_date)}</td>
        <td>${po.status||'—'}</td>
      </tr>`)
    ).join('')

    const sourcingHtml = poRows ? `
    <div class="section-title">Sourcing Status</div>
    <table>
      <thead><tr><th>Fabric</th><th>Supplier</th><th>PO No.</th><th>PO Date</th><th>Expected Delivery</th><th>Status</th></tr></thead>
      <tbody>${poRows}</tbody>
    </table>` : ''

    const content = docHeader('Production Planning', 'Fabric Plan', `${o.job_number||'—'} · ${o.style_number||'—'} · ${today}`)
      + orderInfoBar(o, [{ label: 'Description', value: o.description || '—' }])
      + `<div class="section-title">Fabric Requirements</div>
         <table>
           <thead><tr><th>Fabric</th><th>Composition / Detail</th><th class="right">Usage Rule</th><th class="right">Wastage</th><th class="right">Net Qty</th><th class="right">Gross Req.</th><th>Unit</th></tr></thead>
           <tbody>${fabricRows || '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:20px">No fabric items in BOM.</td></tr>'}</tbody>
         </table>`
      + colBreakdownHtml
      + sourcingHtml

    pages.push(pageWrap(content, 'Nizamia Apparels · Karachi, Pakistan — Fabric Plan · Internal & Supplier Reference', '', pages.length+1, orders.length))
  }
  return pages.join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 4: Trims Plan
// ─────────────────────────────────────────────────────────────────────────────
async function buildTrimsPlan(orders) {
  const pages = []
  for (const o of orders) {
    const { data: stitching } = await supabase.from('bom_items').select('*').eq('order_id', o.id).eq('category', 'Stitching Trim').order('sort_order')
    const { data: packing }   = await supabase.from('bom_items').select('*').eq('order_id', o.id).eq('category', 'Packing Trim').order('sort_order')
    const { data: suppliers } = await supabase.from('suppliers').select('id,name')
    const { data: pos } = await supabase.from('purchase_orders').select('po_number,supplier_id').eq('order_id', o.id)

    function trimRow(item) {
      const wastage = parseFloat(item.wastage)||0
      const ud = item.usage_data
      const rule = item.usage_rule || 'Generic'
      let qty = 0
      if (rule === 'Generic') qty = (parseFloat(item.base_qty)||parseFloat(ud?.generic)||0) * (o.total_qty||0) * (1+wastage/100)
      else if (ud) qty = Object.values(ud).reduce((s,v)=>s+(parseFloat(v)||0),0) * (1+wastage/100)
      const supplier = suppliers?.find(s=>s.id===item.supplier_id)
      const po = pos?.find(p=>p.supplier_id===item.supplier_id)
      return `<tr>
        <td class="bold">${item.name}</td>
        <td style="font-size:10px;font-family:'Courier New',monospace">${item.detail||'—'}</td>
        <td>${rule}</td>
        <td class="right">${wastage}%</td>
        <td class="right mono bold">${qty > 0 ? fmtNum(qty.toFixed(0)) : '—'}</td>
        <td>${item.unit||'pc'}</td>
        <td style="font-size:10px">${supplier ? supplier.name : '<span class="muted">Unassigned</span>'}</td>
        <td class="mono" style="font-size:10px">${po?.po_number || '—'}</td>
      </tr>`
    }

    const stitchRows = (stitching||[]).map(trimRow).join('') || '<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:16px">No stitching trims.</td></tr>'
    const packRows   = (packing||[]).map(trimRow).join('')   || '<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:16px">No packing trims.</td></tr>'

    const content = docHeader('Production Planning', 'Trims Plan', `${o.job_number||'—'} · ${o.style_number||'—'} · ${today}`)
      + orderInfoBar(o, [{ label: 'Description', value: o.description || '—' }])
      + `<div class="section-title">Stitching Trims</div>
         <table>
           <thead><tr><th>Item</th><th>Specification</th><th>Usage Rule</th><th class="right">Wastage</th><th class="right">Req. Qty</th><th>Unit</th><th>Supplier</th><th>PO #</th></tr></thead>
           <tbody>${stitchRows}</tbody>
         </table>
         <div class="section-title">Packing Trims</div>
         <table>
           <thead><tr><th>Item</th><th>Specification</th><th>Usage Rule</th><th class="right">Wastage</th><th class="right">Req. Qty</th><th>Unit</th><th>Supplier</th><th>PO #</th></tr></thead>
           <tbody>${packRows}</tbody>
         </table>
         <div class="notes-box"><div class="notes-label">Notes</div></div>`

    pages.push(pageWrap(content, 'Nizamia Apparels · Karachi, Pakistan — Trims Plan · Internal & Supplier Reference', '', pages.length+1, orders.length))
  }
  return pages.join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 5: Embellishment Plan
// ─────────────────────────────────────────────────────────────────────────────
async function buildEmbellishmentPlan(orders) {
  const pages = []
  for (const o of orders) {
    const { data: embs } = await supabase.from('embellishments').select('*').eq('order_id', o.id)
    const { data: suppliers } = await supabase.from('suppliers').select('id,name')

    if (!embs?.length) {
      pages.push(pageWrap(
        docHeader('Production Planning', 'Embellishment Plan', `${o.job_number||'—'} · ${o.style_number||'—'} · ${today}`)
        + orderInfoBar(o, [{ label: 'Description', value: o.description || '—' }])
        + '<p style="color:#9ca3af;font-size:12px;padding:20px 0">No embellishments defined for this order.</p>',
        'Nizamia Apparels · Karachi, Pakistan — Embellishment Plan · Internal & Vendor Reference', '', pages.length+1, orders.length
      ))
      continue
    }

    const artworkCards = embs.map(e => `
    <div class="artwork-card">
      <div class="artwork-thumb">
        ${e.artwork_url ? `<img src="${e.artwork_url}" />` : '<div class="artwork-thumb-placeholder">⬡</div>'}
      </div>
      <div class="artwork-info">
        <div class="artwork-name">${e.description || '—'}</div>
        <div class="artwork-desc">
          ${e.technique||''} · ${e.placement||''}<br>
          ${e.colors_used||''}${e.applies_to?.length ? ' · ' + (Array.isArray(e.applies_to)?e.applies_to:JSON.parse(e.applies_to||'[]')).join(', ') : ''}
        </div>
        <div class="artwork-status" style="color:${e.approval_status==='Approved'?'#16a34a':e.approval_status==='Rejected'?'#dc2626':'#d97706'}">${e.approval_status||'Pending'}</div>
      </div>
    </div>`).join('')

    const detailRows = embs.map(e => {
      const appliesTo = Array.isArray(e.applies_to) ? e.applies_to : (e.applies_to ? [e.applies_to] : ['All'])
      const qty = appliesTo.includes('All') ? o.total_qty : Math.round((o.total_qty||0) * appliesTo.length / Math.max(1, embs.filter(x=>!x.applies_to?.includes?.('All')).length + 1))
      const vendor = suppliers?.find(s=>s.id===e.vendor_id)
      return `<tr>
        <td class="bold">${e.description||'—'}</td>
        <td style="font-size:10px">${e.placement||'—'}</td>
        <td>${e.technique||'—'}</td>
        <td>${e.colors_used||'—'}</td>
        <td>${appliesTo.map(a=>`<span class="badge badge-grey" style="margin-right:2px">${a}</span>`).join('')}</td>
        <td class="right mono bold">${(e.qty||o.total_qty||0).toLocaleString()}</td>
        <td style="font-size:10px">${vendor?.name||'—'}</td>
      </tr>`
    }).join('')

    const approvalRows = embs.map((e,i) => `
    <div class="sub-row"><span class="sub-key">ART-${String(i+1).padStart(3,'0')} ${e.description||''}</span>
    <span class="sub-val" style="color:${e.approval_status==='Approved'?'#16a34a':e.approval_status==='Rejected'?'#dc2626':'#d97706'}">${e.approval_status||'Pending'}</span></div>`).join('')

    const content = docHeader('Production Planning', 'Embellishment Plan', `${o.job_number||'—'} · ${o.style_number||'—'} · ${today}`)
      + orderInfoBar(o, [{ label: 'Description', value: o.description || '—' }])
      + `<div class="section-title">Artwork Reference</div>
         <div class="artwork-grid">${artworkCards}</div>
         <div class="section-title">Embellishment Details</div>
         <table>
           <thead><tr><th>Description</th><th>Placement</th><th>Technique</th><th>Colours</th><th>Applies To</th><th class="right">Qty</th><th>Vendor</th></tr></thead>
           <tbody>${detailRows}</tbody>
         </table>
         <div class="two-col">
           <div><div class="sub-section-title">Artwork Approvals</div>${approvalRows}</div>
         </div>`

    pages.push(pageWrap(content, 'Nizamia Apparels · Karachi, Pakistan — Embellishment Plan · Internal & Vendor Reference', '', pages.length+1, orders.length))
  }
  return pages.join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 6: Finishing Plan
// ─────────────────────────────────────────────────────────────────────────────
async function buildFinishingPlan(orders) {
  const pages = []
  for (const o of orders) {
    const { data: fin } = await supabase.from('finishing').select('*').eq('order_id', o.id).single().catch(()=>({data:null}))
    const { data: configs } = await supabase.from('finishing_color_packing').select('*').eq('order_id', o.id).catch(()=>({data:[]}))

    const cfgs = fin?.configs || configs || []
    const tol = fin?.tolerance_pct ?? 5
    const checklist = fin?.checklist || []

    let totalCartons = 0, totalPcs = 0
    const configRows = (Array.isArray(cfgs) ? cfgs : []).map(cfg => {
      const cartons = parseInt(cfg.cartons)||0
      const pcsPerCtn = parseInt(cfg.pcs_per_ctn)||0
      const packed = cartons * pcsPerCtn
      const orderQty = parseInt(cfg.order_qty)||0
      const variance = orderQty > 0 ? (((packed - orderQty) / orderQty) * 100).toFixed(2) : '—'
      totalCartons += cartons
      totalPcs += packed
      return `<tr>
        <td class="bold">${cfg.colour||cfg.color||'—'}</td>
        <td>${cfg.method||'Solid, Size Ratio'}</td>
        <td class="mono">${cfg.ratio||'—'}</td>
        <td class="right mono">${pcsPerCtn||'—'}</td>
        <td class="right mono bold">${cartons.toLocaleString()}</td>
        <td class="right mono">${packed.toLocaleString()}</td>
        <td class="right" style="color:${parseFloat(variance)>tol||parseFloat(variance)<-tol?'#dc2626':parseFloat(variance)!==0?'#d97706':'inherit'};font-weight:600">${variance !== '—' ? variance+'%' : '—'}</td>
      </tr>`
    }).join('')

    const grandVariance = o.total_qty ? (((totalPcs - o.total_qty) / o.total_qty) * 100).toFixed(2) : null

    // CBM from carton dims
    const l = parseFloat(fin?.carton_length)||60, w = parseFloat(fin?.carton_width)||40, h = parseFloat(fin?.carton_height)||35
    const cbmPerCtn = (l * w * h / 1000000).toFixed(4)
    const totalCbm  = (parseFloat(cbmPerCtn) * totalCartons).toFixed(2)
    let containerType = 'LCL'
    if (parseFloat(totalCbm) > 68) containerType = 'Multiple 40ft HC'
    else if (parseFloat(totalCbm) > 58) containerType = '40ft HC'
    else if (parseFloat(totalCbm) > 28) containerType = '40ft FCL'
    else if (parseFloat(totalCbm) > 15) containerType = '20ft FCL'

    const checkItems = ['Thread Trimming','Final Pressing','Button / Rivet Check','Label Placement QC','Measurement Check','Polybag + Hangtag','Carton Labelling','Final Count Verified']
    const checkHtml = checkItems.map(item => {
      const done = (Array.isArray(checklist) ? checklist : []).includes(item)
      return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6;font-size:11px">
        <span>${item}</span>
        <span style="font-family:'Courier New',monospace;color:#9ca3af">— / —</span>
      </div>`
    })
    const checkLeft  = checkHtml.slice(0, 4).join('')
    const checkRight = checkHtml.slice(4).join('')

    const toleranceNotice = grandVariance && Math.abs(parseFloat(grandVariance)) <= tol && parseFloat(grandVariance) !== 0
      ? `<div class="notice"><div class="notice-label">Tolerance Notice</div>Packing qty (${totalPcs.toLocaleString()}) is within ±${tol}% tolerance. Shortfall of ${Math.abs(o.total_qty - totalPcs)} pcs — confirm with buyer prior to shipment.</div>`
      : grandVariance && Math.abs(parseFloat(grandVariance)) > tol
      ? `<div class="notice" style="background:#fef2f2;border-color:#fecaca"><div class="notice-label" style="color:#dc2626">Tolerance Breach</div>Packing qty (${totalPcs.toLocaleString()}) exceeds ±${tol}% tolerance (variance: ${grandVariance}%).</div>` : ''

    const content = docHeader('Production Planning', 'Finishing Plan', `${o.job_number||'—'} · ${o.style_number||'—'} · ${today}`)
      + `<div class="info-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:20px">
           <div class="info-cell"><div class="info-label">Job No.</div><div class="info-value">${o.job_number||'—'}</div></div>
           <div class="info-cell"><div class="info-label">Style</div><div class="info-value">${o.style_number||'—'}</div></div>
           <div class="info-cell"><div class="info-label">Carton Type</div><div class="info-value">${fin?.carton_type||'Solid'}</div></div>
           <div class="info-cell"><div class="info-label">Tolerance</div><div class="info-value">±${tol}%</div></div>
           <div class="info-cell"><div class="info-label">Ex-Factory</div><div class="info-value">${fmtDate(o.ship_date)}</div></div>
         </div>
         <div class="section-title">Packing Configuration</div>
         <table>
           <thead><tr><th>Colour</th><th>Method</th><th>Ratio/Ctn</th><th class="right">Pcs/Ctn</th><th class="right">Cartons</th><th class="right">Total Pcs</th><th class="right">Variance</th></tr></thead>
           <tbody>
             ${configRows || '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:16px">No packing configuration.</td></tr>'}
             ${configRows ? `<tr class="total-row"><td colspan="4">TOTAL</td><td class="right mono">${totalCartons}</td><td class="right mono">${totalPcs.toLocaleString()}</td><td class="right" style="color:${grandVariance&&Math.abs(parseFloat(grandVariance))>tol?'#dc2626':'inherit'}">${grandVariance?grandVariance+'%':''}${grandVariance&&Math.abs(parseFloat(grandVariance))>tol?' !':''}</td></tr>` : ''}
           </tbody>
         </table>
         ${toleranceNotice}
         <div class="section-title">Carton Details</div>
         <div class="info-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
           <div class="info-cell"><div class="info-label">Carton Dimensions</div><div class="info-value">${l} × ${w} × ${h} cm</div></div>
           <div class="info-cell"><div class="info-label">CBM Per Carton</div><div class="info-value">${cbmPerCtn} m³</div></div>
           <div class="info-cell"><div class="info-label">Container Type</div><div class="info-value">${containerType}</div></div>
           <div class="info-cell"><div class="info-label">Total Cartons</div><div class="info-value">${totalCartons.toLocaleString()}</div></div>
           <div class="info-cell"><div class="info-label">Total CBM</div><div class="info-value">${totalCbm} m³</div></div>
           <div class="info-cell"><div class="info-label">Gross Weight/Ctn</div><div class="info-value">${fin?.gross_weight_per_ctn ? fin.gross_weight_per_ctn + ' kg' : '—'}</div></div>
         </div>
         <div class="section-title">Finishing Checklist</div>
         <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${[checkLeft,checkRight].map(c=>`<div>${c}</div>`).join('')}</div>`

    pages.push(pageWrap(content, 'Nizamia Apparels · Karachi, Pakistan — Finishing Plan · Internal Production & QC', '', pages.length+1, orders.length))
  }
  return pages.join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 7: Sample Cards
// ─────────────────────────────────────────────────────────────────────────────
async function buildSampleCards(orders) {
  const pages = []
  for (const o of orders) {
    const { data: samples } = await supabase.from('samples').select('*').eq('order_id', o.id).order('created_at')
    if (!samples?.length) continue

    for (const s of samples) {
      const colours = Array.isArray(s.colours) ? s.colours : (s.color ? [s.color] : ['—'])
      const sizes   = Array.isArray(s.sizes) ? s.sizes : (s.size ? [s.size] : [])
      const bomSnap = s.bom_snapshot || {}
      const allBom  = [...(bomSnap.fabrics||[]), ...(bomSnap.stitching||[]), ...(bomSnap.packing||[])]
      const washSnap = Array.isArray(s.wash_snapshot) ? s.wash_snapshot : []
      const washImg  = washSnap[0]?.wash_image_base64 || null

      function sampleCard(copyLabel) {
        const bomList = allBom.slice(0, 6).map(b => `<div class="bom-item">${b.name}${b.detail ? ' — ' + b.detail.slice(0,25) : ''}</div>`).join('')
        const sizeBoxes = sizes.map(sz => `<span class="sample-size-box">${sz}</span>`).join('')

        return `
        <div class="sample-card" style="border-bottom:${copyLabel==='MERCH COPY'?'1px dashed #d1d5db':'none'}">
          <div class="sample-hole"></div>
          <div class="sample-header">
            <div class="sample-logo">
              <img src="${LOGO_SRC}" style="width:20px;height:20px;object-fit:contain" />
              <div class="sample-logo-text"><div class="brand">Nizamia</div><div class="sub">Apparels</div></div>
            </div>
            <div class="sample-card-title">
              <div class="title">Sample Card</div>
              <div class="subtitle">Internal Reference Document</div>
            </div>
            <div class="sample-num-block">
              <div class="sample-copy-label">${copyLabel}</div>
              <div style="font-size:8px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Sample No.</div>
              <div class="sample-num">${s.sample_number}</div>
            </div>
          </div>

          <div class="sample-card-inner">
            <div class="sample-main">
              <div class="sample-grid">
                <div class="sample-cell-label">Job #</div><div class="sample-cell-value">${o.job_number||'—'}</div>
                <div class="sample-cell-label">Season</div><div class="sample-cell-value">${o.season||'—'}</div>
                <div class="sample-cell-label">Buyer</div><div class="sample-cell-value large" style="grid-column:1/-1">${o.buyer_name||'—'}</div>
                <div class="sample-cell-label">Style #</div><div class="sample-cell-value">${o.style_number||'—'}</div>
                <div class="sample-cell-label">PO #</div><div class="sample-cell-value">${o.po_number||'—'}</div>
                <div class="sample-cell-label" style="grid-column:1/-1;border-right:none">Description</div>
                <div class="sample-cell-value" style="grid-column:1/-1">${o.description||'—'}</div>
                <div class="sample-cell-label">Colour/Wash</div><div class="sample-cell-value bold">${colours.join(', ')}</div>
                <div class="sample-cell-label">Ref Code</div><div class="sample-cell-value">${s.size_group_name||'—'}</div>
                <div class="sample-cell-label" style="grid-column:1/-1;border-right:none">Sizes</div>
                <div class="sample-cell-value" style="grid-column:1/-1"><div class="sample-sizes">${sizeBoxes || '—'}</div></div>
                <div class="sample-cell-label">Block/Spec</div><div class="sample-cell-value">${s.base_size ? 'Base: ' + s.base_size : '—'}</div>
                <div class="sample-cell-label">Type</div><div class="sample-cell-value">${s.sample_type||'—'}</div>
                <div class="sample-cell-label">Merch.</div><div class="sample-cell-value">${o.merchandiser_name||'—'}</div>
                <div class="sample-cell-label">Date</div><div class="sample-cell-value">${today}</div>
              </div>
              ${allBom.length > 0 ? `
              <div style="margin-top:2mm;border:1px solid #e5e7eb;border-radius:3px">
                <div style="font-size:7px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;padding:3px 6px;border-bottom:1px solid #f0f0ee;background:#fafaf8">Key BOM Items</div>
                <div class="bom-items">${bomList}</div>
              </div>` : ''}
            </div>

            <div class="sample-right">
              <div class="sample-right-section">
                <div class="sample-right-label">Wash Reference</div>
                <div class="sample-wash-area">
                  ${washImg ? `<img src="${washImg}" />` : '<div style="color:#d1d5db;font-size:9px;text-align:center">No wash<br>reference</div>'}
                </div>
              </div>
              <div class="sample-right-section">
                <div class="sample-right-label">Scan to View Order</div>
                <div style="padding:5px;display:flex;align-items:center;justify-content:center;height:24mm;background:#fff">
                  <div style="width:50px;height:50px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:8px;color:#9ca3af;text-align:center">QR</div>
                </div>
              </div>
              <div class="sample-status-box">
                <div class="sample-status-label">Status</div>
                <div class="sample-status-item"><div class="sample-status-cb"></div> Approved</div>
                <div class="sample-status-item"><div class="sample-status-cb"></div> Rejected</div>
                <div class="sample-status-item"><div class="sample-status-cb"></div> Pending</div>
              </div>
            </div>
          </div>
        </div>`
      }

      pages.push(`
      <div class="sample-page">
        ${sampleCard('MERCH COPY')}
        <div class="cut-line"><span class="cut-label">✂ Cut Here</span></div>
        ${sampleCard('SAMPLE ROOM COPY')}
      </div>`)
    }
  }

  return pages.length ? pages.join('') : '<div class="page"><p style="color:#9ca3af;padding:20px">No sample requests found for selected orders.</p></div>'
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT 8 & 9: PO and WO — triggered from Purchasing, handled separately
// These are exported as standalone functions
// ─────────────────────────────────────────────────────────────────────────────
export async function printPurchaseOrder(po, supplier, order, taxRate, targetWindow = null) {
  const storedTax = decodePrintTax(po.notes)
  const effectiveTaxRate = taxRate ?? (storedTax?.enabled ? storedTax.rate : 18)
  const qReference = extractQReference(po, order)
  const version = getPOVersion(po.notes)
  const company = getCompanyInfo()
  const printCount = bumpPrintCount(po.po_number)
  const rawStatus = String(po.status || po.po_status || 'draft').toLowerCase()
  const isPOApproved = rawStatus === 'approved'
  const statusText = isPOApproved ? 'APPROVED' : 'DRAFT'
  const printableSupplierName = isPOApproved ? (supplier?.name || '—') : '************'
  const items = (po.items || po.purchase_order_items || []).map(it => ({ ...it, ...decodePrintSpec(it.specification), breakdown: it.breakdown || decodePrintSpec(it.specification).breakdown }))
  const subtotal = items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
  const tax = subtotal * ((parseFloat(effectiveTaxRate) || 0)/100)
  const grand = subtotal + tax
  const currency = po.currency || 'PKR'
  const totalQty = items.reduce((s,i)=>s+(parseFloat(i.qty)||0),0)
  const filledRows = items.map((item) => `<tr><td>${escapeHTML(item.description || '—')}</td><td>${escapeHTML([item.specification, item.breakdown].filter(Boolean).join(' · ') || '—')}</td><td>${escapeHTML(item.unit || '—')}</td><td class="num">${item.qty ? fmtNum(item.qty,0) : '—'}</td><td class="num">${item.unit_rate ? fmtNum(item.unit_rate,2) : '—'}</td><td class="num">${item.amount ? fmtNum(item.amount,2) : '—'}</td></tr>`)
  const emptyRows = Array.from({ length: Math.max(0, 14 - filledRows.length) }, () => `<tr class="blank-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`)
  const itemRows = [...filledRows, ...emptyRows].join('')
  const html = `
  <div class="po-a4-page">
    <style>
      @page { size: A4; margin: 0; }
      html,body{width:210mm;height:297mm;margin:0;padding:0;overflow:hidden;background:#fff}
      .po-a4-page{width:210mm;height:297mm;box-sizing:border-box;padding:8mm 6mm 5mm;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;position:relative;page-break-after:avoid;overflow:hidden;display:flex;flex-direction:column}
      .po-a4-page *{box-sizing:border-box} table{border-collapse:collapse;width:100%;table-layout:fixed} table,tr,td,th{page-break-inside:avoid;break-inside:avoid}
      .po-head{display:grid;grid-template-columns:1fr 42mm;align-items:start;margin-bottom:2mm;flex:0 0 auto}.po-small-title{font-size:16px;font-weight:800;line-height:1;margin:0 0 2mm}.po-company{font-family:Georgia,'Times New Roman',serif;font-size:44px;font-weight:900;letter-spacing:-1.4px;line-height:.82;white-space:nowrap}.po-tagline{font-size:11.5px;font-style:italic;font-weight:700;line-height:1.15;margin-top:1mm}.po-address{font-size:9.5px;line-height:1.22;margin-top:1mm;max-width:130mm}.po-status{text-align:right;padding-top:0;display:flex;flex-direction:column;align-items:flex-end}.po-status-meta{font-size:10px;font-weight:800;line-height:1.15;text-align:right;margin-bottom:1.5mm}.po-status-version{font-size:18px;font-weight:900;line-height:1}.po-status-box{display:inline-block;background:#000;color:#fff;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:900;letter-spacing:.5px;padding:2mm 3mm;min-width:35mm;text-align:center}
      .meta-table{border:1.4px solid #000;margin-top:1mm}.meta-table td{border:1.4px solid #000;vertical-align:top;padding:3mm 3.5mm}.meta-label{font-size:12px;font-weight:900;text-transform:uppercase;line-height:1.1}.meta-value{font-size:13px;font-weight:800;margin-top:2.5mm;line-height:1.15}.supplier-cell{width:35%;height:31mm}.middle-cell{width:26%;padding:0!important}.right-cell{width:39%;padding:0!important}.mini-stack{height:31mm;display:grid;grid-template-rows:1fr 1fr}.mini-stack>div{padding:3mm 3.5mm}.mini-stack>div:first-child{border-bottom:1.4px solid #000}.right-stack{height:31mm;display:grid;grid-template-rows:repeat(4,1fr)}.right-stack>div{padding:2.2mm 3.5mm;border-bottom:1.4px solid #000;display:grid;grid-template-columns:33mm 1fr;align-items:center;column-gap:3mm}.right-stack>div:last-child{border-bottom:0}.right-stack .meta-value{margin-top:0;font-size:12px}
      .items-table{margin-top:2.5mm;border:1.4px solid #000;flex:0 0 auto}.items-table th{background:#000;color:#fff;border:1.4px solid #000;padding:2.2mm 2.4mm;font-size:12.5px;font-weight:900;text-align:left}.items-table td{border-left:1.4px solid #000;border-right:1.4px solid #000;border-bottom:1.1px solid #000;padding:1.6mm 2.4mm;font-size:10.8px;height:8.1mm;vertical-align:middle}.items-table .blank-row td{height:8.1mm}.items-table .num{text-align:right;font-variant-numeric:tabular-nums}.items-table th:nth-child(1){width:11%}.items-table th:nth-child(2){width:47%}.items-table th:nth-child(3){width:10%}.items-table th:nth-child(4){width:9%}.items-table th:nth-child(5){width:11%}.items-table th:nth-child(6){width:12%}.total-strip td{background:#e8e8e8;font-size:13px;font-weight:900;height:8.1mm;border-top:1.4px solid #000;border-bottom:1.4px solid #000}.total-strip .total-title{text-align:left}
      .words-tax-table{border-left:1.4px solid #000;border-right:1.4px solid #000;border-bottom:1.4px solid #000}.words-tax-table td{border:1.4px solid #000;padding:3mm 2.5mm;vertical-align:top;font-size:11px}.words-box{width:63%;height:18mm}.tax-box{width:37%;padding:0!important}.tax-row{display:grid;grid-template-columns:1fr 28mm;border-bottom:1.4px solid #000;min-height:9mm;align-items:center}.tax-row:last-child{border-bottom:0}.tax-row div{padding:2mm 2.5mm;font-size:13px;font-weight:900}.tax-row div:last-child{text-align:right;font-variant-numeric:tabular-nums}.terms-block{margin-top:3mm;min-height:24mm;flex:0 0 auto}.terms-title{font-size:13px;font-weight:900;margin-bottom:1.5mm;text-transform:uppercase}.terms-text{font-size:10.8px;line-height:1.2;text-align:justify}.sig-table{margin-top:auto;border:1.4px solid #000;height:24mm;flex:0 0 auto}.sig-table td{border:1.4px solid #000;width:25%;padding:0;position:relative;vertical-align:top}.signature-box{height:24mm;position:relative;vertical-align:top;text-align:center}.sig-label{position:absolute;bottom:2mm;left:0;right:0;text-align:center;font-size:11px;font-weight:900;color:#000;letter-spacing:0;text-transform:uppercase}.footer-lock{display:none}
    </style>
    <div class="po-head"><div><div class="po-small-title">PURCHASE ORDER</div><div class="po-company">${escapeHTML(company.name)}</div><div class="po-tagline">${escapeHTML(company.tagline)}</div><div class="po-address">${companyAddressLine(company)}</div></div><div class="po-status"><div class="po-status-meta"><div class="po-status-version">V${version}</div><div>Print Count: ${String(printCount).padStart(2,'0')}</div></div><div class="po-status-box">${escapeHTML(statusText)}</div></div></div>
    <table class="meta-table"><tr><td class="supplier-cell"><div class="meta-label">Supplier Information</div><div class="meta-value">${escapeHTML(printableSupplierName)}</div></td><td class="middle-cell"><div class="mini-stack"><div><div class="meta-label">Job Number</div><div class="meta-value">${escapeHTML(order?.job_number || '—')}</div></div><div><div class="meta-label">Style &amp; Queue Number</div><div class="meta-value">${escapeHTML([order?.style_number, qReference].filter(Boolean).join(' / ') || '—')}</div></div></div></td><td class="right-cell"><div class="right-stack"><div><div class="meta-label">PO Number</div><div class="meta-value">${escapeHTML(po.po_number || '—')}</div></div><div><div class="meta-label">Issue Date</div><div class="meta-value">${fmtDate(po.po_date)}</div></div><div><div class="meta-label">Delivery Date</div><div class="meta-value">${fmtDate(po.delivery_date)}</div></div><div><div class="meta-label">Payment Terms</div><div class="meta-value">${escapeHTML(po.payment_terms || '—')}</div></div></div></td></tr></table>
    <table class="items-table"><thead><tr><th>ITEMS</th><th>DESCRIPTION</th><th>UOM</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead><tbody>${itemRows}<tr class="total-strip"><td colspan="3" class="total-title">TOTAL</td><td class="num">${fmtNum(totalQty,0)}</td><td></td><td class="num">${fmtNum(subtotal,2)}</td></tr></tbody></table>
    <table class="words-tax-table"><tr><td class="words-box"><b>AMOUNT IN WORDS:</b><br/>${escapeHTML(amountInWords(grand, currency))}</td><td class="tax-box"><div class="tax-row"><div>ADD SALES TAX (${fmtNum(effectiveTaxRate,0)}%)</div><div>${fmtNum(tax,2)}</div></div><div class="tax-row"><div>TOTAL AMOUNT (${escapeHTML(currency)})</div><div>${fmtNum(grand,2)}</div></div></td></tr></table>
    <div class="terms-block"><div class="terms-title">Terms &amp; Conditions</div><div class="terms-text">${escapeHTML(getPOTerms())}</div></div>
    <table class="sig-table"><tr><td class="signature-box"><div class="sig-label">Supplier Receiving</div></td><td class="signature-box"><div class="sig-label">Merchandiser</div></td><td class="signature-box"><div class="sig-label">Store Incharge</div></td><td class="signature-box"><div class="sig-label">CEO / Director</div></td></tr></table>
  </div>`
  printHTML(html, targetWindow)
}

export async function printWorkOrder(wo, vendor, order, targetWindow = null) {
  const items = wo.items || wo.work_order_items || []
  const subtotal = items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0)
  const allProcesses = ['Cutting','Stitching','Kaj','Bartack','Press','Final Checking','Finishing','Packing','Heat Transfer','Screen Print','Embroidery','Wash','Paint Splatter','Rip & Repair','Cropping']
  const ticked = wo.processes || []

  const processGrid = allProcesses.map(p => `
  <div class="process-item">
    <div class="process-cb ${ticked.includes(p)?'checked':''}"></div>
    <span>${p}</span>
  </div>`).join('')

  const itemRows = items.map(item => `<tr>
    <td class="bold">${item.process_name||'—'}</td>
    <td style="font-size:10px;color:#6b7280">${item.dept_info||'—'}</td>
    <td class="right mono">${item.qty ? fmtNum(item.qty) : '—'}</td>
    <td>${item.unit||'pc'}</td>
    <td class="right mono">${item.rate ? fmtNum(item.rate,2) : '—'}</td>
    <td class="right mono bold">${item.amount ? fmtNum(item.amount,0) : '—'}</td>
  </tr>`).join('')

  const html = `
  <div class="page">
    ${docHeader('Production Document', 'Work Order', `${wo.wo_number} · ${fmtDate(wo.issue_date)} · ORIGINAL`)}
    <div class="po-header-box">
      <div class="po-left">
        <div class="po-number">${wo.wo_number}</div>
        <div class="po-meta-row">
          <div class="po-meta-item"><div class="lbl">Issue Date</div><div class="val">${fmtDate(wo.issue_date)}</div></div>
          <div class="po-meta-item"><div class="lbl">Start Date</div><div class="val">${fmtDate(wo.start_date)}</div></div>
        </div>
        <div class="po-meta-row">
          <div class="po-meta-item"><div class="lbl">Complete By</div><div class="val">${fmtDate(wo.complete_by)}</div></div>
          <div class="po-meta-item"><div class="lbl">Daily Output</div><div class="val">${wo.daily_output ? wo.daily_output + ' pcs/day' : '—'}</div></div>
        </div>
        <div class="po-meta-row">
          <div class="po-meta-item"><div class="lbl">Payment Terms</div><div class="val">${wo.payment_terms||'—'}</div></div>
        </div>
      </div>
      <div class="po-right">
        <div class="info-label">Contractor / Vendor</div>
        <div class="po-supplier-name">${vendor?.name||'—'}</div>
        <div class="po-supplier-addr">${[vendor?.address, vendor?.city, vendor?.phone].filter(Boolean).join('<br>') || ''}</div>
        <hr class="po-divider" />
        <div class="info-label" style="margin-bottom:4px">Order Reference</div>
        <div style="font-size:10px;line-height:1.6">
          Job: ${order?.job_number||'—'}<br>
          Style: ${order?.style_number||'—'}<br>
          ${wo.color ? 'Colour: ' + wo.color + '<br>' : ''}
          ${wo.qty ? 'Qty: ' + parseInt(wo.qty).toLocaleString() + ' pcs' : ''}
        </div>
      </div>
    </div>
    <div class="section-title">Processes Authorised</div>
    <div class="process-grid">${processGrid}</div>
    <div class="section-title">Line Items</div>
    <table>
      <thead><tr><th>Process</th><th>Dept / Info</th><th class="right">Qty</th><th>Unit</th><th class="right">Rate (PKR)</th><th class="right">Amount (PKR)</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="po-totals">
      <div class="po-total-row"><span>Subtotal</span><span>PKR ${fmtNum(subtotal,0)}</span></div>
      ${wo.advance_pct ? `<div class="po-total-row"><span>Advance (${wo.advance_pct}%)</span><span>PKR ${fmtNum(subtotal*(wo.advance_pct/100),0)}</span></div><div class="po-total-row grand"><span>Final Payable</span><span>PKR ${fmtNum(subtotal*(1-wo.advance_pct/100),0)}</span></div>` : `<div class="po-total-row grand"><span>Total</span><span>PKR ${fmtNum(subtotal,0)}</span></div>`}
    </div>
    ${wo.notes ? `<div class="tc-box"><div class="tc-label">Special Instructions</div><div class="tc-text">${wo.notes}</div></div>` : ''}
    <div class="sig-block">
      <div><div class="sig-label">Issued By</div><div class="sig-line"></div><div class="sig-name">Merchandiser</div></div>
      <div><div class="sig-label">Contractor Acknowledgement</div><div class="sig-line"></div></div>
      <div><div class="sig-label">Date</div><div class="sig-line"></div><div class="sig-name">${today}</div></div>
    </div>
    <div class="doc-footer">
      <span>Nizamia Apparels · Karachi, Pakistan — Work Order ${wo.wo_number} · Original</span>
      <span>01 / 01</span>
    </div>
  </div>`
  printHTML(html, targetWindow)
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT POPUP — shown when Print button clicked on Orders page
// ─────────────────────────────────────────────────────────────────────────────
const REPORTS = [
  { id: 'overview',       label: 'Business Overview',   desc: 'All active orders — CEO report', multiOnly: false, single: true },
  { id: 'summary',        label: 'Order Summary',        desc: 'PO breakdown + order details' },
  { id: 'fabric',         label: 'Fabric Plan',          desc: 'Fabric requirements + colour breakdown' },
  { id: 'trims',          label: 'Trims Plan',           desc: 'Stitching & packing trims' },
  { id: 'embellishment',  label: 'Embellishment Plan',   desc: 'Artwork reference + vendor details' },
  { id: 'finishing',      label: 'Finishing Plan',       desc: 'Packing config + checklist + CBM' },
  { id: 'samples',        label: 'Sample Cards',         desc: 'A4 cut-in-half cards per sample' },
]

export default function PrintPopup({ selectedOrders, onClose }) {
  const [loading, setLoading] = useState(null)

  const sameJob = selectedOrders.length > 1
    ? [...new Set(selectedOrders.map(o=>o.job_number))].length === 1
    : true

  async function handlePrint(reportId) {
    const targetWindow = openPrintWindow()
    if (!targetWindow) return
    setLoading(reportId)
    try {
      let html = ''
      if (reportId === 'overview') html = await buildBusinessOverview()
      else if (reportId === 'summary') html = await buildOrderSummary(selectedOrders)
      else if (reportId === 'fabric') html = await buildFabricPlan(selectedOrders)
      else if (reportId === 'trims') html = await buildTrimsPlan(selectedOrders)
      else if (reportId === 'embellishment') html = await buildEmbellishmentPlan(selectedOrders)
      else if (reportId === 'finishing') html = await buildFinishingPlan(selectedOrders)
      else if (reportId === 'samples') html = await buildSampleCards(selectedOrders)
      printHTML(html, targetWindow)
    } catch(e) {
      console.error(e)
      targetWindow.document.open()
      targetWindow.document.write(`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:24px">Error generating report: ${String(e.message || e)}</body></html>`)
      targetWindow.document.close()
    }
    setLoading(null)
  }

  const multiLabel = selectedOrders.length > 1
    ? (`${selectedOrders.length} orders selected${sameJob ? ' · Same job — reports will be combined' : ' · Different jobs — sections printed separately'}`)
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 460, boxShadow: '0 24px 80px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={14} /> Print Reports
            </div>
            {multiLabel && <div style={{ fontSize: 11, color: sameJob ? '#16a34a' : '#d97706', marginTop: 2 }}>{multiLabel}</div>}
            {!multiLabel && selectedOrders.length === 1 && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{selectedOrders[0].job_number} · {selectedOrders[0].style_number}</div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '8px 0' }}>
          {REPORTS.map(r => (
            <button key={r.id} onClick={() => handlePrint(r.id)} disabled={!!loading}
              style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '10px 18px', background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', gap: 12, textAlign: 'left' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#fafafa' }}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <FileText size={14} color={loading === r.id ? '#2563eb' : '#9ca3af'} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.desc}</div>
              </div>
              {loading === r.id
                ? <span style={{ fontSize: 10, color: '#2563eb' }}>Generating...</span>
                : <ChevronRight size={13} color="#d1d5db" />
              }
            </button>
          ))}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid #f0f0ee', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
