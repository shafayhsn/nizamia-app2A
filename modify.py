from pathlib import Path
p=Path('src/components/layout/Layout.jsx');s=p.read_text();s=s.replace("import DeadlinesTracker from '../ui/DeadlinesTracker'", "import DeadlinesTracker from '../ui/DeadlinesTracker'\nimport OrderWizard from '../wizard/OrderWizard'\nimport { Minus, ChevronUp, X } from 'lucide-react'")
s=s.replace("  const [deadlinesOpen, setDeadlinesOpen] = useState(false)","""  const [deadlinesOpen, setDeadlinesOpen] = useState(false)
  const [orderWindow,setOrderWindow] = useState(null)
  const [orderMinimized,setOrderMinimized] = useState(false)
  useEffect(()=>{
    const open=e=>{const detail=e.detail||{};setOrderWindow(prev=>prev || {order:detail.order||null,initialStep:detail.initialStep||1});setOrderMinimized(false)}
    window.addEventListener('app2a-open-order-window',open)
    return()=>window.removeEventListener('app2a-open-order-window',open)
  },[])
  const closeOrderWindow=()=>{setOrderWindow(null);setOrderMinimized(false);window.dispatchEvent(new Event('app2a-order-window-closed'))}
""")
s=s.replace('      <DeadlinesTracker open={deadlinesOpen}', '''      {orderWindow && <OrderWizard key={orderWindow.order?.id||'new-order'} order={orderWindow.order} initialStep={orderWindow.initialStep} minimized={orderMinimized} onMinimize={()=>setOrderMinimized(true)} onClose={closeOrderWindow} />}
      {orderWindow && orderMinimized && <div role="region" aria-label="Minimized windows" style={{position:'fixed',right:20,bottom:18,zIndex:700,display:'flex',gap:8,maxWidth:'calc(100vw - 24px)'}}>
        <button onClick={()=>setOrderMinimized(false)} title="Restore Order Wizard" style={{display:'flex',alignItems:'center',gap:8,background:'#fff',border:'1px solid #cbd5e1',borderRadius:9,boxShadow:'0 6px 24px #0002',padding:'10px 12px',cursor:'pointer',fontSize:12,fontWeight:700,color:'#111827'}}><ChevronUp size={15}/>{orderWindow.order?`Edit Order · ${orderWindow.order.style_number||''}`:'New Order'}</button>
        <button onClick={closeOrderWindow} title="Close minimized window (unsaved changes may be lost)" style={{background:'#fff',border:'1px solid #cbd5e1',borderRadius:8,padding:8,cursor:'pointer'}}><X size={14}/></button>
      </div>}
      <DeadlinesTracker open={deadlinesOpen}''')
p.write_text(s)
p=Path('src/components/wizard/OrderWizard.jsx');s=p.read_text().replace('ChevronLeft, ChevronRight, Check, X, Copy','ChevronLeft, ChevronRight, Check, X, Copy, Minus');s=s.replace('order, onClose, initialStep = 1','order, onClose, onMinimize, minimized = false, initialStep = 1');s=s.replace("style={{ position: 'fixed', inset: 0, zIndex: 200, background:","style={{ display: minimized ? 'none' : 'flex', position: 'fixed', inset: 0, zIndex: 200, background:")
s=s.replace('          <button onClick={onClose} style={{ background:', '''          {onMinimize && <button onClick={onMinimize} title="Minimize window" aria-label="Minimize window" style={{background:'none',border:0,cursor:'pointer',color:'#64748b',display:'flex',padding:4,borderRadius:4}}><Minus size={17}/></button>}
          <button onClick={onClose} style={{ background:''',1)
p.write_text(s)
p=Path('src/pages/Orders.jsx');s=p.read_text();s=s.replace("  function openNew()    { setEditOrder(null); setWizardInitialStep(1); setWizardOpen(true) }","  function openNew()    { window.dispatchEvent(new CustomEvent('app2a-open-order-window',{detail:{order:null,initialStep:1}})) }")
s=s.replace("  function openEdit(o, step=1)  { setEditOrder(o); setWizardInitialStep(step); setWizardOpen(true) }","  function openEdit(o, step=1)  { window.dispatchEvent(new CustomEvent('app2a-open-order-window',{detail:{order:o,initialStep:step}})) }")
s=s.replace("      {wizardOpen     && <OrderWizard order={editOrder} initialStep={wizardInitialStep} onClose={closeWizard} />}","      {/* Order Wizard is hosted in Layout so it survives page navigation while minimized. */}")
needle="  function closeWizard(){ markTabUpdated('ordersPage', 'orders'); setTabNotices(getPageTabNoticeMap('ordersPage', ['orders','queues'])); setWizardOpen(false); setEditOrder(null); loadOrders() }"
# refresh Orders after closing globally hosted wizard
s=s.replace(needle,needle+"\n  useEffect(()=>{const handler=()=>{markTabUpdated('ordersPage','orders');loadOrders()};window.addEventListener('app2a-order-window-closed',handler);return()=>window.removeEventListener('app2a-order-window-closed',handler)},[])")
p.write_text(s)
