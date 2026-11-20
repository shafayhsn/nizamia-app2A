import React, { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { PoReceivingDialog, receivingDate } from '../components/purchasing/StoreReceiving'
import './hrAttendance.css'

const stages = ['Not Started','Pattern','Cutting','Stitching','Washing','Finishing','Ready']
const departments = ['Cutting','Stitching','Washing','Back Process','Finishing','Packing','Embroidery','Printing','Other']
const movementDepartments = ['Washing','Embroidery','Printing','Other']
const initialEntry = () => ({department:'Stitching', movement:'completed', date:receivingDate(), place:'', quantity:''})
const listActions = {production_incharge:'staffProductionList',sample_room:'staffSamplingList',storekeeper:'staffReceivingList'}

async function request(action,fields) {
  const path = location.protocol==='app2a:' ? '/api/offline/staff-workspace' : '/api/oms'
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...fields})})
  const result=await response.json()
  if(!response.ok)throw Error(result.error || 'Could not complete this request.')
  return result
}

export default function StaffWorkspace({user,title}) {
  const [rows,setRows]=useState([]),[selected,setSelected]=useState('')
  const [query,setQuery]=useState(''),[change,setChange]=useState(0)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  const [receiving,setReceiving]=useState(null),[stage,setStage]=useState('')
  const [entry,setEntry]=useState(initialEntry)
  const pending=useRef(null)
  const role=String(user.role).toLowerCase()
  const production=role==='production_incharge', sampling=role==='sample_room'
  const row=rows.find(item=>item.id===selected)
  const dispatched = row && ['Dispatched','Delivered'].includes(row.dispatch_status)
  const filtered=rows.filter(item=>Object.values(item).some(value=>String(value??'').toLowerCase().includes(query.trim().toLowerCase())))
  useEffect(()=>{
    let active=true
    setLoading(true)
    async function read(){
      const result=[]
      let afterId=null
      for(;;){
        const {data}=await request(listActions[role],{afterId})
        if(!active)return
        result.push(...data)
        if(data.length<100)break
        const next=data.at(-1).id
        if(next===afterId)throw Error('Could not advance to the next page.')
        afterId=next
      }
      if(active)setRows(result)
    }
    read().catch(err=>{if(active)setError(err.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[role,change])

  async function perform(task) {
    if(busy)return
    setError('');setNotice('');setBusy(true)
    try { await task() } catch(err) { setError(err.message) } finally { setBusy(false) }
  }
  async function save(action,fields,message) {
    const fingerprint=JSON.stringify([action,fields])
    if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,operation:crypto.randomUUID()}
    await request(action,{...fields,operation:pending.current.operation})
    pending.current=null
    setNotice(message)
    setChange(n=>n+1)
  }
  function downloadProgram() {
    const desktop=location.protocol==='app2a:'
    const popup=desktop?null:window.open('','_blank','width=1000,height=800')
    if(!desktop&&!popup){setError('Allow pop-ups to open the sampling program.');return}
    perform(async()=>{
      try{
        const result=await request('staffSamplingProgram',{sampleId:row.id})
        const {buildSampleProgramHTML,printSamplingHTML}=await import('../lib/sampleProgramPrint')
        const html=await buildSampleProgramHTML(result.row,{...result,scoped:true,printedBy:user.username})
        await printSamplingHTML(html,row.sample_number+' Sampling Program',popup)
      }catch(err){popup?.close();throw err}
    })
  }

  const headers=production?['Job','Style','PO','Wash','Size group']:sampling?['Sample','Type','Version','Stage']:['Purchase order','Supplier','Status','Due date']
  const values=production?['job_number','style_number','po_number','wash','size_group']:
    sampling?['sample_number','sample_type','version_label','stage']:['po_number','supplier','status','delivery_date']

  return <section className="hr-page operations-register">
    <header className="hr-heading"><h1 className="app-page-title">{title}</h1></header>
    <div className="operations-tray">
      <label className="operations-search"><Search size={15}/><input aria-label="Search records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search records"/></label>
      <button className="btn btn-secondary" disabled={loading||busy} onClick={()=>{setError('');setChange(n=>n+1)}}>Refresh</button>
      {sampling&&<button className="btn btn-primary" disabled={!row||busy||loading} onClick={downloadProgram}>Download sampling program</button>}
      {!sampling&&!production&&<button className="btn btn-primary" disabled={!row||busy||loading} onClick={()=>setReceiving(row.id)}>Receive selected</button>}
    </div>
    {error&&<p role="alert" className="hr-error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {production&&row&&<form className="hr-form" onSubmit={event=>{
      event.preventDefault()
      perform(async()=>{
        await save('staffProductionLog',{...entry,quantity:Number(entry.quantity),orderId:row.order_id,groupId:row.group_id,colorId:row.id},'Production logged.')
        setEntry(initialEntry())
      })
    }}>
      <label>Department<select value={entry.department} onChange={e=>setEntry({...entry,department:e.target.value,movement:'completed'})}>{departments.map(name=><option key={name}>{name}</option>)}</select></label>
      {movementDepartments.includes(entry.department)&&<label>Movement<select value={entry.movement} onChange={e=>setEntry({...entry,movement:e.target.value})}>
        {['completed','sent','received'].map(value=><option key={value}>{value}</option>)}
      </select></label>}
      <label>Date<input type="date" required value={entry.date} max={receivingDate()} onChange={e=>setEntry({...entry,date:e.target.value})}/></label>
      <label>Production at<input value={entry.place} maxLength={150} onChange={e=>setEntry({...entry,place:e.target.value})}/></label>
      <label>Pieces<input type="number" min="1" max="999999999" step="1" required value={entry.quantity} onChange={e=>setEntry({...entry,quantity:e.target.value})}/></label>
      <button className="btn btn-primary" disabled={busy||loading}>Log production</button>
    </form>}
    {sampling&&row&&!dispatched&&<form className="hr-form" onSubmit={event=>{
      event.preventDefault()
      perform(()=>save('staffSampleStage',{sampleId:row.id,previousStage:row.stage??null,stage},'Sample status updated.'))
    }}>
      <label>Sample status<select value={stage} onChange={e=>setStage(e.target.value)}>{stages.map(value=><option key={value}>{value}</option>)}</select></label>
      <button className="btn btn-primary" disabled={busy||loading||stage===(row.stage||'Not Started')}>Update status</button>
    </form>}
    <div className="hr-table-wrap"><table className="fulfillment-table">
      <thead><tr><th scope="col">Select</th>{headers.map(value=><th scope="col" key={value}>{value}</th>)}</tr></thead>
      <tbody>{filtered.map(item=><tr key={item.id} className={selected===item.id?'selected':''}>
        <td><input type="radio" name="staff-record" aria-label={'Select '+(item.sample_number||item.po_number||item.style_number||item.id)}
          checked={selected===item.id} disabled={busy||loading} onChange={()=>{setSelected(item.id);setStage(item.stage||'Not Started');setError('');setNotice('')}}/></td>
        {values.map(key=><td key={key}>{item[key]??(key==='stage'?'Not Started':'—')}</td>)}
      </tr>)}</tbody>
    </table>{!filtered.length&&<p className="hr-empty">{loading?'Loading records…':'No matching records.'}</p>}</div>
    {receiving&&<PoReceivingDialog id={receiving} receiving onClose={()=>setReceiving(null)}
      onSaved={()=>{setReceiving(null);setNotice('Receipt posted.');setChange(n=>n+1)}}/>}
  </section>
}
