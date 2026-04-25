import React, { useState } from 'react'

const PO_TAX_RATE_KEY = 'nizamia_po_sales_tax_rate'

export default function Settings() {
  const [poTaxRate, setPoTaxRate] = useState(() => {
    const saved = parseFloat(localStorage.getItem(PO_TAX_RATE_KEY))
    return Number.isFinite(saved) ? String(saved) : '18'
  })
  const [saved, setSaved] = useState(false)

  const saveTaxRate = () => {
    const n = parseFloat(poTaxRate)
    const safe = Number.isFinite(n) && n >= 0 ? n : 18
    localStorage.setItem(PO_TAX_RATE_KEY, String(safe))
    setPoTaxRate(String(safe))
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div style={{ padding: '28px', overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Settings</h1>
      <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 24 }}>App preferences and configuration</div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 20, maxWidth: 560 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Purchasing</div>
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 16 }}>Default values used when creating purchase orders.</div>

        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Sales Tax Rate %
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={poTaxRate}
            onChange={e => setPoTaxRate(e.target.value)}
            style={{ width: 140, height: 34, border: '1px solid var(--border)', borderRadius: 7, padding: '0 10px', fontSize: 13, outline: 'none' }}
          />
          <button className="btn btn-primary btn-sm" onClick={saveTaxRate}>Save</button>
          {saved && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>Saved</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>Default is 18%. The PO popup tax toggle uses this value.</div>
      </div>
    </div>
  )
}
