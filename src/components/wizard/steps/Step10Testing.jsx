import React, { useCallback, useEffect, useState } from 'react'

const cell = { padding:'10px 12px', borderBottom:'1px solid #e5e7eb', fontSize:12, textAlign:'left' }
const input = { width:'100%', padding:'7px 9px', border:'1px solid #d9dee8', borderRadius:6, fontSize:12 }

export default function Step10Testing({ orderId, registerSave, onSaved }) {
  const [sources, setSources] = useState([])
  const [selected, setSelected] = useState({})
  const [persisted, setPersisted] = useState([])
  const [names, setNames] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!orderId) return
    let active = true
    setLoading(true)
    Promise.all([
      fetch('/api/oms?action=testing',{credentials:'same-origin'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not load testing data');return j}),
      Promise.all([
        import('../../../lib/supabase').then(({supabase})=>supabase.from('bom_items').select('id,name,category,specification,detail,unit').eq('order_id',orderId)),
        import('../../../lib/supabase').then(({supabase})=>supabase.from('samples').select('id,sample_number,sample_type,size,color,status').eq('order_id',orderId))
      ])
    ]).then(([data,[bom,samples]])=>{
      if(!active)return
      if(bom.error||samples.error)throw new Error(bom.error?.message||samples.error?.message)
      const rows=[
        ...(bom.data||[]).map(x=>({key:'bom:'+x.id,source_type:'bom',source_id:x.id,name:x.name||x.category||'BOM item',detail:[x.specification,x.detail].filter(Boolean).join(' · ')})),
        ...(samples.data||[]).map(x=>({key:'sample:'+x.id,source_type:'sample',source_id:x.id,name:x.sample_number||x.sample_type||'Sample',detail:[x.sample_type,x.size,x.color].filter(Boolean).join(' · ')}))
      ]
      const chosen={},tests={}
      const existing=(data.requirements||[]).filter(x=>x.order_id===orderId)
      for(const x of existing){chosen[x.source_type+':'+x.source_id]=x;tests[x.source_type+':'+x.source_id]=x.test_name||''}
      setSources(rows);setSelected(chosen);setPersisted(existing);setNames(tests);setError('')
    }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[orderId])

  const save=useCallback(async()=>{
    if(!orderId)throw new Error('Create the order before adding testing requirements.')
    const rows=sources.filter(s=>selected[s.key]).map(s=>({source_type:s.source_type,source_id:s.source_id,test_name:names[s.key]||''}))
    const response=await fetch('/api/oms',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'testingSave',orderId,rows})})
    const result=await response.json()
    if(!response.ok){setError(result.error||'Could not save testing requirements');throw new Error(result.error||'Save failed')}
    setError('')
    onSaved?.(orderId,{step_testing:true})
  },[orderId,sources,selected,names,onSaved])

  useEffect(()=>{registerSave(save)},[registerSave,save])

  const toggle = row => setSelected(prev=> {
    const next={...prev}
    if(next[row.key]) { if(next[row.key].status!=='awaiting_order') return prev; delete next[row.key] }
    else next[row.key]={source_type:row.source_type,source_id:row.source_id,status:'awaiting_order'}
    return next
  })

  return <div>
    <h2 style={{fontSize:17,fontWeight:700,margin:'0 0 6px'}}>Testing Requirements</h2>
    <p style={{fontSize:12,color:'#64748b',margin:'0 0 18px'}}>Select materials from BOM and samples for laboratory testing. Enter an optional test name. Save & Continue makes these available under Purchasing → Testing.</p>
    {error&&<div role="alert" style={{color:'#b91c1c',background:'#fef2f2',padding:12,borderRadius:7,marginBottom:12}}>{error}</div>}
    {loading?<p>Loading BOM and sampling records…</p>:<div style={{border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead style={{background:'#f8fafc'}}><tr>{['Select','Source','Item / Specification','Test Name (optional)','Status'].map(x=><th key={x} style={cell}>{x}</th>)}</tr></thead>
        <tbody>{sources.map(s=><tr key={s.key}>
          <td style={cell}><input type="checkbox" checked={!!selected[s.key]} disabled={!!selected[s.key]&&selected[s.key].status!=='awaiting_order'} onChange={()=>toggle(s)}/></td>
          <td style={cell}>{s.source_type==='bom'?'BOM':'Sampling'}</td>
          <td style={cell}><strong>{s.name}</strong><div style={{color:'#64748b',marginTop:3}}>{s.detail||'—'}</div></td>
          <td style={cell}><input style={input} value={names[s.key]||''} disabled={!selected[s.key]||selected[s.key].status!=='awaiting_order'} onChange={e=>setNames(v=>({...v,[s.key]:e.target.value}))} placeholder="e.g. Colour fastness"/></td>
          <td style={cell}>{selected[s.key]?.status==='ordered'?'Ordered':selected[s.key]?'Awaiting order':'—'}</td>
        </tr>)}</tbody>
      </table>
      {!sources.length&&<div style={{padding:20,textAlign:'center',color:'#64748b'}}>No BOM items or samples found for this order.</div>}
    </div>}
  </div>
}
