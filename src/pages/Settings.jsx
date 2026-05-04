import React, { useState } from 'react'
import { Building2, Calculator, FileText, Users, ShieldCheck, Hash, Ruler, SlidersHorizontal, Download, X } from 'lucide-react'
import UsersAndRights from './UsersAndRights'
import RolesPermissions from './RolesPermissions'
import BackupExport from './BackupExport'
import { statusBadgeStyle } from '../lib/statusColors'

const PO_TAX_RATE_KEY = 'nizamia_po_sales_tax_rate'
const PO_TERMS_KEY = 'nizamia_po_terms_conditions'
const COMPANY_INFO_KEY = 'nizamia_company_info'
const DEFAULT_COMPANY_INFO = {
  name: 'NIZAMIA APPARELS',
  tagline: 'Manufacturer & Exporter of Knitted and Woven Garments',
  address: 'RCC14, SHED NR 2, ESTATE AVENUE ROAD, SITE INDUSTRIAL AREA,\nKARACHI 75700, PAKISTAN',
  website: 'www.nizamia.com'
}
const DEFAULT_PO_TERMS = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat. Duis autem vel eum iriure dolor in hendrerit in vulputate velit esse molestie consequat, vel illum dolore eu feugiat nulla facilisis at vero eros et accumsan et iusto odio dignissim qui tem vel eum iriure dolor in hendrerit.'
const ADMIN_PASS = 'admin'

export default function Settings() {
  const [active, setActive] = useState(null)
  const [saved, setSaved] = useState(false)
  const [poTaxRate, setPoTaxRate] = useState(() => {
    const saved = parseFloat(localStorage.getItem(PO_TAX_RATE_KEY))
    return Number.isFinite(saved) ? String(saved) : '18'
  })
  const [poTerms, setPOTerms] = useState(() => localStorage.getItem(PO_TERMS_KEY) || DEFAULT_PO_TERMS)
  const [companyInfo, setCompanyInfo] = useState(() => {
    try { return { ...DEFAULT_COMPANY_INFO, ...JSON.parse(localStorage.getItem(COMPANY_INFO_KEY) || '{}') } }
    catch { return DEFAULT_COMPANY_INFO }
  })
  const [companyUnlocked, setCompanyUnlocked] = useState(false)
  const [companyError, setCompanyError] = useState('')
  const [termsUnlocked, setTermsUnlocked] = useState(false)
  const [termsError, setTermsError] = useState('')

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1600) }
  const unlock = (label, onSuccess, onError) => {
    const pw = window.prompt(`Admin password required to edit ${label}:`)
    if (pw === ADMIN_PASS) { onSuccess(); onError('') }
    else if (pw !== null) onError('Incorrect admin password.')
  }
  const saveTaxRate = () => {
    const n = parseFloat(poTaxRate)
    const safe = Number.isFinite(n) && n >= 0 ? n : 18
    localStorage.setItem(PO_TAX_RATE_KEY, String(safe))
    setPoTaxRate(String(safe))
    flashSaved()
  }
  const saveTerms = () => { localStorage.setItem(PO_TERMS_KEY, poTerms); setTermsUnlocked(false); flashSaved() }
  const saveCompany = () => { localStorage.setItem(COMPANY_INFO_KEY, JSON.stringify(companyInfo)); setCompanyUnlocked(false); flashSaved() }
  const setCompanyField = field => e => setCompanyInfo(prev => ({ ...prev, [field]: e.target.value }))

  const cards = [
    { id: 'company', title: 'Company Info', desc: 'PO header company details', icon: Building2, status: 'Active' },
    { id: 'tax', title: 'Tax', desc: 'Default PO sales tax rate', icon: Calculator, status: 'Active' },
    { id: 'terms', title: 'Terms', desc: 'PO terms & conditions', icon: FileText, status: 'Active' },
    { id: 'users', title: 'User Management', desc: 'Users, roles and active status', icon: Users, status: 'Active' },
    { id: 'roles', title: 'Roles & Permissions', desc: 'Structured permission matrix', icon: ShieldCheck, status: 'Active' },
    { id: 'backup', title: 'Backup & Export', desc: 'Download complete app data backup', icon: Download, status: 'Active' },
    { id: 'numbering', title: 'Document Numbering', desc: 'PO, PD and report series', icon: Hash, status: 'UI Ready' },
    { id: 'uom', title: 'UOM', desc: 'Units of measure setup', icon: Ruler, status: 'UI Ready' },
    { id: 'defaults', title: 'Defaults', desc: 'System default values', icon: SlidersHorizontal, status: 'UI Ready' },
  ]

  const renderContent = () => {
    if (active === 'company') return <CompanyInfo companyInfo={companyInfo} setCompanyField={setCompanyField} companyUnlocked={companyUnlocked} companyError={companyError} onUnlock={() => unlock('Company Information', () => setCompanyUnlocked(true), setCompanyError)} onSave={saveCompany} onCancel={() => { try { setCompanyInfo({ ...DEFAULT_COMPANY_INFO, ...JSON.parse(localStorage.getItem(COMPANY_INFO_KEY) || '{}') }) } catch { setCompanyInfo(DEFAULT_COMPANY_INFO) } setCompanyUnlocked(false) }} />
    if (active === 'tax') return <Tax poTaxRate={poTaxRate} setPoTaxRate={setPoTaxRate} onSave={saveTaxRate} />
    if (active === 'terms') return <Terms poTerms={poTerms} setPOTerms={setPOTerms} termsUnlocked={termsUnlocked} termsError={termsError} onUnlock={() => unlock('PO Terms & Conditions', () => setTermsUnlocked(true), setTermsError)} onSave={saveTerms} onCancel={() => { setPOTerms(localStorage.getItem(PO_TERMS_KEY) || DEFAULT_PO_TERMS); setTermsUnlocked(false) }} />
    if (active === 'users') return <div style={{ margin: '-18px' }}><UsersAndRights /></div>
    if (active === 'roles') return <RolesPermissions />
    if (active === 'backup') return <BackupExport />
    return <Placeholder title={cards.find(c => c.id === active)?.title} />
  }

  const activeCard = cards.find(c => c.id === active)

  return (
    <div style={{ padding: '28px', overflowY: 'auto', height: '100%', background: '#f7f7f5' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#111827' }}>Settings</h1>
          <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 5 }}>Open each setup area from the cards below.</div>
        </div>
        {saved && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 800, background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 999, padding: '7px 12px' }}>Saved</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
        {cards.map(card => <SettingsCard key={card.id} card={card} onClick={() => setActive(card.id)} />)}
      </div>

      {active && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,0.34)', display: 'grid', placeItems: 'center', padding: 24 }} onMouseDown={e => { if (e.target === e.currentTarget) setActive(null) }}>
          <div style={{ width: active === 'users' || active === 'roles' ? 'min(1120px, 96vw)' : 'min(760px, 94vw)', maxHeight: '88vh', overflow: 'hidden', background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(15,23,42,0.22)', border: '1px solid #eef0f4', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 58, borderBottom: '1px solid #eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>{activeCard?.title}</div>
              <button onClick={() => setActive(null)} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 18, overflowY: 'auto' }}>{renderContent()}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsCard({ card, onClick }) {
  const Icon = card.icon
  return (
    <button onClick={onClick} style={{ textAlign: 'left', minHeight: 145, border: '1px solid #e5e7eb', background: '#fff', borderRadius: 16, padding: 18, cursor: 'pointer', boxShadow: '0 8px 24px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: '#f3f4f6', display: 'grid', placeItems: 'center', color: '#111827' }}><Icon size={21} strokeWidth={1.9} /></div>
        <span style={statusBadgeStyle(card.status)}>{card.status}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, color: '#111827', marginBottom: 5 }}>{card.title}</div>
      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.45 }}>{card.desc}</div>
    </button>
  )
}

function CompanyInfo({ companyInfo, setCompanyField, companyUnlocked, companyError, onUnlock, onSave, onCancel }) {
  return <div>
    <Help text="Printed in the PO header. Layout stays fixed; only text changes." />
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
      <Field label="Company Name"><input value={companyInfo.name} onChange={setCompanyField('name')} disabled={!companyUnlocked} style={inputStyle(companyUnlocked)} /></Field>
      <Field label="Website"><input value={companyInfo.website} onChange={setCompanyField('website')} disabled={!companyUnlocked} style={inputStyle(companyUnlocked)} /></Field>
    </div>
    <Field label="Tagline"><input value={companyInfo.tagline} onChange={setCompanyField('tagline')} disabled={!companyUnlocked} style={inputStyle(companyUnlocked)} /></Field>
    <Field label="Address"><textarea value={companyInfo.address} onChange={setCompanyField('address')} disabled={!companyUnlocked} style={{ ...inputStyle(companyUnlocked), height: 86, padding: 10, lineHeight: 1.45, resize: 'vertical' }} /></Field>
    <Actions unlocked={companyUnlocked} unlockText="Unlock Company Info" saveText="Save Company Info" onUnlock={onUnlock} onSave={onSave} onCancel={onCancel} error={companyError} />
  </div>
}

function Tax({ poTaxRate, setPoTaxRate, onSave }) {
  return <div>
    <Help text="Default sales tax percentage used when creating purchase orders." />
    <Field label="Sales Tax Rate %"><input type="number" min="0" step="0.01" value={poTaxRate} onChange={e => setPoTaxRate(e.target.value)} style={{ ...inputStyle(true), maxWidth: 160 }} /></Field>
    <button className="btn btn-primary btn-sm" onClick={onSave}>Save Tax Rate</button>
  </div>
}

function Terms({ poTerms, setPOTerms, termsUnlocked, termsError, onUnlock, onSave, onCancel }) {
  return <div>
    <Help text="Protected PO terms text used on purchase order printouts." />
    <Field label="PO Terms & Conditions"><textarea value={poTerms} onChange={e => setPOTerms(e.target.value)} disabled={!termsUnlocked} style={{ ...inputStyle(termsUnlocked), minHeight: 180, padding: 10, lineHeight: 1.45, resize: 'vertical' }} /></Field>
    <Actions unlocked={termsUnlocked} unlockText="Unlock Terms" saveText="Save Terms" onUnlock={onUnlock} onSave={onSave} onCancel={onCancel} error={termsError} />
    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>Protected by admin password. Current password: admin.</div>
  </div>
}

function Placeholder({ title }) {
  return <div style={{ border: '1px dashed #d1d5db', borderRadius: 14, padding: 24, background: '#fafafa' }}>
    <div style={{ fontSize: 15, fontWeight: 900, color: '#111827', marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>UI shell is ready. Final saving logic will be connected once the exact Supabase table/fields are finalized.</div>
  </div>
}

function Field({ label, children }) { return <div style={{ marginBottom: 14 }}><label style={labelStyle}>{label}</label>{children}</div> }
function Help({ text }) { return <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.55 }}>{text}</div> }
function Actions({ unlocked, unlockText, saveText, onUnlock, onSave, onCancel, error }) {
  return <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
    {!unlocked ? <button className="btn btn-secondary btn-sm" onClick={onUnlock}>{unlockText}</button> : <><button className="btn btn-primary btn-sm" onClick={onSave}>{saveText}</button><button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button></>}
    {error && <span style={{ fontSize:12, color:'#dc2626', fontWeight:700 }}>{error}</span>}
  </div>
}

const labelStyle = { fontSize: 11, fontWeight: 800, color: '#6b7280', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }
const inputStyle = enabled => ({ width:'100%', height:36, border:'1px solid #e5e7eb', borderRadius:9, padding:'0 10px', fontSize:13, outline: 'none', background: enabled ? '#fff' : '#f9fafb', color: '#111827' })
