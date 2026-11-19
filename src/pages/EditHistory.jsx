import React,{useEffect,useState} from 'react'
import { accountRequest } from '../lib/accounts'

export default function EditHistory(){
  const [rows,setRows]=useState([])
  const [before,setBefore]=useState(null)
  const [busy,setBusy]=useState(true)
  const [more,setMore]=useState(false)
  const [error,setError]=useState('')
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{
    let current=true
    setBusy(true);setError('')
    accountRequest('accountHistory',{beforeId:before}).then(({data})=>{
      if(!current)return
      setRows(previous=>before?[...previous,...data]:data)
      setMore(data.length===100)
    }).catch(e=>{if(current)setError(e.message)}).finally(()=>{if(current)setBusy(false)})
    return ()=>{current=false}
  },[before,attempt])
  return <section aria-label="Edit history" style={{maxHeight:'60vh',overflow:'auto'}}>
    {error&&<p role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>Retry</button></p>}
    <table className="data-table"><thead><tr><th>Saved at</th><th>User</th><th>Record</th><th>Change</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.event_id}>
      <td>{new Date(r.saved_at).toLocaleString()}</td><td>{r.username}<small style={{display:'block'}}>{r.source}</small></td>
      <td>{r.table_name.replaceAll('_',' ')}<small style={{display:'block'}}>{r.record_id}</small></td>
      <td>{r.operation.toLowerCase()} · {r.fields.join(', ')}{(r.stage_before||r.stage_after)&&<div>{r.stage_before||'—'} → {r.stage_after||'—'}</div>}</td>
    </tr>)}</tbody></table>
    {busy&&<p>Loading edits…</p>}
    {!busy&&!error&&!rows.length&&<p>No edits recorded yet.</p>}
    {!busy&&!error&&more&&<button className="btn btn-secondary" onClick={()=>setBefore(rows.at(-1).event_id)}>Show older edits</button>}
  </section>
}
