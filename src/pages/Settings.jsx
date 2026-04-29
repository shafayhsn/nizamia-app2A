import React, { useState } from 'react'
import { Building2, Percent, FileText, Users, ShieldCheck, Hash, Ruler, SlidersHorizontal, X } from 'lucide-react'
import UsersAndRights from './UsersAndRights'

const PO_TAX_RATE_KEY = 'nizamia_po_sales_tax_rate'
const PO_TERMS_KEY = 'nizamia_po_terms_conditions'
const COMPANY_INFO_KEY = 'nizamia_company_info'
const DEFAULT_COMPANY_INFO = {
  name: 'NIZAMIA APPARELS',
  tagline: 'Manufacturer & Exporter of Knitted and Woven Garments',
  address: 'RCC14, SHED NR 2, ESTATE AVENUE ROAD, SITE INDUSTRIAL AREA,\nKARACHI 75700, PAKISTAN',
  website: 'www.nizamia.com'
}
const DEFAULT_PO_TERMS = 'Standard purchase terms and conditions will appear on purchase orders and reports.'
const ADMIN_PASS = 'admin'

function Field({ label, children }) { return <div className="form-group"><label>{label}</label>{children}</div> }
function Modal({ title, subtitle, onClose, children }) {
  return <div className="settings-modal-backdrop" onMouseDown={onClose}>
    <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="settings-modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="btn btn-secondary btn-sm" onClick={onClose}><X size={14} /> Close</button></div>
      <div className="settings-modal-body">{children}</div>
    </div>
  </div>
}

export default function Settings() {
  const [active, setActive] = useState(null)
  const [saved, setSaved] = useState(false)
  const [poTaxRate, setPoTaxRate] = useState(() => String(parseFloat(localStorage.getItem(PO_TAX_RATE_KEY)) || 18))
  const [poTerms, setPOTerms] = useState(() => localStorage.getItem(PO_TERMS_KEY) || DEFAULT_PO_TERMS)
  const [companyInfo, setCompanyInfo] = useState(() => { try { return { ...DEFAULT_COMPANY_INFO, ...JSON.parse(localStorage.getItem(COMPANY_INFO_KEY) || '{}') } } catch { return DEFAULT_COMPANY_INFO } })
  const [companyUnlocked, setCompanyUnlocked] = useState(false)
  const [termsUnlocked, setTermsUnlocked] = useState(false)

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }
  const unlock = (set) => { const pw = window.prompt('Admin password required:'); if (pw === ADMIN_PASS) set(true); else if (pw !== null) alert('Incorrect admin password.') }
  const saveTax = () => { const n = parseFloat(poTaxRate); const safe = Number.isFinite(n) && n >= 0 ? n : 18; localStorage.setItem(PO_TAX_RATE_KEY, String(safe)); setPoTaxRate(String(safe)); flash() }
  const saveCompany = () => { localStorage.setItem(COMPANY_INFO_KEY, JSON.stringify(companyInfo)); setCompanyUnlocked(false); flash() }
  const saveTerms = () => { localStorage.setItem(PO_TERMS_KEY, poTerms); setTermsUnlocked(false); flash() }

  const cards = [
    { id: 'company', title: 'Company Information', desc: 'Name, address, website and report header details.', icon: Building2 },
    { id: 'tax', title: 'Tax Information', desc: 'Default sales tax rate used in purchasing.', icon: Percent },
    { id: 'terms', title: 'Terms & Conditions', desc: 'Protected purchase order terms text.', icon: FileText },
    { id: 'users', title: 'User Management', desc: 'Users, usernames, status and custom roles.', icon: Users },
    { id: 'roles', title: 'Roles & Permissions', desc: 'Fully custom role planning and permissions.', icon: ShieldCheck },
    { id: 'series', title: 'Numbering / Document Series', desc: 'Future PO, WO, invoice and voucher numbering.', icon: Hash },
    { id: 'uom', title: 'Units & Conversions', desc: 'Future UOM and conversion controls.', icon: Ruler },
    { id: 'defaults', title: 'Defaults & Preferences', desc: 'Future currency, defaults and app preferences.', icon: SlidersHorizontal },
  ]

  return <div className="page-content settings-page">
    <div className="section-header"><div><h1>Settings</h1><div className="page-subtitle">Clean configuration hub for Nizamia OMS</div></div>{saved && <span className="save-pill">Saved</span>}</div>
    <div className="settings-grid">{cards.map(c => { const Icon = c.icon; return <button key={c.id} className="settings-tile" onClick={() => setActive(c.id)}><div className="settings-icon"><Icon size={22} /></div><div><h3>{c.title}</h3><p>{c.desc}</p></div></button> })}</div>

    {active === 'company' && <Modal title="Company Information" subtitle="Used on prints, reports and official documents." onClose={() => setActive(null)}>
      {!companyUnlocked && <button className="btn btn-secondary" onClick={() => unlock(setCompanyUnlocked)}>Unlock Editing</button>}
      <div className="form-row form-row-2" style={{ marginTop: 16 }}>
        <Field label="Company Name"><input className="input" disabled={!companyUnlocked} value={companyInfo.name} onChange={e => setCompanyInfo(p => ({ ...p, name: e.target.value }))} /></Field>
        <Field label="Website"><input className="input" disabled={!companyUnlocked} value={companyInfo.website} onChange={e => setCompanyInfo(p => ({ ...p, website: e.target.value }))} /></Field>
      </div>
      <Field label="Tagline"><input className="input" disabled={!companyUnlocked} value={companyInfo.tagline} onChange={e => setCompanyInfo(p => ({ ...p, tagline: e.target.value }))} /></Field>
      <Field label="Address"><textarea className="textarea" disabled={!companyUnlocked} rows={4} value={companyInfo.address} onChange={e => setCompanyInfo(p => ({ ...p, address: e.target.value }))} /></Field>
      {companyUnlocked && <button className="btn btn-primary" onClick={saveCompany}>Save Company Information</button>}
    </Modal>}

    {active === 'tax' && <Modal title="Tax Information" subtitle="Default tax information used by purchase documents." onClose={() => setActive(null)}>
      <Field label="Sales Tax Rate %"><input className="input" type="number" step="0.01" value={poTaxRate} onChange={e => setPoTaxRate(e.target.value)} /></Field>
      <button className="btn btn-primary" onClick={saveTax}>Save Tax Rate</button>
    </Modal>}

    {active === 'terms' && <Modal title="Terms & Conditions" subtitle="Protected terms used on PO print formats." onClose={() => setActive(null)}>
      {!termsUnlocked && <button className="btn btn-secondary" onClick={() => unlock(setTermsUnlocked)}>Unlock Editing</button>}
      <textarea className="textarea" disabled={!termsUnlocked} rows={12} style={{ marginTop: 16 }} value={poTerms} onChange={e => setPOTerms(e.target.value)} />
      {termsUnlocked && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={saveTerms}>Save Terms</button>}
    </Modal>}

    {active === 'users' && <Modal title="User Management" subtitle="Create profiles, set manual usernames and fully custom roles." onClose={() => setActive(null)}><UsersAndRights embedded /></Modal>}
    {['roles','series','uom','defaults'].includes(active) && <Modal title={cards.find(c => c.id === active)?.title} subtitle="Structure reserved for the next build stage." onClose={() => setActive(null)}><div className="empty-state"><p>This section is ready as a Settings thumbnail. We will wire full logic when this module is selected for rebuild.</p></div></Modal>}
  </div>
}
