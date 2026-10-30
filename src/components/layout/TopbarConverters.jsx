import React,{useMemo,useState} from 'react'
import {ArrowDownUp,Copy,X,RefreshCw} from 'lucide-react'

const preferred=['Asia/Karachi','Europe/London','America/New_York','Asia/Dubai']
const zoneNames={ 'Asia/Karachi':'Karachi','Europe/London':'London','America/New_York':'New York','Asia/Dubai':'Dubai' }
const zones=[...new Set([...preferred,...(Intl.supportedValuesOf?.('timeZone')||[])])]
const label=z=>zoneNames[z]||z.split('/').slice(1).join(' / ').replaceAll('_',' ')
const parts=(instant,zone)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]))
const wallMs=p=>Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute)
function resolveWall(date,time,zone){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return []
  const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number)
  const target=Date.UTC(y,m-1,d,h,min)
  if(new Date(target).toISOString().slice(0,10)!==date)return []
  const matches=[]
  for(let offset=-14*60;offset<=14*60;offset+=15){
    const instant=new Date(target-offset*60000)
    if(wallMs(parts(instant,zone))===target)matches.push(instant)
  }
  return matches
}
const format=(d,z)=>new Intl.DateTimeFormat('en-GB',{timeZone:z,weekday:'short',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(d)
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const field={width:'100%',boxSizing:'border-box',border:'1px solid #d1d5db',borderRadius:6,padding:'8px',fontSize:12,background:'#fff',color:'#111827'}
export function TimeConverter({initialZone='Europe/London',onClose}){
 const [zone,setZone]=useState(initialZone)
 const [search,setSearch]=useState('')
 const [date,setDate]=useState(today)
 const [time,setTime]=useState('10:00')
 const [reverse,setReverse]=useState(false)
 const [choice,setChoice]=useState(0)
 const from=reverse?'Asia/Karachi':zone,to=reverse?zone:'Asia/Karachi'
 const matches=useMemo(()=>resolveWall(date,time,from),[date,time,from])
 const selected=matches[choice]||matches[0]
 const filtered=zones.filter(z=>(label(z)+' '+z).toLowerCase().includes(search.toLowerCase())).slice(0,70)
 return <div role="dialog" aria-label="Time zone converter" style={{position:'absolute',top:31,left:0,zIndex:91,width:340,maxWidth:'calc(100vw - 24px)',padding:14,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 12px 35px #0002',fontSize:12,color:'#111827'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><strong>Time Zone Converter</strong><button aria-label="Close converter" onClick={onClose} style={{border:0,background:'none',cursor:'pointer'}}><X size={15}/></button></div>
  <div style={{fontSize:11,color:'#64748b',marginBottom:5}}>City / time zone</div>
  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search worldwide cities..." style={{...field,marginBottom:6}}/>
  <select aria-label="Meeting city" value={zone} onChange={e=>{setZone(e.target.value);setChoice(0)}} size={Math.min(4,Math.max(2,filtered.length))} style={{...field,height:Math.min(4,Math.max(2,filtered.length))*24+10,marginBottom:10}}>
   {!filtered.includes(zone)&&<option value={zone}>{label(zone)}</option>}
   {filtered.map(z=><option key={z} value={z}>{label(z)} ({z})</option>)}
  </select>
  <button onClick={()=>{setReverse(v=>!v);setChoice(0)}} style={{...field,cursor:'pointer',marginBottom:10,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><ArrowDownUp size={13}/>{reverse?'Pakistan → '+label(zone):label(zone)+' → Pakistan'}</button>
  <div style={{display:'flex',gap:8,marginBottom:10}}><div style={{flex:1}}><div style={{fontSize:11,color:'#64748b',marginBottom:5}}>Meeting date</div><input aria-label="Meeting date" type="date" value={date} onChange={e=>{setDate(e.target.value);setChoice(0)}} style={field}/></div><div style={{flex:1}}><div style={{fontSize:11,color:'#64748b',marginBottom:5}}>Meeting time</div><input aria-label="Meeting time" type="time" value={time} onChange={e=>{setTime(e.target.value);setChoice(0)}} style={field}/></div></div>
  <div style={{background:'#f8fafc',borderRadius:8,padding:11}}><div style={{fontSize:11,color:'#64748b',marginBottom:5}}>{reverse?label(zone):'Karachi, Pakistan'}</div>
   {selected?<strong style={{fontSize:16}}>{format(selected,to)}</strong>:<span style={{color:'#b45309'}}>Invalid or nonexistent local time. Check the date and time.</span>}
   {matches.length>1&&<div style={{marginTop:8,color:'#92400e'}}>This time occurs twice due to daylight saving. <select value={choice} onChange={e=>setChoice(Number(e.target.value))}><option value={0}>First occurrence</option><option value={1}>Second occurrence</option></select></div>}
  </div>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}><span style={{fontSize:10,color:'#64748b'}}>Daylight saving handled automatically</span><button disabled={!selected} onClick={()=>navigator.clipboard?.writeText(label(from)+': '+format(selected,from)+' | '+label(to)+': '+format(selected,to))} style={{border:'1px solid #e5e7eb',background:'#fff',borderRadius:6,padding:6,cursor:'pointer',display:'flex',gap:4}}><Copy size={12}/> Copy</button></div>
 </div>
}
export function CurrencyConverter({market,initialCode='USD',onClose,onRefresh,refreshing}){
 const [from,setFrom]=useState(initialCode),[to,setTo]=useState('PKR'),[amount,setAmount]=useState('100')
 const codes=['USD','EUR','GBP','PKR','AED']
 const quote=market?.fx||{}
 const pkr={PKR:1,USD:Number(quote.USD?.value),EUR:Number(quote.EUR?.value),GBP:Number(quote.GBP?.value),AED:Number(quote.USD?.value)/3.6725}
 const valid=Number.isFinite(pkr[from])&&pkr[from]>0&&Number.isFinite(pkr[to])&&pkr[to]>0
 const converted=valid&&amount!==''?Number(amount)*pkr[from]/pkr[to]:null
 const stamp=market?.checkedAt?new Date(market.checkedAt).toLocaleString('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'}):'Not available'
 return <div role="dialog" aria-label="Currency converter" style={{position:'absolute',top:31,left:0,zIndex:91,width:330,maxWidth:'calc(100vw - 24px)',padding:14,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 12px 35px #0002',fontSize:12,color:'#111827'}}>
 <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}><strong>Currency Converter</strong><button aria-label="Close converter" onClick={onClose} style={{border:0,background:'none',cursor:'pointer'}}><X size={15}/></button></div>
 <div style={{display:'flex',gap:7,marginBottom:9}}><input aria-label="Amount" type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} style={{...field,flex:1,minWidth:0}}/><select aria-label="From currency" value={from} onChange={e=>setFrom(e.target.value)} style={{...field,width:88}}>{codes.map(c=><option key={c}>{c}</option>)}</select></div>
 <button aria-label="Swap currencies" onClick={()=>{setFrom(to);setTo(from)}} style={{display:'block',margin:'0 auto 9px',background:'#fff',border:'1px solid #e5e7eb',borderRadius:6,padding:6,cursor:'pointer'}}><ArrowDownUp size={14}/></button>
 <div style={{display:'flex',gap:7,alignItems:'center',marginBottom:10}}><div style={{...field,flex:1,minWidth:0,background:'#f8fafc',fontWeight:700}}>{converted==null||!Number.isFinite(converted)?'Rate unavailable':converted.toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2})}</div><select aria-label="To currency" value={to} onChange={e=>setTo(e.target.value)} style={{...field,width:88}}>{codes.map(c=><option key={c}>{c}</option>)}</select></div>
 <div style={{fontSize:10,color:'#64748b',marginBottom:10}}>1 {from} = {valid?(pkr[from]/pkr[to]).toFixed(4):'—'} {to}</div>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:5,borderTop:'1px solid #eee',paddingTop:10}}><span style={{fontSize:10,color:'#64748b'}}>Last checked: {stamp} PKT</span><button disabled={refreshing} onClick={onRefresh} title="Refresh rates" style={{border:0,background:'none',cursor:'pointer'}}><RefreshCw size={14}/></button><button disabled={converted==null} onClick={()=>navigator.clipboard?.writeText(String(converted.toFixed(2)))} style={{border:0,background:'none',cursor:'pointer'}}><Copy size={14}/></button></div>
 <div style={{fontSize:10,color:'#94a3b8',marginTop:6}}>Reference rates; AED derived from USD peg. Checked time may differ from provider quotation date.</div>
 </div>
}
