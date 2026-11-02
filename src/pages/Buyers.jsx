import MinimizableModal from '../components/ui/MinimizableModal'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Edit2, Trash2, Users, Search, RefreshCcw, Settings, ListFilter, CheckSquare } from 'lucide-react'
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
  const [addresses,setAddresses]=useState([])
  const [contacts,setContacts]=useState([])
  const [detailError,setDetailError]=useState('')
  const [detailsReady,setDetailsReady]=useState(false)
  const [saving, setSaving] = useState(false)
  const [selected,setSelected] = useState(new Set())
  const [showColumns,setShowColumns] = useState(false)
  const [columns,setColumns] = useState({contact:true,country:true,currency:true,terms:true,incoterms:true,ship:true})

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

  const detailsRequest=async(type,buyerId,rows)=>{
    const qs='?action='+(buyerId?'list':'check')+'&type='+type+(buyerId?'&buyerId='+encodeURIComponent(buyerId):'')
    const response=await fetch('/api/oms'+(rows? '':qs),rows?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync',type,buyerId,rows})}:{})
    const json=await response.json()
    if(!response.ok)throw new Error(json.error||'Unable to access buyer details')
    return json.data||[]
  }
  const openNew = async () => { setEditing(null); setForm({ currency: 'USD', default_ship_mode: 'Sea', default_incoterms: 'FOB', payment_terms_days: 30 }); setAddresses([]);setContacts([]);setDetailError('');setDetailsReady(false);setModal(true); try{await Promise.all([detailsRequest('addresses'),detailsRequest('contacts')]);setDetailsReady(true)}catch(e){setDetailError(e.message)} }
  const openEdit = async (b) => { setEditing(b); setForm({ ...b }); setAddresses([]);setContacts([]);setDetailError('');setDetailsReady(false);setModal(true); try{const [a,c]=await Promise.all([detailsRequest('addresses',b.id),detailsRequest('contacts',b.id)]);setAddresses(a);setContacts(c);setDetailsReady(true)}catch(e){setDetailError(e.message)} }

  const handleSave = async () => {
    if (!form.name?.trim() || saving) return
    if (!detailsReady) {setDetailError('Address and contact records are unavailable. Saving is blocked to prevent partial changes.');return}
    if (addresses.length && addresses.filter(a=>a.is_default).length!==1){setDetailError('Select exactly one default address.');return}
    if (contacts.length && contacts.filter(c=>c.is_default).length!==1){setDetailError('Select exactly one default contact.');return}
    setSaving(true);setDetailError('')
    const {id,created_at,updated_at,...fields}=form
    const saveBody = { ...fields, payment_terms_days: parseInt(form.payment_terms_days, 10) || 0 }
    let res = editing ? await supabase.from('buyers').update(saveBody).eq('id', editing.id).select('id').single() : await supabase.from('buyers').insert([saveBody]).select('id').single()
    if (res.error && /payment_terms_days|schema cache|column/i.test(res.error.message || '')) {
      const { payment_terms_days, ...fallback } = saveBody
      fallback.notes = [fallback.notes, `Payment Terms Days: ${payment_terms_days}`].filter(Boolean).join('\n')
      res = editing ? await supabase.from('buyers').update(fallback).eq('id', editing.id).select('id').single() : await supabase.from('buyers').insert([fallback]).select('id').single()
    }
    if(res.error){setDetailError(res.error.message);setSaving(false);return}
    const buyerId=res.data.id
    const sync=(table,rows)=>detailsRequest(table==='buyer_addresses'?'addresses':'contacts',buyerId,rows)
    try{
      await sync('buyer_addresses',addresses.map((a,i)=>({...a,is_default:addresses.length===1||!!a.is_default})))
      await sync('buyer_contacts',contacts.map((c,i)=>({...c,is_default:contacts.length===1||!!c.is_default})))
      setModal(false);load()
    }catch(e){setDetailError('Buyer saved, but address/contact details could not be saved: '+(e.message||e));}
    finally{setSaving(false)}
  }

  const handleDelete = async (id) => {
    const ok = await confirm('Buyer records cannot be deleted. Deactivate this buyer instead?', { title:'Deactivate Buyer', confirmText:'Deactivate', tone:'danger' })
    if (!ok) return
    await supabase.from('buyers').update({ is_active: false }).eq('id', id)
    load()
  }

  const countries=[...new Set(buyers.map(b=>b.country).filter(Boolean))].sort()
  const visible=buyers.filter(b=>(activity==='all'||(activity==='active'?activeBuyerIds.has(b.id):!activeBuyerIds.has(b.id)))&&(country==='all'||b.country===country)&&[b.name,b.contact_person,b.country,b.email].some(v=>String(v||'').toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>sort==='za'?b.name.localeCompare(a.name):sort==='country'?String(a.country||'').localeCompare(String(b.country||''))||a.name.localeCompare(b.name):a.name.localeCompare(b.name))
  const fields=[['contact','CONTACT'],['country','COUNTRY'],['currency','CURRENCY'],['terms','PAYMENT TERMS'],['incoterms','INCOTERMS'],['ship','SHIP MODE']]
  const allSelected=visible.length>0&&visible.every(b=>selected.has(b.id))
  const toggleSelected=id=>setSelected(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next})
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,background:'#fff',width:'100%'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'12px 20px',borderBottom:'1px solid #e5e7eb',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <h2 style={{fontSize:22,fontWeight:700,margin:'0 6px 0 0'}}>Buyers</h2>
          {[['TOTAL CUSTOMERS',buyers.length,'#111827'],['ACTIVE CUSTOMERS',activeBuyerIds.size,'#059669']].map(([label,n,color])=><div key={label} style={{border:'1px solid #e5e7eb',borderRadius:10,padding:'7px 13px',minWidth:125,background:'#fff',height:58,boxSizing:'border-box'}}><div style={{fontSize:10,fontWeight:700,color:'#90949d',whiteSpace:'nowrap'}}>{label}</div><div style={{fontSize:22,fontWeight:700,color,lineHeight:'27px'}}>{n}</div></div>)}
        </div>
        <button className="btn btn-primary" onClick={openNew} style={{background:'#0b0b0b',color:'#fff',whiteSpace:'nowrap'}}><Plus size={14}/> New Buyer</button>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center',padding:'8px 20px',borderBottom:'1px solid #e5e7eb',flexShrink:0,flexWrap:'wrap'}}>
        <div style={{position:'relative',width:180,flexShrink:1}}><Search size={15} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}}/><input className="input" placeholder="Search Buyers" aria-label="Search buyers" value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',boxSizing:'border-box',paddingLeft:34,height:36}}/></div>
        <select className="select" aria-label="Sort buyers" value={sort} onChange={e=>setSort(e.target.value)} style={{width:155,height:36}}><option value="az">Name (A–Z)</option><option value="za">Name (Z–A)</option><option value="country">Country</option></select>
        <select className="select" aria-label="Country" value={country} onChange={e=>setCountry(e.target.value)} style={{width:135,height:36}}><option value="all">All Countries</option>{countries.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <select className="select" aria-label="Activity" value={activity} onChange={e=>setActivity(e.target.value)} style={{width:145,height:36}}><option value="all">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
          <button className="btn btn-secondary" title="Edit selected buyer" aria-label="Edit selected buyer" disabled={selected.size!==1} onClick={()=>{const buyer=buyers.find(b=>selected.has(b.id));if(buyer)openEdit(buyer)}}><Edit2 size={15}/></button>
          <button className="btn btn-secondary" title="Deactivate selected buyer" aria-label="Deactivate selected buyer" disabled={selected.size!==1} onClick={()=>{const id=[...selected][0];if(id)handleDelete(id)}}><Trash2 size={15}/></button>
          <button className="btn btn-secondary" title="Refresh buyers" aria-label="Refresh buyers" onClick={load}><RefreshCcw size={15}/></button>
          <div style={{position:'relative'}}><button className="btn btn-secondary" title="Table columns" aria-label="Table columns" onClick={()=>setShowColumns(!showColumns)}><Settings size={15}/></button>{showColumns&&<div style={{position:'absolute',right:0,top:40,zIndex:30,background:'#fff',border:'1px solid #e5e7eb',boxShadow:'0 8px 20px #0002',borderRadius:8,padding:12,minWidth:160}}><div style={{fontSize:11,fontWeight:700,marginBottom:8}}>VISIBLE COLUMNS</div>{fields.map(([key,label])=><label key={key} style={{display:'flex',gap:8,alignItems:'center',padding:'5px 0',fontSize:12}}><input type="checkbox" checked={columns[key]} onChange={e=>setColumns(old=>({...old,[key]:e.target.checked}))}/>{label}</label>)}</div>}</div>
        </div>
      </div>
      <div style={{flex:1,minHeight:0,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead style={{position:'sticky',top:0,background:'#f8f9fa',zIndex:1}}><tr>
            <th style={{width:34,padding:'11px 14px'}}><input type="checkbox" aria-label="Select all buyers" checked={allSelected} onChange={()=>setSelected(old=>{const next=new Set(old);visible.forEach(b=>allSelected?next.delete(b.id):next.add(b.id));return next})}/></th>
            <th style={{textAlign:'left',padding:'11px 12px'}}>BUYER / STATUS</th>
            {fields.filter(([key])=>columns[key]).map(([key,label])=><th key={key} style={{textAlign:'left',padding:'11px 12px',whiteSpace:'nowrap'}}>{label}</th>)}
            
          </tr></thead>
          <tbody>{visible.map(b=><tr key={b.id} style={{borderBottom:'1px solid #e9ecef',background:selected.has(b.id)?'#eff6ff':'#fff'}}>
            <td style={{padding:'9px 14px'}}><input type="checkbox" aria-label={'Select '+b.name} checked={selected.has(b.id)} onChange={()=>toggleSelected(b.id)}/></td>
            <td style={{padding:'9px 12px',fontWeight:650,whiteSpace:'nowrap'}}><span style={{display:'inline-flex',alignItems:'center',gap:9}}><span title={activeBuyerIds.has(b.id)?'Open orders':'No open orders'} style={{width:9,height:9,borderRadius:'50%',background:activeBuyerIds.has(b.id)?'#10B981':'#D1D5DB'}}/>{b.name}</span></td>
            {columns.contact&&<td style={{padding:'9px 12px'}}>{b.contact_person||'—'}</td>}
            {columns.country&&<td style={{padding:'10px 12px'}}>{b.country||'—'}</td>}
            {columns.currency&&<td style={{padding:'10px 12px'}}>{b.currency||'—'}</td>}
            {columns.terms&&<td style={{padding:'10px 12px'}}>{b.payment_terms_days?b.payment_terms_days+' days':'—'}</td>}
            {columns.incoterms&&<td style={{padding:'10px 12px'}}>{b.default_incoterms||'—'}</td>}
            {columns.ship&&<td style={{padding:'10px 12px'}}>{b.default_ship_mode||'—'}</td>}
            
          </tr>)}{!visible.length&&<tr><td colSpan={8} style={{textAlign:'center',padding:28}}>No matching buyers.</td></tr>}</tbody>
        </table>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',padding:'10px 20px',fontSize:12,color:'#64748b',borderTop:'1px solid #e5e7eb',flexShrink:0,background:'#f8f9fa'}}><strong>{visible.length} CUSTOMERS</strong><span>{visible.filter(b=>activeBuyerIds.has(b.id)).length} active{selected.size?' · '+selected.size+' selected':''}</span></div>
      {modal && (
        <MinimizableModal title={editing ? 'Edit Buyer' : 'Add New Buyer'} onClose={() => setModal(false)}>
          <div style={{background:'#fff',borderRadius:10,padding:22,width:'min(1080px,calc(100vw - 80px))',maxHeight:'min(76vh,780px)',overflowY:'auto',boxSizing:'border-box'}}>
            <div style={{fontSize:14,fontWeight:650,marginBottom:18}}>Buyer Information</div>
            <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr) minmax(270px,1.15fr)',gap:22}}>
              <div>
                {[[ 'name','Customer Name *'],['country','Country'],['payment_terms_days','Payment Terms (days)'],['currency','Trade Currency'],['default_incoterms','Default Incoterms'],['default_ship_mode','Default Ship Mode']].map(([key,label])=><div key={key} className="form-group"><label>{label}</label>{['currency','default_incoterms','default_ship_mode'].includes(key)?<select className="select" style={{width:'100%'}} value={form[key]||''} onChange={e=>set(key,e.target.value)}>{(key==='currency'?['USD','EUR','GBP']:key==='default_incoterms'?['FOB','CIF','EXW','CFR','DDP']:['Sea','Air','Courier']).map(v=><option key={v} value={v}>{v}</option>)}</select>:<input className="input" style={{width:'100%'}} type={key==='payment_terms_days'?'number':'text'} value={form[key]??''} onChange={e=>set(key,e.target.value)}/>}</div>)}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Default Contact</div>
                {[[ 'contact_person','Attention Person'],['phone','Phone Number'],['email','Email Address']].map(([key,label])=><div key={key} className="form-group"><label>{label}</label><input className="input" style={{width:'100%'}} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></div>)}
                <div style={{fontSize:12,color:'#64748b',lineHeight:1.5}}>Existing buyer contact fields are retained for compatibility. Additional contacts can be managed separately.</div>
              </div>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><strong style={{fontSize:13}}>Additional Addresses / Warehouses</strong><button className="btn btn-secondary btn-sm" onClick={()=>setAddresses(v=>[...v,{label:'',recipient:'',address_line1:'',address_line2:'',city:'',region:'',postal_code:'',country:'',phone:'',email:'',is_default:v.length===0}])}><Plus size={13}/> Add</button></div>
                {addresses.map((ad,i)=><div key={ad.id||i} style={{border:'1px solid #e5e7eb',borderRadius:8,padding:10,marginBottom:8,background:'#fafafa'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:6,alignItems:'center',marginBottom:6}}><strong style={{fontSize:12}}>Address {i+1}</strong><div style={{display:'flex',gap:6,alignItems:'center'}}><label style={{fontSize:11,whiteSpace:'nowrap'}}><input type="radio" name="defaultBuyerAddress" checked={!!ad.is_default} onChange={()=>setAddresses(v=>v.map((x,j)=>({...x,is_default:j===i})))}/> Default</label><button className="btn btn-ghost btn-sm" title="Remove address" onClick={()=>setAddresses(v=>{const next=v.filter((_,j)=>j!==i);if(next.length&&!next.some(x=>x.is_default))next[0]={...next[0],is_default:true};return next})}><Trash2 size={13}/></button></div></div>
                  {[[ 'label','Address name (Warehouse / Office)'],['recipient','Recipient / Company'],['address_line1','Street / Building'],['address_line2','Address line 2'],['city','City'],['region','State / Region'],['postal_code','Postal code'],['country','Country'],['phone','Phone'],['email','Email']].map(([k,placeholder])=><input key={k} className="input" aria-label={placeholder} placeholder={placeholder} style={{width:'100%',marginBottom:5,height:31,fontSize:12}} value={ad[k]||''} onChange={e=>setAddresses(v=>v.map((x,j)=>j===i?{...x,[k]:e.target.value}:x))}/>)}
                </div>)}
                {!addresses.length&&<p style={{fontSize:12,color:'#94a3b8'}}>No saved addresses. Add a warehouse or office for parcel delivery.</p>}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'16px 0 8px'}}><strong style={{fontSize:13}}>Additional Contact Persons</strong><button className="btn btn-secondary btn-sm" onClick={()=>setContacts(v=>[...v,{name:'',designation:'',department:'',phone:'',email:'',is_default:v.length===0}])}><Plus size={13}/> Add</button></div>
                {contacts.map((ct,i)=><div key={ct.id||i} style={{border:'1px solid #e5e7eb',borderRadius:8,padding:10,marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><label style={{fontSize:11}}><input type="radio" name="defaultBuyerContact" checked={!!ct.is_default} onChange={()=>setContacts(v=>v.map((x,j)=>({...x,is_default:j===i})))}/> Default contact</label><button className="btn btn-ghost btn-sm" title="Remove contact" onClick={()=>setContacts(v=>{const next=v.filter((_,j)=>j!==i);if(next.length&&!next.some(x=>x.is_default))next[0]={...next[0],is_default:true};return next})}><Trash2 size={13}/></button></div>
                  {[[ 'name','Full name'],['designation','Designation'],['department','Department'],['phone','Phone'],['email','Email']].map(([k,placeholder])=><input key={k} className="input" aria-label={placeholder} placeholder={placeholder} style={{width:'100%',marginBottom:5,height:31,fontSize:12}} value={ct[k]||''} onChange={e=>setContacts(v=>v.map((x,j)=>j===i?{...x,[k]:e.target.value}:x))}/>)}
                </div>)}
              </div>
            </div>
            {detailError&&<p role="alert" style={{color:'#b91c1c',fontSize:12}}>{detailError}</p>}
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16,borderTop:'1px solid #e5e7eb',paddingTop:14}}>
              <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button><button className="btn btn-primary" disabled={saving||!form.name?.trim()||!detailsReady} onClick={handleSave}>{saving?'Saving...':editing?'Save Changes':'Save Buyer'}</button>
            </div>
          </div>
        </MinimizableModal>
      )}
      <Dialogs />
    </div>
  )
}
