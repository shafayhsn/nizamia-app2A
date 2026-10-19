from pathlib import Path
p=Path('src/components/layout/Topbar.jsx');s=p.read_text();s=s.replace('function useSyncStatus() {','function useSyncStatus() {');s=s.replace("  return status\n}","  return {status,snapshot}\n}",1);s=s.replace("  const syncStatus = useSyncStatus()","  const {status:syncStatus,snapshot:syncInfo} = useSyncStatus()\n  const [syncOpen,setSyncOpen]=useState(false)\n  const [syncNow,setSyncNow]=useState(Date.now())\n  useEffect(()=>{const id=setInterval(()=>setSyncNow(Date.now()),15000);return()=>clearInterval(id)},[])")
s=s.replace("    online:  { icon: Cloud,        color: '#64748b', bg: '#f1f5f9', label: 'Connected' },","    online:  { icon: Cloud, color: '#16a34a', bg: '#f0fdf4', label: 'Connected' },")
start=s.index('      <div onClick={()=>syncStatus===\'error\'&&resetSyncError()}')
end=s.index("\n\n      <div style={{ position: 'relative' }}>",start)
new='''      <div style={{position:'relative',marginRight:6}}>
        <button onClick={()=>setSyncOpen(v=>!v)} aria-expanded={syncOpen} aria-label="Supabase sync status" style={{display:'flex',alignItems:'center',gap:5,padding:'3px 8px',borderRadius:6,background:syncConfig.bg,border:'none',cursor:'pointer'}}>
          <syncConfig.icon size={13} color={syncConfig.color} style={syncStatus==='syncing'?{animation:'spin 1s linear infinite'}:{}}/>
          <span style={{fontSize:10,fontWeight:700,color:syncConfig.color}}>{syncConfig.label}</span>
        </button>
        {syncOpen&&<>
          <div onClick={()=>setSyncOpen(false)} style={{position:'fixed',inset:0,zIndex:90}}/>
          <div role="dialog" aria-label="Supabase Sync Status" style={{position:'absolute',top:35,right:0,zIndex:91,width:275,padding:15,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 12px 35px #0002',fontSize:12}}>
            <div style={{fontWeight:750,marginBottom:12}}>Supabase Sync Status</div>
            <div style={{display:'flex',alignItems:'center',gap:7,color:syncConfig.color,fontWeight:700,marginBottom:12}}><syncConfig.icon size={15}/>{syncConfig.label}</div>
            <div style={{background:'#f8fafc',padding:10,borderRadius:7}}>
              <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>Last successful save (this browser session)</div>
              <div style={{fontSize:15,fontWeight:750}}>{syncInfo.lastSaved ? (()=>{const secs=Math.max(0,Math.floor((syncNow-new Date(syncInfo.lastSaved).getTime())/1000));return secs<60?'Just now':secs<3600?`${Math.floor(secs/60)} min ago`:`${Math.floor(secs/3600)} hr ago`})():'No recent save recorded'}</div>
              {syncInfo.lastSaved&&<div style={{fontSize:10,color:'#64748b',marginTop:4}}>{new Date(syncInfo.lastSaved).toLocaleTimeString()}</div>}
            </div>
            {syncStatus==='error'&&<button onClick={()=>{resetSyncError();setSyncOpen(false)}} style={{marginTop:10,border:'1px solid #e5e7eb',borderRadius:6,padding:7,background:'#fff',cursor:'pointer'}}>Dismiss warning</button>}
            <div style={{color:'#94a3b8',fontSize:10,marginTop:10}}>Shows confirmed writes tracked by this browser, not changes made by other employees.</div>
          </div>
        </>}
      </div>'''
s=s[:start]+new+s[end:]
p.write_text(s)
