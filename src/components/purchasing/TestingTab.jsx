import React,{useCallback,useEffect,useMemo,useState} from 'react'
import {RefreshCw,FlaskConical,Check,Plus} from 'lucide-react'

const btn={padding:'8px 12px',border:'1px solid #d9dee8',borderRadius:7,background:'#fff',fontSize:12,cursor:'pointer'}
const field={padding:'9px 10px',border:'1px solid #d9dee8',borderRadius:7,background:'#fff',fontSize:12}
const td={padding:'10px 12px',borderBottom:'1px solid #eef0f3',fontSize:12,textAlign:'left'}
const th={...td,background:'#f8fafc',fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase'}
const request=async(options)=>{
 const r=await fetch('/api/oms'+(options?'':'?action=testing'),options?{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(options)}:{credentials:'same-origin'})
 const j=await r.json()
 if(!r.ok)throw new Error(j.error||'Testing request failed')
 return j
}
export default function TestingTab(){
 const [data,setData]=useState({requirements:[],testingOrders:[],suppliers:[],orders:[]})
 const [selected,setSelected]=useState([])
 const [supplier,setSupplier]=useState('')
 const [search,setSearch]=useState('')
 const [status,setStatus]=useState('awaiting_order')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [notes,setNotes]=useState('')
 const [view,setView]=useState('requirements')
 const reload=useCallback(async()=>{setBusy(true);try{setData(await request());setError('')}catch(e){setError(e.message)}finally{setBusy(false)}},[])
 useEffect(()=>{reload()},[reload])
 const ordersById=useMemo(()=>Object.fromEntries(data.orders.map(x=>[x.id,x])),[data.orders])
 const suppliersById=useMemo(()=>Object.fromEntries(data.suppliers.map(x=>[x.id,x])),[data.suppliers])
 const filtered=useMemo(()=>data.requirements.filter(r=>{
  const o=ordersById[r.order_id]||{}
  return (status==='all'||r.status===status)&&[r.item_name,r.test_name,r.specification,o.style_number,o.buyer_name,o.job_number,o.factory_ref].some(x=>String(x||'').toLowerCase().includes(search.toLowerCase()))
 }),[data.requirements,ordersById,status,search])
 const selectable=filtered.filter(x=>x.status==='awaiting_order')
 const selectedIds=new Set(selected)
 const issue=async()=>{
  if(!selected.length||!supplier)return
  setBusy(true);setNotice('')
  try{
   const result=await request({action:'testingIssue',supplierId:supplier,requirementIds:selected,notes})
   setNotice('Testing order '+result.testingOrder.order_number+' created.')
   setSelected([]);setNotes('');setView('orders')
   await reload()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const complete=async(id)=>{
  if(!window.confirm('Mark this testing order and all its requirements completed?'))return
  setBusy(true)
  try{await request({action:'testingComplete',testingOrderId:id});await reload();setNotice('Testing order completed.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0,background:'#fff'}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'15px 24px',borderBottom:'1px solid #e5e7eb',gap:12}}>
   <div style={{display:'flex',alignItems:'center',gap:12}}><FlaskConical size={19}/><strong style={{fontSize:17}}>Testing</strong><span style={{fontSize:12,color:'#64748b'}}>{data.requirements.filter(x=>x.status==='awaiting_order').length} awaiting order</span></div>
   <button style={btn} onClick={reload} disabled={busy}><RefreshCw size={13} style={{verticalAlign:'middle',marginRight:6}}/>Refresh</button>
  </div>
  <div style={{display:'flex',gap:20,padding:'0 24px',borderBottom:'1px solid #e5e7eb'}}>
   {[['requirements','Requirements'],['orders','Testing Orders']].map(([key,label])=><button key={key} onClick={()=>setView(key)} style={{background:'none',border:0,borderBottom:view===key?'2px solid #111827':'2px solid transparent',fontWeight:view===key?700:500,padding:'12px 6px',cursor:'pointer',fontSize:13}}>{label}</button>)}
  </div>
  {error&&<div role="alert" style={{margin:'12px 24px 0',padding:12,color:'#991b1b',background:'#fef2f2',borderRadius:6}}>{error}</div>}
  {notice&&<div style={{margin:'12px 24px 0',padding:12,color:'#166534',background:'#f0fdf4',borderRadius:6}}>{notice}</div>}
  {view==='requirements'?<>
   <div style={{display:'flex',gap:10,alignItems:'center',padding:'12px 24px',flexWrap:'wrap'}}>
    <input aria-label="Search testing requirements" placeholder="Search styles, items, buyer, tests…" style={{...field,minWidth:280}} value={search} onChange={e=>setSearch(e.target.value)}/>
    <select style={field} value={status} onChange={e=>setStatus(e.target.value)}><option value="awaiting_order">Awaiting order</option><option value="ordered">Ordered</option><option value="completed">Completed</option><option value="all">All statuses</option></select>
    <span style={{fontSize:12,color:'#64748b',marginLeft:'auto'}}>{filtered.length} requirements · {selected.length} selected</span>
   </div>
   <div style={{flex:1,overflow:'auto',padding:'0 24px'}}>
    <table style={{width:'100%',borderCollapse:'collapse'}}>
     <thead><tr><th style={th}><input type="checkbox" aria-label="Select all visible awaiting requirements" checked={!!selectable.length&&selectable.every(x=>selectedIds.has(x.id))} onChange={e=>setSelected(e.target.checked?Array.from(new Set([...selected,...selectable.map(x=>x.id)])):selected.filter(id=>!selectable.some(x=>x.id===id)))}/></th>{['Job / Style','Buyer','Source','Item / Specification','Test','Status'].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead>
     <tbody>{filtered.map(r=>{const o=ordersById[r.order_id]||{};return <tr key={r.id}><td style={td}><input type="checkbox" disabled={r.status!=='awaiting_order'} checked={selectedIds.has(r.id)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,r.id]:prev.filter(x=>x!==r.id))}/></td><td style={td}><strong>{o.style_number||'—'}</strong><div style={{color:'#64748b'}}>{o.job_number||'—'} · {o.factory_ref||'—'}</div></td><td style={td}>{o.buyer_name||'—'}</td><td style={td}>{r.source_type==='bom'?'BOM':'Sampling'}</td><td style={td}><strong>{r.item_name}</strong><div style={{color:'#64748b'}}>{r.specification}</div></td><td style={td}>{r.test_name||'—'}</td><td style={td}>{r.status==='awaiting_order'?'Awaiting order':r.status}</td></tr>})}</tbody>
    </table>
    {!filtered.length&&<div style={{padding:24,textAlign:'center',color:'#64748b'}}>No testing requirements match your filters. Add them in Order Wizard → Testing.</div>}
   </div>
   <div style={{display:'flex',gap:10,alignItems:'center',padding:'12px 24px',borderTop:'1px solid #e5e7eb',flexWrap:'wrap'}}>
    <span style={{fontSize:12,fontWeight:700}}>Create Testing Order</span>
    <select aria-label="Testing supplier" style={{...field,minWidth:240}} value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Select Testing supplier…</option>{data.suppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <input style={{...field,minWidth:240,flex:1}} placeholder="Notes (optional)" value={notes} onChange={e=>setNotes(e.target.value)}/>
    <button style={{...btn,background:'#111827',color:'#fff',borderColor:'#111827'}} disabled={busy||!supplier||!selected.length} onClick={issue}><Plus size={13} style={{verticalAlign:'middle',marginRight:6}}/>Issue Order ({selected.length})</button>
   </div>
  </>:<div style={{flex:1,overflow:'auto',padding:'16px 24px'}}>
   <table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Testing Order','Supplier','Issued','Requirements','Status','Action'].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{data.testingOrders.map(o=><tr key={o.id}><td style={td}><strong>{o.order_number}</strong></td><td style={td}>{suppliersById[o.supplier_id]?.name||'—'}</td><td style={td}>{new Date(o.issued_at).toLocaleDateString()}</td><td style={td}>{data.requirements.filter(r=>r.testing_order_id===o.id).map(r=>r.item_name).join(', ')||'—'}</td><td style={td}>{o.status}</td><td style={td}>{o.status==='ordered'&&<button style={btn} disabled={busy} onClick={()=>complete(o.id)}><Check size={12}/> Complete</button>}</td></tr>)}</tbody></table>
   {!data.testingOrders.length&&<p style={{padding:24,textAlign:'center',color:'#64748b'}}>No testing orders yet.</p>}
  </div>}
 </div>
}
