import MinimizableModal from '../components/ui/MinimizableModal'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, Users, Search, RefreshCcw } from 'lucide-react'
import { useAppDialogs } from '../components/ui/AppDialogs'

export default function Buyers() {
  const { confirm, Dialogs } = useAppDialogs()
  const [buyers, setBuyers] = useState([])
  const [activeBuyerIds, setActiveBuyerIds] = useState(new Set())
  const [modal, setModal] = useState(false)
  const pref=(k,d)=>{try{return sessionStorage.getItem('buyers_'+k)||d}catch{return d}}
  const [search,setSearch]=useState(()=>pref('search',''))
  const [sort,setSort]=useState(()=>pref('sort','az'))
  const [country,setCountry]=useState(()=>pref('country','all'))
  const [activity,setActivity]=useState(()=>pref('activity','all'))
  useEffect(()=>{try{Object.entries({search,sort,country,activity}).forEach(([k,v])=>sessionStorage.setItem('buyers_'+k,v))}catch{}},[search,sort,country,activity])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: buyersData }, { data: ordersData }] = await Promise.all([
      supabase.from('buyers').select('*').order('name'),
      supabase.from('orders').select('buyer_id,status').not('buyer_id','is',null),
    ])
    setBuyers(buyersData || [])
    setActiveBuyerIds(new Set((ordersData || []).filter(o=>!['shipped','cancelled','canceled','completed','closed'].includes(String(o.status||'').toLowerCase())).map(o=>o.buyer_id).filter(Boolean)))
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => { setEditing(null); setForm({ currency: 'USD', default_ship_mode: 'Sea', default_incoterms: 'FOB', payment_terms_days: 30 }); setModal(true) }
  const openEdit = (b) => { setEditing(b); setForm({ ...b }); setModal(true) }

  const handleSave = async () => {
    setSaving(true)
    const saveBody = { ...form, payment_terms_days: parseInt(form.payment_terms_days, 10) || 0 }
    let res = editing ? await supabase.from('buyers').update(saveBody).eq('id', editing.id) : await supabase.from('buyers').insert([saveBody])
    if (res.error && /payment_terms_days|schema cache|column/i.test(res.error.message || '')) {
      const { payment_terms_days, ...fallback } = saveBody
      fallback.notes = [fallback.notes, `Payment Terms Days: ${payment_terms_days}`].filter(Boolean).join('\n')
      res = editing ? await supabase.from('buyers').update(fallback).eq('id', editing.id) : await supabase.from('buyers').insert([fallback])
    }
    if (res.error) { alert(res.error.message || 'Could not save buyer'); setSaving(false); return }
    setSaving(false); setModal(false); load()
  }

  const handleDelete = async (id) => {
    const ok = await confirm('Buyer records cannot be deleted. Deactivate this buyer instead?', { title:'Deactivate Buyer', confirmText:'Deactivate', tone:'danger' })
    if (!ok) return
    await supabase.from('buyers').update({ is_active: false }).eq('id', id)
    load()
  }

  const countries=[...new Set(buyers.map(b=>b.country).filter(Boolean))].sort()
  const visible=buyers.filter(b=>(activity==='all'||(activity==='active'?activeBuyerIds.has(b.id):!activeBuyerIds.has(b.id)))&&(country==='all'||b.country===country)&&[b.name,b.contact_person,b.country,b.email].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>sort==='za'?b.name.localeCompare(a.name):sort==='country'?String(a.country||'').localeCompare(String(b.country||''))||a.name.localeCompare(b.name):a.name.localeCompare(b.name))
  return (
    <div className="page-content">
      <div className="section-header" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <h2 style={{margin:0,fontSize:22}}>Buyers</h2>
          {[['TOTAL CUSTOMERS',buyers.length,'#111827'],['ACTIVE CUSTOMERS',activeBuyerIds.size,'#059669']].map(([label,n,color])=><div key={label} style={{border:'1px solid #e5e7eb',borderRadius:10,padding:'8px 14px',minWidth:136,background:'#fff'}}><div style={{fontSize:10,fontWeight:700,color:'#8b919c',whiteSpace:'nowrap'}}>{label}</div><div style={{fontSize:23,fontWeight:700,color}}>{n}</div></div>)}
        </div><button className="btn btn-primary" onClick={openNew}><Plus size={14}/> New Buyer</button>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',margin:'14px 0'}}>
        <div style={{position:'relative',flex:'2 1 240px'}}><Search size={15} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}}/><input className="input" placeholder="Search buyer, contact, country..." aria-label="Search buyers" value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',boxSizing:'border-box',paddingLeft:34}}/></div>
        <select className="select" aria-label="Sort buyers" value={sort} onChange={e=>setSort(e.target.value)} style={{flex:'1 1 125px'}}><option value="az">Name (A–Z)</option><option value="za">Name (Z–A)</option><option value="country">Country</option></select>
        <select className="select" aria-label="Country" value={country} onChange={e=>setCountry(e.target.value)} style={{flex:'1 1 125px'}}><option value="all">All Countries</option>{countries.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <select className="select" aria-label="Activity" value={activity} onChange={e=>setActivity(e.target.value)} style={{flex:'1 1 125px'}}><option value="all">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <button className="btn btn-secondary" title="Refresh" aria-label="Refresh buyers" onClick={load}><RefreshCcw size={16}/></button>
      </div>
      <div className="card"><div className="table-wrap"><table>
        <thead><tr><th>BUYER / STATUS</th><th>CONTACT</th><th>COUNTRY</th><th>CURRENCY</th><th>PAYMENT TERMS</th><th>INCOTERMS</th><th>SHIP MODE</th><th style={{textAlign:'right'}}>ACTIONS</th></tr></thead>
        <tbody>{visible.map(b=><tr key={b.id}>
          <td style={{fontWeight:600}}><span style={{display:'inline-flex',alignItems:'center',gap:8}}><span title={activeBuyerIds.has(b.id)?'Open orders':'No open orders'} style={{width:8,height:8,borderRadius:'50%',background:activeBuyerIds.has(b.id)?'#10B981':'#D1D5DB'}}/>{b.name}</span></td>
          <td>{b.contact_person||'—'}</td><td>{b.country||'—'}</td><td>{b.currency||'—'}</td><td>{b.payment_terms_days?b.payment_terms_days+' days':'—'}</td><td>{b.default_incoterms||'—'}</td><td>{b.default_ship_mode||'—'}</td>
          <td style={{textAlign:'right'}}><button className="btn btn-ghost btn-sm" title="Edit" onClick={()=>openEdit(b)}><Edit2 size={13}/></button><button className="btn btn-ghost btn-sm" title="Deactivate" onClick={()=>handleDelete(b.id)}><Trash2 size={13}/></button></td>
        </tr>)}{!visible.length&&<tr><td colSpan={8} style={{textAlign:'center',padding:28}}>No matching buyers.</td></tr>}</tbody>
      </table></div><div style={{display:'flex',justifyContent:'space-between',padding:'10px 16px',fontSize:12,color:'#64748b',borderTop:'1px solid #e5e7eb'}}><span>{visible.length} buyers</span><span>{visible.filter(b=>activeBuyerIds.has(b.id)).length} active</span></div></div>
      {modal && (
        <MinimizableModal title={editing ? 'Edit Buyer' : 'New Buyer'} onClose={() => setModal(false)}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 480, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18 }}>{editing ? 'Edit Buyer' : 'New Buyer'}</div>
            <div className="form-row form-row-2 form-group"><div><label>Name *</label><input className="input" value={form.name || ''} onChange={e => set('name', e.target.value)} /></div><div><label>Contact Person</label><input className="input" value={form.contact_person || ''} onChange={e => set('contact_person', e.target.value)} /></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Email</label><input className="input" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} /></div><div><label>Phone</label><input className="input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Country</label><input className="input" value={form.country || ''} onChange={e => set('country', e.target.value)} /></div><div><label>Currency</label><select className="select" value={form.currency || 'USD'} onChange={e => set('currency', e.target.value)}>{['USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}</select></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Payment Terms (days after shipment)</label><input className="input" type="number" min="0" value={form.payment_terms_days || ''} onChange={e => set('payment_terms_days', e.target.value)} /></div><div><label>Default Incoterms</label><select className="select" value={form.default_incoterms || ''} onChange={e => set('default_incoterms', e.target.value)}><option value="">—</option>{['FOB','CIF','EXW','CFR','DDP'].map(i => <option key={i}>{i}</option>)}</select></div></div>
            <div className="form-row form-row-2 form-group"><div><label>Default Ship Mode</label><select className="select" value={form.default_ship_mode || ''} onChange={e => set('default_ship_mode', e.target.value)}><option value="">—</option>{['Sea','Air','Courier'].map(m => <option key={m}>{m}</option>)}</select></div><div></div></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </MinimizableModal>
      )}
      <Dialogs />
    </div>
  )
}
