import React, { useEffect, useMemo, useState } from 'react'
import { Building2, Calculator, FileText, Users, ShieldCheck, Hash, Ruler, SlidersHorizontal, Download, X, Palette } from 'lucide-react'
import UsersAndRights from './UsersAndRights'
import RolesPermissions from './RolesPermissions'
import BackupExport from './BackupExport'
import { statusBadgeStyle } from '../lib/statusColors'
import { DEFAULT_NUMBERING, DEFAULT_SETTINGS, DEFAULT_STATUS_COLORS, DEFAULT_UOMS, loadList, loadSetting, renderNumberFromConfig, saveList, saveSetting } from '../lib/settingsStore'

const PO_TAX_RATE_KEY = 'nizamia_po_sales_tax_rate'
const PO_TERMS_KEY = 'nizamia_po_terms_conditions'
const COMPANY_INFO_KEY = 'nizamia_company_info'
const DEFAULT_COMPANY_INFO = {
  name: 'NIZAMIA APPARELS',
  tagline: 'Manufacturer & Exporter of Knitted and Woven Garments',
  address: 'RCC14, SHED NR 2, ESTATE AVENUE ROAD, SITE INDUSTRIAL AREA,\nKARACHI 75700, PAKISTAN',
  website: 'www.nizamia.com'
}
const DEFAULT_PO_TERMS = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat. Ut wisi enim ad minim veniam, quis nostrud exerci tation ullamcorper suscipit lobortis nisl ut aliquip ex ea commodo consequat.'
const ADMIN_PASS = 'admin'
const COLOR_OPTIONS = ['green','red','yellow','blue','purple','gray']

export default function Settings() {
  const [active, setActive] = useState(null)
  const [saved, setSaved] = useState(false)
  const [poTaxRate, setPoTaxRate] = useState(() => {
    const saved = parseFloat(localStorage.getItem(PO_TAX_RATE_KEY))
    return Number.isFinite(saved) ? String(saved) : '18'
  })
  const [taxSettings, setTaxSettings] = useState(DEFAULT_SETTINGS.tax)
  const [defaultSettings, setDefaultSettings] = useState(DEFAULT_SETTINGS.defaults)
  const [numbering, setNumbering] = useState(DEFAULT_NUMBERING)
  const [uoms, setUoms] = useState(DEFAULT_UOMS)
  const [uiStatusColors, setUiStatusColors] = useState(DEFAULT_STATUS_COLORS)
  const [poTerms, setPOTerms] = useState(() => localStorage.getItem(PO_TERMS_KEY) || DEFAULT_PO_TERMS)
  const [companyInfo, setCompanyInfo] = useState(() => {
    try { return { ...DEFAULT_COMPANY_INFO, ...JSON.parse(localStorage.getItem(COMPANY_INFO_KEY) || '{}') } }
    catch { return DEFAULT_COMPANY_INFO }
  })
  const [companyUnlocked, setCompanyUnlocked] = useState(false)
  const [companyError, setCompanyError] = useState('')
  const [termsUnlocked, setTermsUnlocked] = useState(false)
  const [termsError, setTermsError] = useState('')

  useEffect(() => {
    loadSetting('tax', DEFAULT_SETTINGS.tax).then(v => { setTaxSettings(v); if (v.sales_tax_rate != null) setPoTaxRate(String(v.sales_tax_rate)) })
    loadSetting('defaults', DEFAULT_SETTINGS.defaults).then(setDefaultSettings)
    loadList('document_numbering', DEFAULT_NUMBERING).then(setNumbering)
    loadList('uoms', DEFAULT_UOMS).then(setUoms)
    loadList('ui_status_colors', DEFAULT_STATUS_COLORS).then(setUiStatusColors)
  }, [])

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1600) }
  const unlock = (label, onSuccess, onError) => {
    const pw = window.prompt(`Admin password required to edit ${label}:`)
    if (pw === ADMIN_PASS) { onSuccess(); onError('') }
    else if (pw !== null) onError('Incorrect admin password.')
  }
  const saveTaxRate = async () => {
    const merged = { ...taxSettings, sales_tax_rate: numVal(poTaxRate, 18) }
    localStorage.setItem(PO_TAX_RATE_KEY, String(merged.sales_tax_rate))
    setPoTaxRate(String(merged.sales_tax_rate))
    setTaxSettings(merged)
    await saveSetting('tax', merged)
    flashSaved()
  }
  const saveTaxFull = async (next) => {
    setTaxSettings(next); setPoTaxRate(String(next.sales_tax_rate ?? 18)); localStorage.setItem(PO_TAX_RATE_KEY, String(next.sales_tax_rate ?? 18)); await saveSetting('tax', next); flashSaved()
  }
  const saveTerms = () => { localStorage.setItem(PO_TERMS_KEY, poTerms); setTermsUnlocked(false); flashSaved() }
  const saveCompany = () => { localStorage.setItem(COMPANY_INFO_KEY, JSON.stringify(companyInfo)); setCompanyUnlocked(false); flashSaved() }
  const setCompanyField = field => e => setCompanyInfo(prev => ({ ...prev, [field]: e.target.value }))

  const cards = [
    { id: 'company', title: 'Company Info', desc: 'PO header company details', icon: Building2, status: 'Active' },
    { id: 'tax', title: 'Tax', desc: 'Default tax, refund and rebate rates', icon: Calculator, status: 'Active' },
    { id: 'terms', title: 'Terms', desc: 'PO terms & conditions', icon: FileText, status: 'Active' },
    { id: 'users', title: 'User Management', desc: 'Users, roles, restrictions and passwords', icon: Users, status: 'Active' },
    { id: 'roles', title: 'Roles & Permissions', desc: 'Structured permission matrix', icon: ShieldCheck, status: 'Active' },
    { id: 'backup', title: 'Backup & Export', desc: 'Download and restore complete app data', icon: Download, status: 'Active' },
    { id: 'numbering', title: 'Document Numbering', desc: 'Job, PO, PD, WO, shipment and invoice series', icon: Hash, status: 'Active' },
    { id: 'uom', title: 'UOM', desc: 'Units of measure setup', icon: Ruler, status: 'Active' },
    { id: 'defaults', title: 'Defaults', desc: 'Factory default values for new records only', icon: SlidersHorizontal, status: 'Active' },
    { id: 'ui', title: 'UI', desc: 'Status colors and interface behavior', icon: Palette, status: 'Active' },
  ]

  const renderContent = () => {
    if (active === 'company') return <CompanyInfo companyInfo={companyInfo} setCompanyField={setCompanyField} companyUnlocked={companyUnlocked} companyError={companyError} onUnlock={() => unlock('Company Information', () => setCompanyUnlocked(true), setCompanyError)} onSave={saveCompany} onCancel={() => { try { setCompanyInfo({ ...DEFAULT_COMPANY_INFO, ...JSON.parse(localStorage.getItem(COMPANY_INFO_KEY) || '{}') }) } catch { setCompanyInfo(DEFAULT_COMPANY_INFO) } setCompanyUnlocked(false) }} />
    if (active === 'tax') return <Tax tax={taxSettings} poTaxRate={poTaxRate} setPoTaxRate={setPoTaxRate} setTax={setTaxSettings} onSave={saveTaxRate} onSaveAll={saveTaxFull} />
    if (active === 'terms') return <Terms poTerms={poTerms} setPOTerms={setPOTerms} termsUnlocked={termsUnlocked} termsError={termsError} onUnlock={() => unlock('PO Terms & Conditions', () => setTermsUnlocked(true), setTermsError)} onSave={saveTerms} onCancel={() => { setPOTerms(localStorage.getItem(PO_TERMS_KEY) || DEFAULT_PO_TERMS); setTermsUnlocked(false) }} />
    if (active === 'users') return <div style={{ margin: '-18px' }}><UsersAndRights /></div>
    if (active === 'roles') return <RolesPermissions />
    if (active === 'backup') return <BackupExport />
    if (active === 'numbering') return <DocumentNumbering rows={numbering} setRows={setNumbering} onSave={async rows => { setNumbering(rows); await saveList('document_numbering', rows); flashSaved() }} />
    if (active === 'uom') return <UOM rows={uoms} setRows={setUoms} onSave={async rows => { setUoms(rows); await saveList('uoms', rows); flashSaved() }} />
    if (active === 'defaults') return <Defaults settings={defaultSettings} setSettings={setDefaultSettings} onSave={async v => { setDefaultSettings(v); await saveSetting('defaults', v); flashSaved() }} />
    if (active === 'ui') return <UISettings rows={uiStatusColors} setRows={setUiStatusColors} onSave={async rows => { setUiStatusColors(rows); await saveList('ui_status_colors', rows); flashSaved() }} />
    return null
  }

  const activeCard = cards.find(c => c.id === active)
  return (
    <div style={{ padding: '28px', overflowY: 'auto', height: '100%', background: '#f7f7f5' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: '#111827' }}>Settings</h1><div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 5 }}>Open each setup area from the cards below.</div></div>
        {saved && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 800, background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 999, padding: '7px 12px' }}>Saved</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>{cards.map(card => <SettingsCard key={card.id} card={card} onClick={() => setActive(card.id)} />)}</div>
      {active && <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,0.34)', display: 'grid', placeItems: 'center', padding: 24 }} onMouseDown={e => { if (e.target === e.currentTarget) setActive(null) }}><div style={{ width: active === 'users' || active === 'roles' ? 'min(1120px, 96vw)' : 'min(920px, 94vw)', maxHeight: '88vh', overflow: 'hidden', background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(15,23,42,0.22)', border: '1px solid #eef0f4', display: 'flex', flexDirection: 'column' }}><div style={{ height: 58, borderBottom: '1px solid #eef0f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}><div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>{activeCard?.title}</div><button onClick={() => setActive(null)} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={16} /></button></div><div style={{ padding: 18, overflowY: 'auto' }}>{renderContent()}</div></div></div>}
    </div>
  )
}

function SettingsCard({ card, onClick }) { const Icon = card.icon; return <button onClick={onClick} style={{ textAlign:'left', minHeight:145, border:'1px solid #e5e7eb', background:'#fff', borderRadius:16, padding:18, cursor:'pointer', boxShadow:'0 8px 24px rgba(15,23,42,0.05)' }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}><div style={{ width:44, height:44, borderRadius:14, background:'#f3f4f6', display:'grid', placeItems:'center', color:'#111827' }}><Icon size={21} strokeWidth={1.9} /></div><span style={statusBadgeStyle(card.status)}>{card.status}</span></div><div style={{ fontSize:15, fontWeight:900, color:'#111827', marginBottom:5 }}>{card.title}</div><div style={{ fontSize:12, color:'#6b7280', lineHeight:1.45 }}>{card.desc}</div></button> }
function CompanyInfo({ companyInfo, setCompanyField, companyUnlocked, companyError, onUnlock, onSave, onCancel }) { return <div><Help text="Printed in the PO header. Layout stays fixed; only text changes." /><div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}><Field label="Company Name"><input value={companyInfo.name} onChange={setCompanyField('name')} disabled={!companyUnlocked} style={inputStyle(companyUnlocked)} /></Field><Field label="Website"><input value={companyInfo.website} onChange={setCompanyField('website')} disabled={!companyUnlocked} style={inputStyle(companyUnlocked)} /></Field></div><Field label="Tagline"><input value={companyInfo.tagline} onChange={setCompanyField('tagline')} disabled={!companyUnlocked} style={inputStyle(companyUnlocked)} /></Field><Field label="Address"><textarea value={companyInfo.address} onChange={setCompanyField('address')} disabled={!companyUnlocked} style={{ ...inputStyle(companyUnlocked), height:86, padding:10, lineHeight:1.45, resize:'vertical' }} /></Field><Actions unlocked={companyUnlocked} unlockText="Unlock Company Info" saveText="Save Company Info" onUnlock={onUnlock} onSave={onSave} onCancel={onCancel} error={companyError} /></div> }
function Tax({ tax, poTaxRate, setPoTaxRate, setTax, onSave, onSaveAll }) { const merged={...tax, sales_tax_rate:numVal(poTaxRate,18)}; const set=k=>e=>setTax(prev=>({...prev,[k]:numVal(e.target.value,0)})); return <div><Help text="Controls default PO sales tax, STR refund and export rebate. Values remain overrideable inside shipment/payment flows." /><div style={grid3}><Field label="PO Sales Tax %"><input type="number" min="0" step="0.01" value={poTaxRate} onChange={e=>setPoTaxRate(e.target.value)} style={inputStyle(true)} /></Field><Field label="Sales Tax Refund %"><input type="number" min="0" step="0.01" value={tax.sales_tax_refund_percent ?? 100} onChange={set('sales_tax_refund_percent')} style={inputStyle(true)} /></Field><Field label="Rebate %"><input type="number" min="0" step="0.01" value={tax.rebate_percent ?? 1} onChange={set('rebate_percent')} style={inputStyle(true)} /></Field></div><div style={rowActions}><button className="btn btn-primary btn-sm" onClick={()=>onSaveAll(merged)}>Save Tax Settings</button><button className="btn btn-secondary btn-sm" onClick={onSave}>Save PO Tax Only</button></div></div> }
function Terms({ poTerms, setPOTerms, termsUnlocked, termsError, onUnlock, onSave, onCancel }) { return <div><Help text="Protected PO terms text used on purchase order printouts." /><Field label="PO Terms & Conditions"><textarea value={poTerms} onChange={e => setPOTerms(e.target.value)} disabled={!termsUnlocked} style={{ ...inputStyle(termsUnlocked), minHeight:180, padding:10, lineHeight:1.45, resize:'vertical' }} /></Field><Actions unlocked={termsUnlocked} unlockText="Unlock Terms" saveText="Save Terms" onUnlock={onUnlock} onSave={onSave} onCancel={onCancel} error={termsError} /><div style={{ fontSize:11, color:'#9ca3af', marginTop:8 }}>Protected by admin password. Current password: admin.</div></div> }
function DocumentNumbering({ rows, setRows, onSave }) { const update=(i,k,v)=>setRows(rows.map((r,idx)=>idx===i?{...r,[k]:v}:r)); const add=()=>setRows([...rows,{ doc_type:'custom', label:'Custom', prefix:'DOC', pattern:'{PREFIX}-{YY}{SEASON}-{SEQ}', seq_pad:3, next_number:1, enabled:true }]); return <div><Help text="Controls how the system generates document numbers. Job number generation now reads this config." /><Table headers={['Type','Label','Prefix','Pattern','Pad','Next','Preview','Active','']} rows={rows.map((r,i)=><tr key={i}><Td><input value={r.doc_type} onChange={e=>update(i,'doc_type',e.target.value)} style={cellInput}/></Td><Td><input value={r.label} onChange={e=>update(i,'label',e.target.value)} style={cellInput}/></Td><Td><input value={r.prefix} onChange={e=>update(i,'prefix',e.target.value)} style={cellInput}/></Td><Td><input value={r.pattern} onChange={e=>update(i,'pattern',e.target.value)} style={{...cellInput,minWidth:230}}/></Td><Td><input type="number" value={r.seq_pad} onChange={e=>update(i,'seq_pad',numVal(e.target.value,3))} style={cellInput}/></Td><Td><input type="number" value={r.next_number} onChange={e=>update(i,'next_number',numVal(e.target.value,1))} style={cellInput}/></Td><Td><span style={{ fontFamily:'monospace', fontWeight:800 }}>{renderNumberFromConfig(r)}</span></Td><Td><input type="checkbox" checked={r.enabled!==false} onChange={e=>update(i,'enabled',e.target.checked)}/></Td><Td><button className="btn btn-secondary btn-sm" onClick={()=>setRows(rows.filter((_,idx)=>idx!==i))}>Delete</button></Td></tr>)} /><div style={rowActions}><button className="btn btn-secondary btn-sm" onClick={add}>Add Series</button><button className="btn btn-primary btn-sm" onClick={()=>onSave(rows)}>Save Numbering</button></div></div> }
function UOM({ rows, setRows, onSave }) { const update=(i,k,v)=>setRows(rows.map((r,idx)=>idx===i?{...r,[k]:v}:r)); const add=()=>setRows([...rows,{ code:'NEW', name:'New Unit', type:'General', is_active:true }]); return <div><Help text="Manage units used in BOM, purchasing and order workflows." /><Table headers={['Code','Name','Type','Active','']} rows={rows.map((r,i)=><tr key={i}><Td><input value={r.code} onChange={e=>update(i,'code',e.target.value.toUpperCase())} style={cellInput}/></Td><Td><input value={r.name} onChange={e=>update(i,'name',e.target.value)} style={cellInput}/></Td><Td><input value={r.type} onChange={e=>update(i,'type',e.target.value)} style={cellInput}/></Td><Td><input type="checkbox" checked={r.is_active!==false} onChange={e=>update(i,'is_active',e.target.checked)}/></Td><Td><button className="btn btn-secondary btn-sm" onClick={()=>setRows(rows.filter((_,idx)=>idx!==i))}>Delete</button></Td></tr>)} /><div style={rowActions}><button className="btn btn-secondary btn-sm" onClick={add}>Add UOM</button><button className="btn btn-primary btn-sm" onClick={()=>onSave(rows)}>Save UOMs</button></div></div> }
function Defaults({ settings, setSettings, onSave }) { const set=k=>e=>setSettings(prev=>({...prev,[k]:e.target.value})); return <div><Help text="Factory defaults apply only to new records/workflows. Existing data is never changed." /><div style={grid3}><Field label="Default Currency"><select value={settings.currency || 'USD'} onChange={set('currency')} style={inputStyle(true)}><option>USD</option><option>EUR</option><option>GBP</option></select></Field><Field label="Fallback Payment Terms Days"><input type="number" value={settings.payment_terms_days ?? 50} onChange={e=>setSettings(prev=>({...prev,payment_terms_days:numVal(e.target.value,50)}))} style={inputStyle(true)}/></Field><Field label="Default PKR Rate"><input type="number" value={settings.pkr_rate ?? 278.5} onChange={e=>setSettings(prev=>({...prev,pkr_rate:numVal(e.target.value,278.5)}))} style={inputStyle(true)}/></Field><Field label="Default Shipment Status"><input value={settings.shipment_status || 'Open'} onChange={set('shipment_status')} style={inputStyle(true)}/></Field></div><button className="btn btn-primary btn-sm" onClick={()=>onSave(settings)}>Save Defaults</button></div> }
function UISettings({ rows, setRows, onSave }) { const update=(i,k,v)=>setRows(rows.map((r,idx)=>idx===i?{...r,[k]:v}:r)); const add=()=>setRows([...rows,{ module:'custom', status_value:'Status', color:'gray' }]); const grouped=useMemo(()=>rows, [rows]); return <div><Help text="Controls status badge colors. Status text remains unchanged." /><Table headers={['Table / Module','Status Text','Color','Preview','']} rows={grouped.map((r,i)=><tr key={i}><Td><input value={r.module} onChange={e=>update(i,'module',e.target.value)} style={cellInput}/></Td><Td><input value={r.status_value} onChange={e=>update(i,'status_value',e.target.value)} style={cellInput}/></Td><Td><select value={r.color} onChange={e=>update(i,'color',e.target.value)} style={cellInput}>{COLOR_OPTIONS.map(c=><option key={c}>{c}</option>)}</select></Td><Td><span style={statusBadgeStyle(r.status_value)}>{r.status_value}</span></Td><Td><button className="btn btn-secondary btn-sm" onClick={()=>setRows(rows.filter((_,idx)=>idx!==i))}>Delete</button></Td></tr>)} /><div style={rowActions}><button className="btn btn-secondary btn-sm" onClick={add}>Add Status Color</button><button className="btn btn-primary btn-sm" onClick={()=>onSave(rows)}>Save UI Settings</button></div></div> }
function Table({ headers, rows }) { return <div style={{ overflowX:'auto', border:'1px solid #eef0f4', borderRadius:12 }}><table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}><thead><tr>{headers.map(h=><th key={h} style={{ textAlign:'left', padding:10, background:'#fafafa', borderBottom:'1px solid #eef0f4', color:'#6b7280', fontWeight:900 }}>{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div> }
function Td({ children }) { return <td style={{ padding:8, borderBottom:'1px solid #f3f4f6', verticalAlign:'middle' }}>{children}</td> }
function Field({ label, children }) { return <div style={{ marginBottom:14 }}><label style={labelStyle}>{label}</label>{children}</div> }
function Help({ text }) { return <div style={{ fontSize:12, color:'#6b7280', marginBottom:16, lineHeight:1.55 }}>{text}</div> }
function Actions({ unlocked, unlockText, saveText, onUnlock, onSave, onCancel, error }) { return <div style={rowActions}>{!unlocked ? <button className="btn btn-secondary btn-sm" onClick={onUnlock}>{unlockText}</button> : <><button className="btn btn-primary btn-sm" onClick={onSave}>{saveText}</button><button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button></>}{error && <span style={{ fontSize:12, color:'#dc2626', fontWeight:700 }}>{error}</span>}</div> }
const numVal=(v,f=0)=>{ const n=parseFloat(v); return Number.isFinite(n)?n:f }
const rowActions={ display:'flex', gap:8, alignItems:'center', marginTop:12, flexWrap:'wrap' }
const grid3={ display:'grid', gridTemplateColumns:'repeat(3, minmax(150px, 1fr))', gap:12 }
const labelStyle={ fontSize:11, fontWeight:800, color:'#6b7280', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:.4 }
const inputStyle=enabled=>({ width:'100%', height:36, border:'1px solid #e5e7eb', borderRadius:9, padding:'0 10px', fontSize:13, outline:'none', background:enabled?'#fff':'#f9fafb', color:'#111827' })
const cellInput={ width:'100%', minWidth:90, height:32, border:'1px solid #e5e7eb', borderRadius:8, padding:'0 8px', fontSize:12, background:'#fff' }
