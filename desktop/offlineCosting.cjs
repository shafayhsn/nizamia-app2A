'use strict'
// Standalone per-garment cost summary. Never guesses missing inputs.
const COST_KEYS=['fabric_cost','trims_cost','cmt_cost','washing_cost','overhead_cost']
function calculateCosting(fields){
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Invalid cost sheet')
 const costs={}
 for(const key of COST_KEYS){
  const raw=fields[key]
  if(raw===undefined||raw===null||raw==='')return {complete:false,missing:COST_KEYS.filter(k=>fields[k]===undefined||fields[k]===null||fields[k]===''),cost:null,fob:null,margin:null,marginPercent:null}
  const n=Number(raw)
  if(!Number.isFinite(n)||n<0)throw Error('Invalid '+key)
  costs[key]=n
 }
 const total=Object.values(costs).reduce((a,b)=>a+b,0)
 if(!Number.isFinite(total))throw Error('Invalid total cost')
 const cost=Math.round((total+Number.EPSILON)*10000)/10000
 const rawFob=fields.target_fob
 if(rawFob===undefined||rawFob===null||rawFob==='')return {complete:true,missing:[],cost,fob:null,margin:null,marginPercent:null}
 const fob=Number(rawFob)
 if(!Number.isFinite(fob)||fob<0)throw Error('Invalid target_fob')
 const margin=Math.round((fob-cost+Number.EPSILON)*10000)/10000
 return {complete:true,missing:[],cost,fob,margin,marginPercent:fob>0?Math.round(margin/fob*10000)/100:null}
}
module.exports={COST_KEYS,calculateCosting}
