import React, { useEffect, useState } from 'react'
import { Calculator, Truck, Layers, Activity, Tag, Box, Scale, Palette, BookImage, BookOpen, ShieldCheck, X, Construction } from 'lucide-react'
import { ThreadCalc, CBMCalc, GSMFinder, PantoneConverter } from '../components/tools/ToolsTray'
import FeatureResource from '../components/tools/FeatureResource'
import CreateParcelFeature from '../components/tools/CreateParcelFeature'

const FEATURES = [
  {id:'costing',label:'Costing Sheet',icon:Calculator,color:'#16a34a',ready:false},
  {id:'dispatch',label:'Parcel Dispatch',icon:Truck,color:'#4f46e5',ready:true},
  {id:'fabric',label:'Fabric Consumption',icon:Layers,color:'#2563eb',ready:false},
  {id:'thread',label:'Sewing Thread',icon:Activity,color:'#db2777',ready:true},
  {id:'accessories',label:'Accessories / Trims',icon:Tag,color:'#ea580c',ready:false},
  {id:'cbm',label:'CBM Calculator',icon:Box,color:'#0d9488',ready:true},
  {id:'gsm',label:'Fabric GSM',icon:Scale,color:'#dc2626',ready:true,partial:true},
  {id:'pantone',label:'Pantone Converter',icon:Palette,color:'#e11d48',ready:true,partial:true},
  {id:'catalogue',label:'Catalogue Maker',icon:BookImage,color:'#d97706',ready:false},
]
const COMPONENTS={thread:ThreadCalc,cbm:CBMCalc,gsm:GSMFinder,pantone:PantoneConverter}
const card={border:'1px solid #e1e5eb',borderRadius:12,background:'#fff',boxShadow:'0 1px 3px #1018280b'}
export default function Features(){
  const [active,setActive]=useState(null)
  const feature=FEATURES.find(x=>x.id===active)
  const Tool=COMPONENTS[active]
  useEffect(()=>{if(!active)return;const onKey=e=>{if(e.key==='Escape')setActive(null)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[active])
  return <div style={{padding:'18px 28px 18px',height:'100%',minHeight:0,overflow:'hidden',display:'flex',flexDirection:'column',boxSizing:'border-box',background:'#fafbfc'}}>
    <div style={{marginBottom:16,flexShrink:0}}><h1 style={{fontSize:24,fontWeight:750,margin:0,color:'#1a1a2e'}}>Features</h1></div>
    <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10,flexShrink:0,color:'#667085',fontSize:13,fontWeight:750,letterSpacing:'.35px'}}><Calculator size={17}/> PRODUCTION UTILITIES</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,marginBottom:18,flexShrink:0}}>
      {FEATURES.map(f=><button key={f.id} onClick={()=>setActive(f.id)} style={{...card,cursor:'pointer',minHeight:96,padding:'10px 10px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:7,fontFamily:'inherit',position:'relative'}} title={f.ready?'Open '+f.label:f.label+' · Not configured yet'}>
        <span style={{width:35,height:35,borderRadius:'50%',display:'grid',placeItems:'center',background:f.color+'12',color:f.color}}><f.icon size={19} strokeWidth={1.9}/></span>
        <span style={{fontSize:13,fontWeight:650,color:'#344054',textAlign:'center'}}>{f.label}</span>
        {!f.ready&&<span style={{position:'absolute',right:9,top:9,fontSize:9,color:'#98a2b3'}}>Coming soon</span>}
      </button>)}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:16,flex:'1 1 0',minHeight:0}}>
      <FeatureResource />
      <FeatureResource certificates />
    </div>
    {active==='dispatch'&&<CreateParcelFeature onClose={()=>setActive(null)}/>}
    {feature&&active!=='dispatch'&&<div role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setActive(null)}} style={{position:'fixed',inset:0,zIndex:1100,background:'rgba(15,23,42,.52)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div role="dialog" aria-modal="true" aria-label={feature.label} style={{background:'#fff',width:'min(620px,95vw)',maxHeight:'min(760px,90vh)',borderRadius:13,boxShadow:'0 20px 70px #0003',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'19px 22px',borderBottom:'1px solid #e9edf1',display:'flex',alignItems:'center',gap:11,flexShrink:0}}><feature.icon size={21} color={feature.color}/><strong style={{fontSize:17,flex:1,color:'#252b35'}}>{feature.label}</strong><button aria-label="Close feature" onClick={()=>setActive(null)} style={{background:'none',border:0,cursor:'pointer',color:'#98a2b3',padding:5}}><X size={21}/></button></div>
        <div style={{padding:24,overflowY:'auto',minHeight:160}}>
          {Tool?<><Tool/>{feature.partial&&<p style={{marginTop:20,fontSize:11,color:'#98a2b3'}}>Some advanced lookup functions are not yet configured.</p>}</>:<div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:170,gap:12,color:'#98a2b3'}}><Construction size={30}/><strong style={{color:'#667085'}}>Not configured yet</strong><span style={{fontSize:12}}>This utility will be added in a future update.</span></div>}
        </div>
      </div>
    </div>}
  </div>
}
