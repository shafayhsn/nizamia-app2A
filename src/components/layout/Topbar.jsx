import React, { useState, useEffect } from 'react'
import { Bell, Cloud, CloudOff, RefreshCw, AlertCircle, ClipboardCheck, Check, ExternalLink, X, Calculator, CalendarDays, Package, FilePlus2, ListTodo, PlusCircle, Scissors, Ship, BarChart3, ShoppingCart, Users, Truck, BookOpen, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { subscribeSync, syncSnapshot, resetSyncError } from '../../lib/syncTracker'
import { useAuth } from '../../lib/authContext'
import { supabase } from '../../lib/supabase'
import { NotificationCenter, useDeadlineEvents } from '../ui/DeadlinesTracker'
import { dueWithin24h, overdueEvents } from '../../lib/deadlineEvents'
import QuickCalculator from '../ui/QuickCalculator'
import {SHORTCUT_CATALOG,DEFAULT_SHORTCUTS,TOPBAR_SHORTCUTS_KEY} from '../../lib/topbarShortcuts'
import {loadSetting} from '../../lib/settingsStore'
import {can} from '../../lib/permissions'

function useSyncStatus() {
  const [snapshot, setSnapshot] = useState(syncSnapshot)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(()=>subscribeSync(setSnapshot),[])
  const status = !online ? 'offline' : snapshot.pending ? 'syncing' : snapshot.failed ? 'error' : snapshot.lastSaved ? 'synced' : 'online'
  useEffect(() => {
    const handleOnline  = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    if (!navigator.onLine) setOnline(false)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  return {status,snapshot}
}

const CITIES = [
  { label: 'Karachi',  tz: 'Asia/Karachi' },
  { label: 'London',   tz: 'Europe/London' },
  { label: 'New York', tz: 'America/New_York' },
  { label: 'Dubai',    tz: 'Asia/Dubai' },
]

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

const ICONS={ClipboardCheck,CalendarDays,Package,FilePlus2,ListTodo,PlusCircle,Scissors,Ship,BarChart3,ShoppingCart,Users,Truck,BookOpen,Settings}
export default function Topbar({onOpenDeadlines}) {
  const { user, userRole } = useAuth()
  const navigate = useNavigate()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [calculatorOpen,setCalculatorOpen]=useState(false)
  const [shortcutIds,setShortcutIds]=useState(DEFAULT_SHORTCUTS)
  useEffect(()=>{let live=true;const refresh=()=>loadSetting(TOPBAR_SHORTCUTS_KEY,DEFAULT_SHORTCUTS).then(v=>{if(live)setShortcutIds(Array.isArray(v)?v:DEFAULT_SHORTCUTS)});refresh();window.addEventListener('app2a-shortcuts-updated',refresh);return()=>{live=false;window.removeEventListener('app2a-shortcuts-updated',refresh)}},[])
  const openShortcut=(entry)=>{
    setNotificationsOpen(false);setTasksOpen(false);setCalculatorOpen(false)
    if(entry.id==='tasks'){setTasksOpen(true);return}
    if(entry.id==='calendar'){onOpenDeadlines?.();return}
    if(entry.type==='action'){
      navigate(entry.path)
      window.setTimeout(()=>{const match=(entry.buttonText||'').split('|');const buttons=[...document.querySelectorAll('main button')];const target=buttons.find(b=>!b.disabled&&match.some(x=>(b.textContent||'').trim().toLowerCase().includes(x)));if(target)target.click();else window.alert('Open this action from its page. A direct shortcut is not available for this screen yet.')},500)
      return
    }
    navigate(entry.path)
  }
  const [assignedTasks, setAssignedTasks] = useState([])
  const [taskReadIds, setTaskReadIds] = useState([])
  const [taskError, setTaskError] = useState('')
  const userId = user?.id ? String(user.id) : null
  const storageKey = userId ? `app2a_read_deadline_notifications_${userId}` : null
  const [readNotificationIds, setReadNotificationIds] = useState([])
  const [notificationView, setNotificationView] = useState('all')
  const { events } = useDeadlineEvents()
  // Read receipts are per application user. The database migration must be installed
  // for cross-device sync; browser storage remains a scoped offline fallback.
  useEffect(() => {
    if (!storageKey) { setReadNotificationIds([]); return }
    let active = true
    let local = []
    try { local = JSON.parse(localStorage.getItem(storageKey) || '[]') } catch (_) {}
    setReadNotificationIds(local)
    supabase.from('notification_reads').select('event_id').eq('user_id', userId).then(({data,error}) => {
      if (!active || error) return
      const merged = [...new Set([...local, ...(data || []).map(r => r.event_id)])]
      setReadNotificationIds(merged)
      localStorage.setItem(storageKey, JSON.stringify(merged))
    })
    return () => { active = false }
  }, [userId, storageKey])
  useEffect(() => {
    if (!userId) { setAssignedTasks([]); setTaskReadIds([]); return }
    let active = true
    const load = async () => {
      const [tasks, reads] = await Promise.all([
        supabase.from('app_tasks').select('id,title,status,due_date,priority,created_at').eq('assignee_id',userId).neq('status','Completed').order('due_date',{ascending:true}).limit(30),
        supabase.from('app_task_reads').select('task_id').eq('user_id',userId),
      ])
      if (!active) return
      if (tasks.error) { setTaskError('Tasks database setup required'); return }
      setTaskError('')
      setAssignedTasks(tasks.data || [])
      if (!reads.error) setTaskReadIds((reads.data || []).map(r=>r.task_id))
    }
    load()
    const refresh = () => { if(document.visibilityState==='visible') load() }
    window.addEventListener('focus',refresh)
    window.addEventListener('app2a-tasks-changed',refresh)
    const interval = setInterval(load,60000)
    return () => { active=false; clearInterval(interval); window.removeEventListener('focus',refresh); window.removeEventListener('app2a-tasks-changed',refresh) }
  },[userId])
  const markTaskRead = async (taskIds) => {
    if (!userId || !taskIds.length) return
    const fresh=taskIds.filter(id=>!taskReadIds.includes(id))
    if (!fresh.length) return
    const {error}=await supabase.from('app_task_reads').upsert(fresh.map(task_id=>({task_id,user_id:userId})),{onConflict:'task_id,user_id'})
    if (error) { setTaskError(error.message); return }
    setTaskReadIds(ids=>[...new Set([...ids,...fresh])])
  }
  const notificationRows = [...overdueEvents(events), ...dueWithin24h(events).filter(e => e.status !== 'overdue')]
  const notificationCount = notificationRows.filter(e => !readNotificationIds.includes(e.id)).length
  const markNotificationsRead = (ids) => {
    if (!userId || !storageKey) return
    const fresh = ids.filter(id => id && !readNotificationIds.includes(id))
    if (!fresh.length) return
    const next = [...new Set([...readNotificationIds, ...fresh])]
    setReadNotificationIds(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
    supabase.from('notification_reads').upsert(fresh.map(event_id => ({user_id:userId,event_id})), {onConflict:'user_id,event_id'})
      .then(({error}) => { if (error) {
        // A failed write must not appear successfully synced.
        setReadNotificationIds(prev => prev.filter(id => !fresh.includes(id)))
        try { const local = JSON.parse(localStorage.getItem(storageKey) || '[]'); localStorage.setItem(storageKey,JSON.stringify(local.filter(id => !fresh.includes(id)))) } catch (_) {}
        window.alert('Could not mark notifications as read: ' + error.message)
      } })
  }
  const markNotificationRead = (event) => markNotificationsRead([event?.id])
  const now = useClock()
  const week = getWeekNumber(now)
  const {status:syncStatus,snapshot:syncInfo} = useSyncStatus()
  const [globalSave,setGlobalSave]=useState(null)
  const [globalSaveError,setGlobalSaveError]=useState(false)
  useEffect(()=>{
    let active=true
    const load=async()=>{
      if(!navigator.onLine)return
      const {data,error}=await supabase.from('app_database_sync_status').select('last_saved_at').eq('id',1).maybeSingle()
      if(!active)return
      if(error){setGlobalSaveError(true);return}
      setGlobalSaveError(false)
      setGlobalSave(data?.last_saved_at||null)
    }
    load()
    const timer=setInterval(load,30000)
    return()=>{active=false;clearInterval(timer)}
  },[])
  const [syncOpen,setSyncOpen]=useState(false)
  const [syncNow,setSyncNow]=useState(Date.now())
  useEffect(()=>{const id=setInterval(()=>setSyncNow(Date.now()),15000);return()=>clearInterval(id)},[])

  const syncConfig = {
    online:  { icon: Cloud, color: '#16a34a', bg: '#f0fdf4', label: 'Connected' },
    synced: { icon: Cloud, color: '#16a34a', bg: '#f0fdf4', label: 'Synced' },
    offline: { icon: CloudOff,     color: '#dc2626', bg: '#fef2f2', label: 'Offline' },
    syncing: { icon: RefreshCw,    color: '#d97706', bg: '#fff7ed', label: 'Syncing' },
    error:   { icon: AlertCircle,  color: '#dc2626', bg: '#fef2f2', label: 'Sync Error' },
  }[syncStatus] || { icon: Cloud, color: '#16a34a', bg: '#f0fdf4', label: 'Online' }

  const rates = [
    { sym: '$', rate: 278.50 },
    { sym: '€', rate: 302.10 },
    { sym: '£', rate: 355.00 },
  ]

  const dayStr = now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' })

  return (
    <header style={{
      height: 'var(--topbar-h)', background: '#fff',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: '0 20px', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        {CITIES.map(({ label, tz }) => {
          const time = now.toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
          })
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 400, fontVariantNumeric: 'tabular-nums', color: '#1a1a2e' }}>{time}</span>
            </div>
          )
        })}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 16px' }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {rates.map(({ sym, rate }) => (
          <div key={sym} style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <span style={{ fontSize: 11, color: '#1a1a2e', fontWeight: 700 }}>{sym}</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: '#1a1a2e', fontVariantNumeric: 'tabular-nums' }}>{rate.toFixed(2)}</span>
            <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 1, fontWeight: 600 }}>↑</span>
          </div>
        ))}
      </div>

      <div style={{flex:1}} />
      <div style={{position:'relative',marginRight:6}}>
        <button onClick={()=>setSyncOpen(v=>!v)} aria-expanded={syncOpen} aria-label="Database sync status" style={{display:'flex',alignItems:'center',gap:5,padding:'3px 8px',borderRadius:6,background:syncConfig.bg,border:'none',cursor:'pointer'}}>
          <syncConfig.icon size={13} color={syncConfig.color} style={syncStatus==='syncing'?{animation:'spin 1s linear infinite'}:{}}/>
          <span style={{fontSize:10,fontWeight:700,color:syncConfig.color}}>{syncConfig.label}</span>
        </button>
        {syncOpen&&<>
          <div onClick={()=>setSyncOpen(false)} style={{position:'fixed',inset:0,zIndex:90}}/>
          <div role="dialog" aria-label="Database Sync Status" style={{position:'absolute',top:35,right:0,zIndex:91,width:275,padding:15,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 12px 35px #0002',fontSize:12}}>
            <div style={{fontWeight:750,marginBottom:12}}>Database Sync Status</div>
            <div style={{display:'flex',alignItems:'center',gap:7,color:syncConfig.color,fontWeight:700,marginBottom:12}}><syncConfig.icon size={15}/>{syncConfig.label}</div>
            <div style={{background:'#f8fafc',padding:10,borderRadius:7}}>
              <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>Last successful save (this browser session)</div>
              <div style={{fontSize:15,fontWeight:750}}>{syncInfo.lastSaved ? (()=>{const secs=Math.max(0,Math.floor((syncNow-new Date(syncInfo.lastSaved).getTime())/1000));return secs<60?'Just now':secs<3600?`${Math.floor(secs/60)} min ago`:`${Math.floor(secs/3600)} hr ago`})():'No recent save recorded'}</div>
              {syncInfo.lastSaved&&<div style={{fontSize:10,color:'#64748b',marginTop:4}}>{new Date(syncInfo.lastSaved).toLocaleTimeString()}</div>}
            </div>
            <div style={{borderTop:'1px solid #e5e7eb',marginTop:12,paddingTop:12}}>
              <div style={{color:'#64748b',fontSize:11,marginBottom:4}}>Last database update · All users</div>
              <div style={{fontSize:15,fontWeight:750}}>{globalSaveError?'Unavailable':globalSave?(()=>{const secs=Math.max(0,Math.floor((syncNow-new Date(globalSave).getTime())/1000));return secs<60?'Just now':secs<3600?`${Math.floor(secs/60)} min ago`:`${Math.floor(secs/3600)} hr ago`})():'No save recorded yet'}</div>
              {globalSave&&!globalSaveError&&<div style={{fontSize:10,color:'#64748b',marginTop:4}}>{new Date(globalSave).toLocaleTimeString()}</div>}
            </div>
            {syncStatus==='error'&&<button onClick={()=>{resetSyncError();setSyncOpen(false)}} style={{marginTop:10,border:'1px solid #e5e7eb',borderRadius:6,padding:7,background:'#fff',cursor:'pointer'}}>Dismiss warning</button>}
            <div style={{color:'#94a3b8',fontSize:10,marginTop:10}}>Browser time shows local confirmed writes. Database time shows the latest tracked write from any user; refreshed every 30 seconds.</div>
          </div>
        </>}
      </div>

      <div style={{ position: 'relative' }}>
        <button onClick={() => setNotificationsOpen(v => !v)} title="Deadline notifications" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 6, position: 'relative', display: 'flex', borderRadius: 6 }}
          onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          <Bell size={18} strokeWidth={1.9} />
          {notificationCount > 0 && <span style={{ position: 'absolute', top: 1, right: 1, minWidth: 14, height: 14, background: '#dc2626', borderRadius: 999, border: '1.5px solid #fff', color: '#fff', fontSize: 8.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{notificationCount > 9 ? '9+' : notificationCount}</span>}
        </button>
        <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} onEventViewed={markNotificationRead} onMarkAllRead={() => markNotificationsRead(notificationRows.map(e => e.id))} readIds={readNotificationIds} view={notificationView} onViewChange={setNotificationView} />
      </div>
      {shortcutIds.slice(0,5).map(id=>{
        const entry=SHORTCUT_CATALOG.find(x=>x.id===id)
        if(!entry || (entry.module&&!can(userRole,entry.module,entry.permission||'view')))return null
        const Icon=ICONS[entry.icon]||Package
        if(id==='tasks')return <div key={id} style={{position:'relative'}}><button title="My tasks" aria-label="Open assigned tasks" onClick={()=>{setTasksOpen(v=>!v);setNotificationsOpen(false);setCalculatorOpen(false)}} style={{background:'none',border:0,cursor:'pointer',color:'#6b7280',padding:6,display:'flex',borderRadius:6}}><ClipboardCheck size={18} strokeWidth={1.9}/></button>
        {tasksOpen&&<>
          <div onClick={()=>setTasksOpen(false)} style={{position:'fixed',inset:0,zIndex:90}} />
          <div style={{position:'absolute',top:38,right:0,width:345,maxWidth:'calc(100vw - 24px)',background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 12px 35px #0002',zIndex:91,overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderBottom:'1px solid #eee'}}><strong style={{fontSize:13}}>Assigned to Me</strong><button onClick={()=>setTasksOpen(false)} aria-label="Close" style={{background:'none',border:0,cursor:'pointer'}}><X size={15}/></button></div>
            {taskError&&<div style={{padding:12,fontSize:11,color:'#b91c1c'}}>{taskError}</div>}
            <div style={{maxHeight:325,overflowY:'auto'}}>{!assignedTasks.length&&!taskError&&<div style={{padding:18,fontSize:12,color:'#6b7280'}}>No open tasks assigned to you.</div>}
              {assignedTasks.map(t=><div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 13px',borderBottom:'1px solid #f3f4f6',background:taskReadIds.includes(t.id)?'#fff':'#f8fafc'}}>
                <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={()=>{markTaskRead([t.id]);setTasksOpen(false);navigate('/tasks')}}><div style={{fontSize:12,fontWeight:taskReadIds.includes(t.id)?500:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.title}</div><div style={{fontSize:10,color:'#64748b',marginTop:3}}>Due {t.due_date} · {t.status}</div></div>
                {!taskReadIds.includes(t.id)&&<button title="Mark as read" onClick={()=>markTaskRead([t.id])} style={{border:'1px solid #e5e7eb',background:'#fff',borderRadius:6,padding:5,cursor:'pointer'}}><Check size={13}/></button>}
              </div>)}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,padding:'9px 12px',borderTop:'1px solid #eee'}}><button onClick={()=>markTaskRead(assignedTasks.map(t=>t.id))} style={{border:0,background:'none',fontSize:11,cursor:'pointer',color:'#475569'}}>Mark all read</button><button onClick={()=>{setTasksOpen(false);navigate('/tasks')}} style={{border:0,background:'none',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>View All Tasks <ExternalLink size={12}/></button></div>
          </div>
        </>}
      </div>
        return <button key={id} title={entry.label} aria-label={entry.label} onClick={()=>openShortcut(entry)} style={{background:'none',border:0,cursor:'pointer',color:'#6b7280',padding:6,display:'flex',borderRadius:6}}><Icon size={18} strokeWidth={1.9}/></button>
      })}
      <div style={{position:'relative'}}><button title="Calculator" aria-label="Open calculator" onClick={()=>{setCalculatorOpen(v=>!v);setTasksOpen(false);setNotificationsOpen(false)}} style={{background:'none',border:0,cursor:'pointer',color:'#6b7280',padding:6,display:'flex'}}><Calculator size={18}/></button>{calculatorOpen&&<QuickCalculator onClose={()=>setCalculatorOpen(false)}/>}</div>
      <div style={{width:1,height:20,background:'var(--border)',margin:'0 8px'}} />
      <div style={{display:'flex',alignItems:'center',gap:9,whiteSpace:'nowrap'}}><span style={{fontSize:11,fontWeight:700,background:'#dc2626',padding:'3px 9px',borderRadius:5,color:'#fff'}}>W{week}</span><span style={{fontSize:12,color:'#1a1a2e',fontWeight:700}}>{dayStr}</span><span style={{fontSize:13,fontWeight:700,color:'#1a1a2e',fontVariantNumeric:'tabular-nums'}}>{timeStr}</span></div>
    </header>
  )
}
