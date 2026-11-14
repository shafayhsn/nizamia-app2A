import { trackedFetch } from './syncTracker'
import { createClient } from '@supabase/supabase-js'

// The Mac preview uses its existing SQLite records via Electron's local origin.
// The online web app keeps its original Supabase client unchanged.
const isMacOffline = typeof location !== 'undefined' && location.protocol === 'app2a:'
const offlineTables = new Set(['orders','tasks','buyers','suppliers','purchase_orders','purchase_order_items','samples','parcels','shipments','shipment_lines','production_daily_entries','costing','pp_meetings','production_plans','jobs','order_queues','bom_items','washing','embellishments','finishing','work_orders','buyer_addresses','buyer_contacts','supplier_contacts'])
function offlineQuery(table) {
  let filters=[],sort=null,limit=null,offset=0,single=false,strictSingle=false,headOnly=false,operation=null,payload=null,upsert=false,returnRows=false,countRequested=false,orGroups=[],columns='*'
  const load=async()=>{
    if(!/^[a-z][a-z0-9_]{0,63}$/.test(table))throw Error('Invalid offline table')
    const response=await fetch('/api/offline/records?table='+encodeURIComponent(table))
    const body=await response.json()
    if(!response.ok)throw Error(body.error||'Offline database read failed')
    let rows=body.data||[]
    const matches=(r,field,op,value)=>{
      const actual=r[field]
      if(op==='eq')return actual===value||(actual!=null&&value!=null&&String(actual)===String(value))
      if(op==='neq')return actual!=null&&value!=null&&String(actual)!==String(value)
      if(op==='is')return value===null?actual==null:actual===value
      if(op==='not-is')return value===null?actual!=null:actual!==value
      if(op==='in')return actual!=null&&Array.isArray(value)&&value.some(v=>v!=null&&String(v)===String(actual))
      if(op==='like'||op==='ilike'){if(actual==null)return false;const pattern=String(value).split('%').map(part=>part.split('_').map(x=>x.replace(/[^a-zA-Z0-9 ]/g,match=>String.fromCharCode(92)+match)).join('.')).join('.*');return new RegExp('^'+pattern+'$',op==='ilike'?'i':'').test(String(actual??''))}
      if(op==='contains')return Array.isArray(actual)?Array.isArray(value)&&value.every(v=>actual.includes(v)):!!(actual&&typeof actual==='object'&&value&&typeof value==='object'&&Object.entries(value).every(([k,v])=>actual[k]===v))
      if(op==='overlaps')return Array.isArray(actual)&&Array.isArray(value)&&value.some(v=>actual.includes(v))
      if(['gt','gte','lt','lte'].includes(op)){if(actual==null||value==null)return false;return op==='gt'?actual>value:op==='gte'?actual>=value:op==='lt'?actual<value:actual<=value}
      return false
    }
    for(const [field,op,value] of filters)rows=rows.filter(r=>matches(r,field,op,value))
    for(const group of orGroups)rows=rows.filter(r=>group.some(([field,op,value])=>matches(r,field,op,value)))
    if(sort)rows=[...rows].sort((a,b)=>{const x=a[sort.field],y=b[sort.field];const comparison=typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''));return comparison*(sort.ascending?1:-1)})
    const total=rows.length
    if(offset||limit!==null)rows=rows.slice(offset,limit===null?undefined:offset+limit)
    if(columns!=='*'&&typeof columns==='string'&&!columns.includes('(')){const keys=columns.split(',').map(x=>x.trim()).filter(x=>/^[a-z][a-z0-9_]*$/i.test(x));if(keys.length)rows=rows.map(r=>Object.fromEntries(keys.map(k=>[k,r[k]])))}
    return {rows,total}
  }
  const run=async()=>{
    try{
      if(!operation){const {rows,total}=await load();if(strictSingle&&rows.length!==1)return {data:null,error:new Error('Expected exactly one record; found '+rows.length),count:countRequested?total:null};return {data:headOnly?null:single?(rows[0]||null):rows,error:null,count:countRequested?total:null}}
      if(!offlineTables.has(table))throw Error('This table is not available offline')
      const previousColumns=columns,previousOffset=offset,previousLimit=limit
      columns='*';offset=0;limit=null
      let existing
      try{existing=operation==='create'?[]:(await load()).rows}finally{columns=previousColumns;offset=previousOffset;limit=previousLimit}
      if(operation!=='create' && existing.length!==1)throw Error('Exactly one local record must be selected for editing')
      if(operation==='create'&&Array.isArray(payload)&&payload.length>500)throw Error('Maximum 500 records per batch')
      if(operation==='create'&&Array.isArray(payload)&&!payload.length)throw Error('Empty insert batch')
      if(operation==='create'&&Array.isArray(payload)&&payload.length>1){
        const response=await fetch('/api/offline/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table,rows:payload})})
        const result=await response.json()
        if(!response.ok)throw Error(result.error||'Atomic batch insert failed')
        if(!returnRows)return {data:null,error:null}
        const savedResponse=await fetch('/api/offline/records?table='+encodeURIComponent(table))
        if(!savedResponse.ok)throw Error('Batch saved but record reload failed')
        const saved=(await savedResponse.json()).data||[]
        const ids=new Set(result.data.map(row=>String(row.id)))
        const records=saved.filter(row=>ids.has(String(row.id)))
        return {data:records,error:null}
      }
      if(upsert&&operation==='create'&&Array.isArray(payload))throw Error('Offline upsert of multiple records is not supported; no changes saved')
      if(upsert&&operation==='create'&&payload?.id){const oldColumns=columns,oldOffset=offset,oldLimit=limit;columns='*';offset=0;limit=null;let found;try{found=(await load()).rows.find(row=>String(row.id)===String(payload.id))}finally{columns=oldColumns;offset=oldOffset;limit=oldLimit}if(found){operation='update';existing=[found]}else throw Error('Offline upsert cannot assign an imported ID; use insert for new records')}
      const fields=operation==='create'?(Array.isArray(payload)?payload[0]:payload):operation==='update'?{...existing[0],...payload}:null
      if(fields){delete fields.id;delete fields._local_only;delete fields._local_updated_at;delete fields._local_edited}
      const response=await fetch('/api/offline/mutate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:operation,table,id:existing[0]?.id,fields})})
      const result=await response.json()
      if(!response.ok)throw Error(result.error||'Offline save failed')
      if(operation==='delete')return {data:null,error:null}
      if(!returnRows)return {data:null,error:null}
      const savedResponse=await fetch('/api/offline/records?table='+encodeURIComponent(table))
      if(!savedResponse.ok)throw Error('Record saved but reload failed')
      const record=(await savedResponse.json()).data?.find(row=>String(row.id)===String(result.data.id))
      if(!record)throw Error('Record saved but not found on reload')
      return {data:single?record:[record],error:null}
    }catch(error){return {data:null,error}}
  }
  const query={
    select:(_columns='*',options={})=>(columns=_columns,countRequested=!!options.count,headOnly=!!options.head,returnRows=!!operation,query),
    eq:(field,value)=>(filters.push([field,'eq',value]),query),
    neq:(field,value)=>(filters.push([field,'neq',value]),query),
    in:(field,values)=>(filters.push([field,'in',values]),query),
    like:(field,value)=>(filters.push([field,'like',value]),query),
    ilike:(field,value)=>(filters.push([field,'ilike',value]),query),
    contains:(field,value)=>(filters.push([field,'contains',value]),query),
    overlaps:(field,value)=>(filters.push([field,'overlaps',value]),query),
    or:expression=>{const group=String(expression).split(',').map(part=>{const match=part.match(/^([a-z][a-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)$/);if(!match)throw Error('Unsupported offline OR filter');return [match[1],match[2],match[3]==='null'?null:match[3]]});orGroups.push(group);return query},
    gt:(field,value)=>(filters.push([field,'gt',value]),query),
    gte:(field,value)=>(filters.push([field,'gte',value]),query),
    lt:(field,value)=>(filters.push([field,'lt',value]),query),
    lte:(field,value)=>(filters.push([field,'lte',value]),query),
    is:(field,value)=>(filters.push([field,'is',value]),query),
    not:(field,operator,value)=>(filters.push([field,operator==='is'?'not-is':'neq',value]),query),
    order:(field,opts={})=>(sort={field,ascending:opts.ascending!==false},query),
    limit:value=>(limit=Math.max(0,Number(value)||0),query),
    range:(start,end)=>(offset=Math.max(0,Number(start)||0),limit=Math.max(0,Number(end)-offset+1),query),
    maybeSingle:()=>(single=true,query),
    match:values=>(Object.entries(values||{}).forEach(([field,value])=>filters.push([field,'eq',value])),query),
    single:()=>(single=true,strictSingle=true,query),
    insert:value=>(operation='create',payload=value,query),
    update:value=>(operation='update',payload=value,query),
    delete:()=>(operation='delete',query),
    upsert:value=>(operation='create',payload=value,upsert=true,query),
    then:(resolve,reject)=>run().then(resolve,reject)
  }
  return query
}
const offlineClient={from:offlineQuery}
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = isMacOffline ? offlineClient : (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {global:{fetch:trackedFetch}})
  : new Proxy({}, { get() { return () => Promise.resolve({ data: null, error: null }) } })
