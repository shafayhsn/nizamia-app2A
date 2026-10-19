import React,{useState,useEffect} from 'react'
import {X,Copy} from 'lucide-react'
const operators=['+','−','×','÷']
function calculate(expression){
 const cleaned=expression.replaceAll('−','-').replaceAll('×','*').replaceAll('÷','/')
 if(!/^-?\d+(?:\.\d+)?(?:[+*/-]\d+(?:\.\d+)?)*$/.test(cleaned))return null
 const tokens=cleaned.match(/\d+(?:\.\d+)?|[+*/-]/g)
 if(!tokens)return null
 let nums=[],ops=[];let i=0
 if(cleaned.startsWith('-')){nums.push(-Number(tokens[1]));i=2}else{nums.push(Number(tokens[0]));i=1}
 for(;i<tokens.length;i+=2){ops.push(tokens[i]);nums.push(Number(tokens[i+1]))}
 for(let j=0;j<ops.length;){if(ops[j]==='*'||ops[j]==='/'){const v=ops[j]==='*'?nums[j]*nums[j+1]:nums[j]/nums[j+1];if(!Number.isFinite(v))return null;nums.splice(j,2,v);ops.splice(j,1)}else j++}
 let out=nums[0];ops.forEach((op,j)=>out=op==='+'?out+nums[j+1]:out-nums[j+1]);return Number.isFinite(out)?Number(out.toPrecision(12)):null
}
export default function QuickCalculator({onClose}){
 const [expression,setExpression]=useState('0');const [error,setError]=useState(false)
 const press=k=>{setError(false);if(k==='C'){setExpression('0');return}if(k==='⌫'){setExpression(v=>v.length>1?v.slice(0,-1):'0');return}if(k==='='){const n=calculate(expression);if(n===null){setError(true)}else setExpression(String(n).replaceAll('-','−'));return}
 setExpression(v=>{if(operators.includes(k)){if(operators.includes(v.slice(-1)))return v.slice(0,-1)+k;return v+k}if(k==='.'&&v.split(/[+−×÷]/).pop().includes('.'))return v;return v==='0'&&k!=='.'?k:v+k})}
 useEffect(()=>{const handler=e=>{if(e.key==='Escape'){onClose();return}if(e.key==='Enter'||e.key==='='){e.preventDefault();press('=')}else if(e.key==='Backspace')press('⌫');else if(e.key.toLowerCase()==='c')press('C');else if('0123456789.'.includes(e.key)&&e.key.length===1)press(e.key);else if(['+','-','*','/'].includes(e.key)){e.preventDefault();press({'-':'−','*':'×','/':'÷','+':'+'}[e.key])}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[expression,onClose])
 return <><div onClick={onClose} style={{position:'fixed',inset:0,zIndex:100}}/><div style={{position:'absolute',top:38,right:0,width:260,padding:12,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 12px 35px #0002',zIndex:101}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:13,fontWeight:700,marginBottom:10}}>Calculator<button onClick={onClose} aria-label="Close calculator" style={{border:0,background:'none',cursor:'pointer'}}><X size={16}/></button></div><div style={{padding:'14px 9px',background:'#f8fafc',borderRadius:7,textAlign:'right',fontSize:22,fontWeight:650,overflowX:'auto',whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{error?'Error':expression}</div><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginTop:10}}>{['C','⌫','÷','×','7','8','9','−','4','5','6','+','1','2','3','=','0','00','.'].map(k=><button key={k} onClick={()=>press(k)} style={{height:35,border:'1px solid #e5e7eb',borderRadius:6,cursor:'pointer',background:k==='='?'#1d4ed8':'#fff',color:k==='='?'white':'#334155',fontSize:14,fontWeight:600}}>{k}</button>)}</div><button onClick={()=>navigator.clipboard?.writeText(expression)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',marginTop:9,padding:7,border:'1px solid #e5e7eb',background:'#fff',borderRadius:6,cursor:'pointer',fontSize:11}}><Copy size={13}/> Copy value</button></div></>
}
