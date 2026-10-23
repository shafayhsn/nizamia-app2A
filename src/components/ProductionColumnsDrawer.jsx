import React,{useState} from 'react'
import {X,Search,Lock,Plus,GripVertical} from 'lucide-react'

// Mirrors the Orders right-hand column drawer, with independent preferences per tab.
export default function ProductionColumnsDrawer({tab,columns,visible,onChange,onClose}) {
  const pinned=tab==='orders'?['JOB / STATUS','BUYER','STYLE / DESC']:['DATE','JOB #','STYLE']
  const [search,setSearch]=useState('')
  const [drag,setDrag]=useState(null)
  const [viewTab,setViewTab]=useState('columns')
  const [viewName,setViewName]=useState('')
  const key=`app2a.production.saved-views.${tab}`
  const [views,setViews]=useState(()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}})
  const shown=columns.filter(c=>visible.includes(c))
  const hidden=columns.filter(c=>!visible.includes(c))
  const match=c=>c.toLowerCase().includes(search.toLowerCase())
  const toggle=c=>onChange(visible.includes(c)?visible.filter(x=>x!==c):[...visible,c])
  const move=(a,b)=>{if(!a||a===b)return;const arr=[...visible];const i=arr.indexOf(a),j=arr.indexOf(b);if(i<0||j<0)return;arr.splice(i,1);arr.splice(j,0,a);onChange(arr)}
  const saveView=()=>{const name=viewName.trim();if(!name)return;const next={...views,[name]:visible};setViews(next);localStorage.setItem(key,JSON.stringify(next));setViewName('')}
  const deleteView=name=>{const next={...views};delete next[name];setViews(next);localStorage.setItem(key,JSON.stringify(next))}
  const reset=()=>onChange([...columns])
  const itemStyle={display:'flex',alignItems:'center',gap:10,fontSize:13,fontWeight:700,color:'#374151'}
  return <div style={{position:'fixed',inset:0,zIndex:12500,display:'flex',justifyContent:'flex-end'}}>
    <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,.35)'}}/>
    <div style={{position:'relative',height:'100%',width:360,maxWidth:'92vw',background:'#fff',display:'flex',flexDirection:'column',boxShadow:'-10px 0 35px #0002',fontFamily:'var(--font,Arial,sans-serif)'}}>
      <div style={{padding:'20px 22px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:12}}><strong style={{fontSize:18,flex:1}}>Columns</strong><button onClick={reset} style={{border:0,background:'none',color:'#2563eb',fontWeight:700,cursor:'pointer'}}>Reset</button><button onClick={onClose} aria-label="Close" style={{border:0,background:'none',cursor:'pointer',color:'#9ca3af'}}><X size={19}/></button></div>
      <div style={{display:'flex',gap:20,padding:'18px 22px 0',borderBottom:'1px solid #f3f4f6'}}>{[['columns','Manage Columns'],['views','Saved Views']].map(([id,label])=><button key={id} onClick={()=>setViewTab(id)} style={{border:0,background:'none',padding:'0 0 12px',borderBottom:viewTab===id?'2px solid #111827':'2px solid transparent',fontWeight:700,fontSize:12,color:viewTab===id?'#111827':'#9ca3af',cursor:'pointer'}}>{label}</button>)}</div>
      <div style={{padding:22,overflowY:'auto',flex:1}}>{viewTab==='columns'?<>
        <div style={{position:'relative',marginBottom:22}}><Search size={15} style={{position:'absolute',top:11,left:10,color:'#9ca3af'}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search columns..." style={{height:38,width:'100%',boxSizing:'border-box',padding:'0 10px 0 34px',border:'1px solid #e5e7eb',borderRadius:8,background:'#fafafa'}}/></div>
        <div style={{fontSize:12,fontWeight:700,marginBottom:14}}>Pinned <span style={{color:'#9ca3af'}}>(always visible)</span></div>
        <div style={{display:'grid',gap:16,paddingBottom:18,borderBottom:'1px solid #f3f4f6',marginBottom:20}}>{pinned.filter(match).map(c=><div key={c} style={itemStyle}><Plus size={14} color="#9ca3af"/><span style={{flex:1}}>{c}</span><Lock size={14} color="#9ca3af"/></div>)}</div>
        <div style={{fontSize:12,fontWeight:700,marginBottom:14}}>Visible Columns <span style={{color:'#9ca3af'}}>(drag to reorder)</span></div>
        <div style={{display:'grid',gap:8,paddingBottom:18,borderBottom:'1px solid #f3f4f6',marginBottom:20}}>{shown.filter(match).map(c=><div key={c} draggable onDragStart={e=>{setDrag(c);e.dataTransfer.effectAllowed='move'}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();move(drag,c);setDrag(null)}} onDragEnd={()=>setDrag(null)} style={{...itemStyle,border:'1px solid #eef2f7',borderRadius:8,padding:'10px 9px',cursor:'grab',background:drag===c?'#f8fafc':'#fff'}}><input type="checkbox" checked onChange={()=>toggle(c)} style={{accentColor:'#111827'}}/><span style={{flex:1}}>{c}</span><GripVertical size={16} color="#9ca3af"/></div>)}</div>
        <div style={{fontSize:12,fontWeight:700,marginBottom:14}}>Hidden Columns</div><div style={{display:'grid',gap:14}}>{hidden.filter(match).map(c=><label key={c} style={{...itemStyle,color:'#6b7280',cursor:'pointer'}}><input type="checkbox" checked={false} onChange={()=>toggle(c)}/>{c}</label>)}{hidden.length===0&&<span style={{fontSize:12,color:'#9ca3af'}}>No hidden columns.</span>}</div>
      </>:<><div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Save current view</div><div style={{display:'flex',gap:6,marginBottom:20}}><input value={viewName} onChange={e=>setViewName(e.target.value)} placeholder="View name" style={{flex:1,minWidth:0,border:'1px solid #e5e7eb',borderRadius:7,padding:9}}/><button onClick={saveView} disabled={!viewName.trim()} style={{background:'#111827',color:'#fff',border:0,borderRadius:7,padding:'0 12px',cursor:'pointer'}}>Save</button></div>{Object.entries(views).map(([name,cols])=><div key={name} style={{display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid #f3f4f6',padding:'10px 0'}}><button onClick={()=>{onChange(cols.filter(c=>columns.includes(c)));setViewTab('columns')}} style={{border:0,background:'none',flex:1,textAlign:'left',cursor:'pointer',fontWeight:600}}>{name}</button><button onClick={()=>deleteView(name)} style={{border:0,background:'none',color:'#dc2626',cursor:'pointer'}}>Delete</button></div>)}{!Object.keys(views).length&&<p style={{color:'#9ca3af',fontSize:12}}>No saved views yet.</p>}</>}</div>
      <div style={{padding:18,borderTop:'1px solid #f3f4f6'}}><button onClick={onClose} style={{width:'100%',height:38,border:0,borderRadius:7,background:'#111',color:'#fff',cursor:'pointer'}}>Done</button></div>
    </div>
  </div>
}
