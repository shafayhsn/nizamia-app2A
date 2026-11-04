import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

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
      supabase.from('bom_items').select('id,name,category,specification,detail,unit').eq('order_id',orderId),
      supabase.from('samples').select('id,sample_number,sample_type,size,color,status').eq('order_id',orderId),
      supabase.from('testing_requirements').select('id,source_type,source_id,test_name,status').eq('order_id',orderId),
    ]).then(([bom,samples,existing]) => {
      if (!active) return
      const err = bom.error || samples.error || existing.error
      if (err) { setError(err.message); return }
      const rows = [
        ...(bom.data||[]).map(x=>({ key:'bom:'+x.id, source_type:'bom', source_id:x.id, name:x.name||x.category||'BOM item', detail:[x.specification,x.detail].filter(Boolean).join(' · ') })),
        ...(samples.data||[]).map(x=>({ key:'sample:'+x.id, source_type:'sample', source_id:x.id, name:x.sample_number||x.sample_type||'Sample', detail:[x.sample_type,x.size,x.color].filter(Boolean).join(' · ') })),
      ]
      const chosen = {}, tests = {}
      for (const x of existing.data||[]) { chosen[x.source_type+':'+x.source_id]=x; tests[x.source_type+':'+x.source_id]=x.test_name||'' }
      setSources(rows); setSelected(chosen); setPersisted(existing.data||[]); setNames(tests); setError('')
    }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[orderId])

  const save = useCallback(async () => {
    if (!orderId) throw new Error('Create the order before adding testing requirements.')
    const chosen = sources.filter(s=>selected[s.key])
    const removals = persisted.filter(x=>!chosen.some(s=>s.source_type===x.source_type&&s.source_id===x.source_id))
    if (removals.some(x=>x.status!=='awaiting_order')) throw new Error('An ordered requirement cannot be removed. Request a retest instead.')
    if (removals.length) {
      const {error:e}=await supabase.from('testing_requirements').delete().in('id',removals.map(x=>x.id))
      if(e) throw e
    }
    for(const s of chosen) {
      const prior=selected[s.key]
      const payload={order_id:orderId,source_type:s.source_type,source_id:s.source_id,item_name:s.name,specification:s.detail,test_name:names[s.key]||''}
      if(prior?.id && prior.status!=='awaiting_order') continue
      const query=prior?.id?supabase.from('testing_requirements').update(payload).eq('id',prior.id):supabase.from('testing_requirements').insert(payload)
      const {error:e}=await query
      if(e) throw e
    }
    const {error:e}=await supabase.from('orders').update({step_testing:true}).eq('id',orderId)
    if(e) throw e
    onSaved?.(orderId,{step_testing:true})
  },[orderId,sources,selected,persisted,names,onSaved])

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
