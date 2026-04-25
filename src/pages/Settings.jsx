import React, { useState } from 'react'

const PO_TAX_RATE_KEY = 'nizamia_po_sales_tax_rate'
const PO_TERMS_KEY = 'nizamia_po_terms_conditions'
const DEFAULT_PO_TERMS = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat. Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan et iusto odio dignissim qui tem vel eum iriure dolor in hendrerit.'
const ADMIN_PASS = 'admin'

export default function Settings() {
  const [poTaxRate, setPoTaxRate] = useState(() => {
    const saved = parseFloat(localStorage.getItem(PO_TAX_RATE_KEY))
    return Number.isFinite(saved) ? String(saved) : '18'
  })
  const [poTerms, setPOTerms] = useState(() => localStorage.getItem(PO_TERMS_KEY) || DEFAULT_PO_TERMS)
  const [termsUnlocked, setTermsUnlocked] = useState(false)
  const [termsError, setTermsError] = useState('')
  const [saved, setSaved] = useState(false)

  const saveTaxRate = () => {
    const n = parseFloat(poTaxRate)
    const safe = Number.isFinite(n) && n >= 0 ? n : 18
    localStorage.setItem(PO_TAX_RATE_KEY, String(safe))
    setPoTaxRate(String(safe))
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const unlockTerms = () => {
    const pw = window.prompt('Admin password required to edit PO Terms & Conditions:')
    if (pw === ADMIN_PASS) {
      setTermsUnlocked(true)
      setTermsError('')
    } else if (pw !== null) {
      setTermsError('Incorrect admin password.')
    }
  }

  const saveTerms = () => {
    localStorage.setItem(PO_TERMS_KEY, poTerms)
    setTermsUnlocked(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div style={{ padding: '28px', overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Settings</h1>
      <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 24 }}>App preferences and configuration</div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 20, maxWidth: 680 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Purchasing</div>
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 16 }}>Default values used when creating purchase orders.</div>

        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Sales Tax Rate %
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
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

        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          PO Terms & Conditions
        </label>
        <textarea
          value={poTerms}
          onChange={e => setPOTerms(e.target.value)}
          disabled={!termsUnlocked}
          style={{ width: '100%', minHeight: 130, border: '1px solid var(--border)', borderRadius: 7, padding: 10, fontSize: 12, lineHeight: 1.45, resize: 'vertical', outline: 'none', background: termsUnlocked ? '#fff' : '#f9fafb' }}
        />
        <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
          {!termsUnlocked ? (
            <button className="btn btn-secondary btn-sm" onClick={unlockTerms}>Unlock Terms</button>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" onClick={saveTerms}>Save Terms</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setPOTerms(localStorage.getItem(PO_TERMS_KEY) || DEFAULT_PO_TERMS); setTermsUnlocked(false) }}>Cancel</button>
            </>
          )}
          {termsError && <span style={{ fontSize:12, color:'#dc2626', fontWeight:700 }}>{termsError}</span>}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>Protected by admin password. Current password: admin.</div>
      </div>
    </div>
  )
}
