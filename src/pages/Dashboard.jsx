import { formatDate as appFormatDate } from '../lib/utils'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { statusBadgeStyle } from '../lib/statusColors'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, AlertTriangle, Ship, Layers, DollarSign, ChevronRight, Printer } from 'lucide-react'
import { buildBusinessOverview, printHTML, openPrintWindow } from '../components/PrintReports'
import { useAuth } from '../lib/authContext'

const statusColor = { Draft: '#d97706', Confirmed: '#16a34a', Cancelled: '#dc2626' }
const statusBg    = { Draft: '#fff7ed', Confirmed: '#f0fdf4', Cancelled: '#fef2f2' }

export default function Dashboard() {
  const { user } = useAuth()
  const displayName = user?.username || user?.displayName || user?.email || 'there'
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [samples, setSamples] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentLines, setShipmentLines] = useState([])
  const [chartYear, setChartYear] = useState(new Date().getFullYear())
  const [otdPeriod,setOtdPeriod] = useState('year')
  const [buyerPeriod,setBuyerPeriod] = useState('year')
  const [dataError, setDataError] = useState('')
  const navigate = useNavigate()

  useEffect(() => { loadData(); loadMonthlyTarget() }, [])

  async function loadMonthlyTarget() {
    const {data,error}=await supabase.from('app_settings').select('value').eq('key','dashboard_monthly_shipment_target').maybeSingle()
    if(!error && data?.value != null) {
      const n=Number(data.value)
      if(Number.isFinite(n) && n>=0){setMonthlyTarget(n);setTargetDraft(String(n))}
    }
  }
  async function saveMonthlyTarget() {
    const n=Number(targetDraft)
    if(!Number.isFinite(n)||n<0||!Number.isInteger(n)){setTargetError('Enter a valid whole number of pieces.');return}
    setTargetSaving(true);setTargetError('')
    const {data:existing,error:lookupError}=await supabase.from('app_settings').select('id').eq('key','dashboard_monthly_shipment_target').maybeSingle()
    if(lookupError){setTargetError(lookupError.message);setTargetSaving(false);return}
    const result=existing ? await supabase.from('app_settings').update({value:n,updated_at:new Date().toISOString()}).eq('id',existing.id).select('id').single() : await supabase.from('app_settings').insert({key:'dashboard_monthly_shipment_target',value:n}).select('id').single()
    setTargetSaving(false)
    if(result.error){setTargetError(result.error.message);return}
    setMonthlyTarget(n);setEditingTarget(false)
  }

  async function loadData() {
    setLoading(true)
    const [orderResult, sampleResult, shipmentResult, lineResult] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', {ascending:false}).range(0, 9999),
      supabase.from('samples').select('id,order_id,due_date,status,approval_status').range(0,9999),
      supabase.from('shipments').select('id,shipment_date,etd,notes').range(0,9999),
      supabase.from('shipment_lines').select('shipment_id,order_id,shipped_qty').range(0,9999)
    ])
    setDataError(orderResult.error?.message || sampleResult.error?.message || '')
    setOrders(orderResult.data || [])
    setSamples(sampleResult.data || [])
    setShipments(shipmentResult.data || [])
    setShipmentLines(lineResult.data || [])
    setLoading(false)
  }

  const today = new Date(); today.setHours(0,0,0,0)
  const in21 = new Date(today); in21.setDate(today.getDate()+21)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate()+7)
  const monEnd = new Date(today.getFullYear(),today.getMonth()+1,0)
  const active = orders.filter(o => !['Cancelled','Shipped','Completed'].includes(o.status))
  const samplesWeek = samples.filter(s => s.due_date && new Date(s.due_date) >= today && new Date(s.due_date) <= weekEnd && !['completed','approved','cancelled'].includes(String(s.status||s.approval_status||'').toLowerCase()))
  const shipmentsWeek = active.filter(o => o.ship_date && new Date(o.ship_date) >= today && new Date(o.ship_date) <= weekEnd)
  const overdue = samples.filter(s => s.due_date && new Date(s.due_date) < today && !['completed','approved','cancelled'].includes(String(s.status||s.approval_status||'').toLowerCase()))
  const totalQty = active.reduce((sum,o)=>sum+(Number(o.total_qty)||0),0)
  const totalValue = active.reduce((sum,o)=>sum+(Number(o.total_value_usd)||0),0)

  const inPeriod=(value,period)=>{
    if(!value)return false
    const d=new Date(String(value).slice(0,10)+'T12:00:00')
    if(isNaN(d))return false
    if(period==='all')return true
    if(period==='last')return d.getFullYear()===today.getFullYear()-1
    if(d.getFullYear()!==today.getFullYear())return false
    if(period==='month')return d.getMonth()===today.getMonth()
    if(period==='quarter')return Math.floor(d.getMonth()/3)===Math.floor(today.getMonth()/3)
    return true
  }
  const periodSelect=(value,onChange)=><select value={value} onChange={e=>onChange(e.target.value)} style={{border:'1px solid var(--border)',borderRadius:6,padding:'4px 5px',fontSize:10,background:'#fff',maxWidth:105}}>
    <option value="month">This Month</option><option value="quarter">This Quarter</option><option value="year">This Year</option><option value="last">Last Year</option><option value="all">All Time</option>
  </select>
  const buyerMap = {}
  orders.filter(o=>o.status!=='Cancelled' && inPeriod(o.po_date || o.ship_date || o.planned_date,buyerPeriod)).forEach(o=>{
    if(!o.buyer_name)return
    const buyer=o.buyer_name.trim()
    buyerMap[buyer]=(buyerMap[buyer]||0)+(Number(o.total_value_usd)||0)
  })
  const topBuyers=Object.entries(buyerMap).sort((a,b)=>b[1]-a[1]).slice(0,5)
  const maxBuyerVal=topBuyers[0]?.[1]||1

  function fmtDate(d) { return appFormatDate(d) }
  function dateColor(d) {
    if (!d) return undefined
    const dt = new Date(d)
    if (dt < today) return '#dc2626'
    if (dt <= in21) return '#d97706'
    return undefined
  }
  function fmtK(v) {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`
    if (v >= 1000) return `$${Math.round(v / 1000)}k`
    return `$${v}`
  }

  const STATS = [
    {
      label: 'Active Orders', value: active.length,
      sub: 'Excludes shipped and cancelled orders',
      icon: ClipboardList, iconColor: '#3b82f6', iconBg: '#eff6ff',
    },
    {
      label: 'Samples Due (Week)', value: samplesWeek.length,
      sub: overdue.length > 0 ? `${overdue.length} overdue` : 'On track',
      subColor: overdue.length > 0 ? '#d97706' : undefined,
      icon: AlertTriangle, iconColor: '#f59e0b', iconBg: '#fffbeb',
    },
    {
      label: 'Shipments Due (Week)', value: shipmentsWeek.length,
      sub: `${active.filter(o => o.ship_date && new Date(o.ship_date) >= today && new Date(o.ship_date) <= monEnd).length} remaining this month`,
      icon: Ship, iconColor: '#10b981', iconBg: '#ecfdf5',
    },
    {
      label: 'Units in Production', value: totalQty >= 1000 ? `${Math.round(totalQty / 1000)}K` : totalQty,
      sub: 'Active order volume',
      icon: Layers, iconColor: '#8b5cf6', iconBg: '#f5f3ff',
    },
    {
      label: 'Projected Revenue', value: fmtK(totalValue),
      sub: 'Based on active POs',
      subColor: '#16a34a',
      icon: DollarSign, iconColor: '#16a34a', iconBg: '#f0fdf4',
    },
  ]

  const QUICK_ACTIONS = [
    { label: '+ New Order',         primary: true,  action: () => navigate('/orders') },
    { label: 'Manage Orders',       primary: false, action: () => navigate('/orders') },
    { label: 'New Sample Request',  primary: false, action: () => navigate('/orders') },
    { label: 'New Supplier PO',     primary: false, action: () => navigate('/purchasing') },
    { label: 'Issue Work Order',    primary: false, action: () => navigate('/purchasing') },
    { label: 'Send Parcel',         primary: false, action: () => {} },
  ]

  // Closed months show actual shipments; open months show actual + remaining scheduled.
  const monthlyShipments = Array.from({length:12},(_,month)=>({month,actual:0,remaining:0}))
  const shippedByOrder = {}
  const linesByShipment = {}
  shipmentLines.forEach(line=>{
    const qty = Math.max(0,Number(line.shipped_qty)||0)
    linesByShipment[line.shipment_id]=(linesByShipment[line.shipment_id]||0)+qty
    if(line.order_id) shippedByOrder[line.order_id]=(shippedByOrder[line.order_id]||0)+qty
  })
  shipments.forEach(sh=>{
    let historical = {}
    try {
      const match = String(sh.notes||'').match(/\[\[APP2A_SHIPPING_META:([A-Za-z0-9+/=]+)\]\]/)
      historical = match ? (JSON.parse(atob(match[1])).historical || {}) : (JSON.parse(sh.notes||'{}').historical || {})
    } catch {}
    const dateString = sh.etd || historical.etd || sh.shipment_date
    const date = dateString ? new Date(String(dateString).slice(0,10)+'T12:00:00') : null
    if(!date || isNaN(date) || date.getFullYear()!==chartYear) return
    const lineQty = linesByShipment[sh.id] || 0
    const historicalQty = Number(historical.qty)||0
    monthlyShipments[date.getMonth()].actual += historicalQty || lineQty
  })
  orders.forEach(order=>{
    if(['Cancelled','Shipped','Completed'].includes(order.status)) return
    const dateString=order.ship_date || order.planned_date
    const date=dateString ? new Date(dateString+'T12:00:00') : null
    if(!date || isNaN(date) || date.getFullYear()!==chartYear) return
    const remaining=Math.max(0,(Number(order.total_qty)||0)-(shippedByOrder[order.id]||0))
    monthlyShipments[date.getMonth()].remaining+=remaining
  })
  const now=new Date()
  const isClosedMonth=month=>chartYear<now.getFullYear() || (chartYear===now.getFullYear() && month<now.getMonth())
  const chartMax=Math.max(1,monthlyTarget,...monthlyShipments.map(d=>isClosedMonth(d.month)?d.actual:d.actual+d.remaining))
  const chartPoints=monthlyShipments.filter(d=>isClosedMonth(d.month)).map(d=>({x:((d.month+0.5)/12)*546,y:130-(d.actual/chartMax)*130}))
  const chartPath=chartPoints.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')

  return (
    <div style={{ padding: '20px 28px', overflowY: 'hidden', height: '100%', display:'flex', flexDirection:'column', boxSizing:'border-box' }}>

      {/* Greeting */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px' }}>
          Welcome back, {displayName}. Let's get to work!
        </h1>
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 3 }}>
          Manage orders from tech-packs to shipment · SS26 Active Season
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {QUICK_ACTIONS.map(({ label, primary, action }) => (
          <button key={label} onClick={action} className={primary ? 'btn btn-primary btn-lg' : 'btn btn-secondary'}>
            {label}
          </button>
        ))}
        <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
          onClick={async () => {
            const targetWindow = openPrintWindow()
            if (!targetWindow) return
            const html = await buildBusinessOverview()
            printHTML(html, targetWindow)
          }}>
          <Printer size={13} /> Business Overview
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {STATS.map(({ label, value, sub, subColor, icon: Icon, iconColor, iconBg }) => (
          <div key={label} style={{
            background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
            padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: 10, color: subColor || 'var(--text-light)', marginTop: 5, fontWeight: 500 }}>
                {sub}
              </div>
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={16} color={iconColor} strokeWidth={2} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px 220px', gap: 14, marginBottom: 0, flex:'1 1 0', minHeight:0 }}>

        {/* Monthly shipped quantity */}
        <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:10,padding:'16px 20px',minWidth:0,display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
              <span style={{fontSize:10,fontWeight:700,color:'var(--text-light)',textTransform:'uppercase',letterSpacing:'.7px'}}>Monthly Shipped Quantity</span>
              <span style={{fontSize:10,color:'var(--text-light)'}}><span style={{color:'#bfe8a9'}}>■</span> Closed / Actual</span>
              <span style={{fontSize:10,color:'var(--text-light)'}}><span style={{color:'#e4d2f5'}}>■</span> Open / Planned</span>
            </div>
            <select value={chartYear} onChange={e=>setChartYear(Number(e.target.value))} style={{border:'1px solid var(--border)',borderRadius:6,padding:'4px 7px',fontSize:10,background:'#fff'}}>
              {Array.from({length:5},(_,i)=>now.getFullYear()+1-i).map(y=><option key={y} value={y}>{y===now.getFullYear()?'This Year':y}</option>)}
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5,fontSize:10,color:'#ea580c'}}>
            <button type="button" onClick={()=>{setTargetDraft(String(monthlyTarget));setTargetError('');setEditingTarget(v=>!v)}} title="Edit shared monthly shipment target" style={{border:'1px dashed #fb923c',background:'#fff7ed',color:'#c2410c',borderRadius:5,padding:'3px 7px',cursor:'pointer',fontSize:10,fontWeight:700}}>Target: {monthlyTarget.toLocaleString()} pcs ✎</button>
            {editingTarget && <><input aria-label="Monthly shipment target in pieces" type="number" min="0" step="1" value={targetDraft} onChange={e=>setTargetDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')saveMonthlyTarget();if(e.key==='Escape')setEditingTarget(false)}} style={{width:100,padding:'3px 5px',border:'1px solid var(--border)',borderRadius:4,fontSize:11}}/><button type="button" disabled={targetSaving} onClick={saveMonthlyTarget} style={{fontSize:11,cursor:'pointer'}}>Save</button><button type="button" onClick={()=>setEditingTarget(false)} style={{fontSize:11,cursor:'pointer'}}>Cancel</button></>}
            {targetError && <span role="alert" style={{color:'#dc2626'}}>{targetError}</span>}
          </div>
          {loading?<div style={{height:150,display:'grid',placeItems:'center',fontSize:12,color:'var(--text-light)'}}>Loading shipments…</div>:
          <div style={{position:'relative',height:'100%',minHeight:140,flex:1}}>
            <div style={{display:'flex',height:'100%',alignItems:'flex-end',gap:8}}>
              {monthlyShipments.map(d=>{
                const closed=isClosedMonth(d.month)
                const total=closed?d.actual:d.actual+d.remaining
                return <div key={d.month} title={new Date(chartYear,d.month,1).toLocaleString('en',{month:'long'})+' — Shipped: '+d.actual.toLocaleString()+' pcs; Remaining planned: '+d.remaining.toLocaleString()+' pcs'} style={{flex:1,minWidth:0,height:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',alignItems:'center',gap:6}}>
                  <div style={{width:'75%',height:total ? `max(3px, calc((100% - 24px) * ${total/chartMax}))` : 0,background:closed?'#d8efc7':'#e9dcf8',borderRadius:'2px 2px 0 0'}}/>
                  <span style={{fontSize:10,fontWeight:600,color:'#333'}}>{new Date(chartYear,d.month,1).toLocaleString('en',{month:'short'}).toUpperCase()}</span>
                </div>
              })}
            </div>
            <div style={{position:'absolute',top:`calc((100% - 24px) * ${1-monthlyTarget/chartMax})`,left:0,right:0,borderTop:'1.5px dashed #f97316',pointerEvents:'none',zIndex:2}}/>
            <svg viewBox="0 0 546 130" preserveAspectRatio="none" style={{position:'absolute',top:0,left:0,width:'100%',height:'calc(100% - 24px)',pointerEvents:'none',overflow:'visible'}}>
              <path d={chartPath} fill="none" stroke="#00a34b" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>}
        </div>

        {/* OTD donut */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px',display:'flex',flexDirection:'column',minHeight:0 }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:5,marginBottom:12}}>
            <span style={{fontSize:10,fontWeight:700,color:'var(--text-light)',textTransform:'uppercase'}}>On-Time Delivery (OTD)</span>
            {periodSelect(otdPeriod,setOtdPeriod)}
          </div>
          {(() => {
            const periodShipments = shipments.filter(sh=>inPeriod(sh.etd || sh.shipment_date,otdPeriod))
            const onTime = periodShipments.length
            const pct = 0 // Actual on-time delivery requires confirmed shipment dates
            const r = 40, circ = 2 * Math.PI * r
            const dash = (pct / 100) * circ
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent:'center', gap: 24, flex:1, minHeight:0 }}>
                <div style={{ position: 'relative', width: 152, height: 152 }}>
                  <svg width="152" height="152" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
                    <circle cx="50" cy="50" r={r} fill="none" stroke="#1a1a2e" strokeWidth="12"
                      strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                      transform="rotate(-90 50 50)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 24, fontWeight: 700 }}>—</span>
                    <span style={{ fontSize: 9, color: 'var(--text-light)' }}>NO DATA</span>
                  </div>
                </div>
                <div style={{ width: '100%', fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-light)' }}>Orders on track</span>
                    <span style={{ fontWeight: 600 }}>Not measured</span>
                  </div>
                  {overdue.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-light)' }}>Average delivery delay</span>
                      <span style={{ fontWeight: 600, color: '#d97706' }}>Not measured</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Top buyers */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px' }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:5,marginBottom:12}}>
            <span style={{fontSize:10,fontWeight:700,color:'var(--text-light)',textTransform:'uppercase'}}>Top Buyers</span>
            {periodSelect(buyerPeriod,setBuyerPeriod)}
          </div>
          {topBuyers.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', padding: '20px 0' }}>No data yet</div>
          ) : topBuyers.map(([buyer, val], i) => (
            <div key={buyer} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: i === 0 ? 700 : 500 }}>{buyer}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mid)' }}>{fmtK(val)}</span>
              </div>
              <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#1a1a2e', borderRadius: 2, width: `${(val / maxBuyerVal) * 100}%`, opacity: i === 0 ? 1 : 0.4 + (0.1 * (4 - i)) }} />
              </div>
            </div>
          ))}
          {topBuyers.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 8 }}>
              Top performer: <span style={{ fontWeight: 700, color: 'var(--text)' }}>{topBuyers[0][0]}</span>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}