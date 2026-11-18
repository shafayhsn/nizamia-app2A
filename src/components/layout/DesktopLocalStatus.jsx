import React, {useEffect,useState} from 'react'

// Desktop-only visibility: never describe unsynced local edits as uploaded.
function DesktopDraftDetails({ onClose }) {
  const [drafts,setDrafts]=useState(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    fetch('/api/offline/drafts',{cache:'no-store'}).then(async response=>{
      const result=await response.json()
      if(!response.ok)throw Error(result.error||'Drafts unavailable')
      if(active)setDrafts(result.data)
    }).catch(e=>{if(active)setError(e.message)})
    return ()=>{active=false}
  },[])
  return <div role="region" aria-label="Offline draft queue" style={{padding:'10px 14px',borderBottom:'1px solid #cbd5e1',background:'#fff'}}>
    <strong>Offline draft queue (read-only)</strong>
    <button type="button" onClick={onClose} style={{float:'right'}}>Close</button>
    {error?<p>{error}</p>:drafts===null?<p>Loading local drafts…</p>:drafts.length===0?<p>No pending or conflicting drafts for this account.</p>:
      <ul style={{margin:'8px 0',paddingLeft:20,maxHeight:180,overflow:'auto'}}>
        {drafts.map(d=><li key={d.draftId}>{d.table} · {d.recordId} · {d.state} · {d.createdAt}{typeof d.changes?.notes==='string'&&<div style={{whiteSpace:'pre-wrap'}}>{d.changes.notes||'(empty note)'}</div>}</li>)}
      </ul>}
    <small>The desktop app checks queued edits when a cloud session is available.</small>
  </div>
}

const cloudSyncLabel={
  'sign-in-required':'Cloud upload session unavailable',
  offline:'Cloud upload waiting for network',
  checking:'Checking cloud upload queue',
  ready:'Cloud upload queue checked',
  retrying:'Cloud upload will retry',
  conflict:'Cloud upload found a conflict',
  pending:'Cloud upload retained pending edits',
}
export default function DesktopLocalStatus() {
  const [status,setStatus]=useState(null)
  const [detailsOpen,setDetailsOpen]=useState(false)
  const [error,setError]=useState('')
  const [refresh,setRefresh]=useState(0)
  const [connected,setConnected]=useState(typeof navigator==='undefined'?false:navigator.onLine)
  useEffect(()=>{
    const update=()=>setConnected(navigator.onLine)
    window.addEventListener('online',update)
    window.addEventListener('offline',update)
    return ()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}
  },[])
  useEffect(()=>{
    let active=true
    const read=async()=>{
      try{
        const response=await fetch('/api/offline/pending-status',{cache:'no-store'})
        const result=await response.json()
        if(!response.ok)throw Error(result.error||'Local status unavailable')
        if(active){setStatus(result.data);setError('')}
      }catch(e){if(active){setStatus(null);setError(e.message)}}
    }
    read()
    const timer=setInterval(read,5000)
    const onFocus=()=>setRefresh(v=>v+1)
    window.addEventListener('focus',onFocus)
    window.addEventListener('app2a-offline-data-changed',onFocus)
    return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',onFocus);window.removeEventListener('app2a-offline-data-changed',onFocus)}
  },[refresh])
  return <section style={{borderTop:'1px solid #e5e7eb',marginTop:12,paddingTop:12}}>
    <strong>Desktop local database</strong>
    <div role="status" aria-live="polite" style={{margin:'6px 0 8px',color:'#475569',lineHeight:1.5}}>
      {error?'Local database status unavailable: '+error:status?<>
        <div>{status.totalUnsyncedLocalChanges} unsynced local items</div>
        <div>{status.unsyncedDrafts} drafts · {status.draftStates.conflict} conflicts</div>
        <div>{status.syncHistory.applied+status.syncHistory.alreadyApplied} archived draft results</div>
        <div>{cloudSyncLabel[status.cloudSync?.state]||'Cloud sync unavailable'}</div>
        <div>{connected?'Network available':'No network'}</div>
      </>:'Checking desktop database…'}
    </div>
    <div style={{display:'flex',gap:8}}>
    <button type="button" onClick={()=>setRefresh(v=>v+1)} style={{fontSize:11,border:'1px solid #cbd5e1',borderRadius:4,padding:'1px 7px',background:'white',cursor:'pointer'}}>Refresh</button>
    <button type="button" onClick={()=>setDetailsOpen(v=>!v)} style={{fontSize:11,border:'1px solid #cbd5e1',borderRadius:4,padding:'1px 7px',background:'white',cursor:'pointer'}}>{detailsOpen?'Hide drafts':'View drafts'}</button>
    </div>
    {detailsOpen&&<DesktopDraftDetails onClose={()=>setDetailsOpen(false)} />}
  </section>
}

