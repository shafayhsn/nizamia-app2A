import { trackedFetch } from './syncTracker'
import { createClient } from '@supabase/supabase-js'

// The Mac preview uses its existing SQLite records via Electron's local origin.
// The online web app keeps its original Supabase client unchanged.
const isMacOffline = typeof location !== 'undefined' && location.protocol === 'app2a:'
const offlineTables = new Set(['orders','tasks','buyers','suppliers','purchase_orders','samples','parcels','shipments','production_daily_entries','costing','pp_meetings'])
function offlineQuery(table) {
  let filters=[],sort=null,limit=null,single=false,operation=null,payload=null
  const load=async()=>{
    if(!offlineTables.has(table))throw Error('This table is not yet available offline')
    const response=await fetch('/api/offline/records?table='+encodeURIComponent(table))
    const body=await response.json()
    if(!response.ok)throw Error(body.error||'Offline database read failed')
    let rows=body.data||[]
    for(const [field,op,value] of filters){
      if(op==='eq')rows=rows.filter(r=>String(r[field]??'')===String(value??''))
      if(op==='neq')rows=rows.filter(r=>String(r[field]??'')!==String(value??''))
      if(op==='is')rows=rows.filter(r=>value===null?r[field]==null:r[field]===value)
      if(op==='in')rows=rows.filter(r=>Array.isArray(value)&&value.some(v=>String(v)===String(r[field])))
      if(['gt','gte','lt','lte'].includes(op))rows=rows.filter(r=>{const a=r[field],b=value;if(a==null)return false;return op==='gt'?a>b:op==='gte'?a>=b:op==='lt'?a<b:a<=b})
    }
    if(sort)rows=[...rows].sort((a,b)=>String(a[sort.field]??'').localeCompare(String(b[sort.field]??''))*(sort.ascending?1:-1))
    if(limit!==null)rows=rows.slice(0,limit)
    return rows
  }
  const run=async()=>{
    try{
      if(!operation){const rows=await load();return {data:single?(rows[0]||null):rows,error:null}}
      if(!offlineTables.has(table))throw Error('This table is not available offline')
      const existing=operation==='create'?[]:await load()
      if(operation!=='create' && existing.length!==1)throw Error('Exactly one local record must be selected for editing')
      if(operation!=='create' && !String(existing[0].id||'').startsWith('local-'))throw Error('Imported cloud records are read-only')
      if(operation==='create'&&Array.isArray(payload)&&payload.length!==1)throw Error('Batch inserts are not supported offline yet')
      const fields=operation==='create'?(Array.isArray(payload)?payload[0]:payload):operation==='update'?{...existing[0],...payload}:null
      if(fields){delete fields.id;delete fields._local_only;delete fields._local_updated_at}
      const response=await fetch('/api/offline/mutate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:operation,table,id:existing[0]?.id,fields})})
      const result=await response.json()
      if(!response.ok)throw Error(result.error||'Offline save failed')
      return {data:operation==='delete'?null:single?{id:result.data.id}:{id:result.data.id},error:null}
    }catch(error){return {data:null,error}}
  }
  const query={
    select:()=>query,
    eq:(field,value)=>(filters.push([field,'eq',value]),query),
    neq:(field,value)=>(filters.push([field,'neq',value]),query),
    in:(field,values)=>(filters.push([field,'in',values]),query),
    gt:(field,value)=>(filters.push([field,'gt',value]),query),
    gte:(field,value)=>(filters.push([field,'gte',value]),query),
    lt:(field,value)=>(filters.push([field,'lt',value]),query),
    lte:(field,value)=>(filters.push([field,'lte',value]),query),
    is:(field,value)=>(filters.push([field,'is',value]),query),
    not:(field,operator,value)=>(filters.push([field,operator==='is'?'neq':'neq',value]),query),
    order:(field,opts={})=>(sort={field,ascending:opts.ascending!==false},query),
    limit:value=>(limit=Math.max(0,Number(value)||0),query),
    maybeSingle:()=>(single=true,query),
    single:()=>(single=true,query),
    insert:value=>(operation='create',payload=value,query),
    update:value=>(operation='update',payload=value,query),
    delete:()=>(operation='delete',query),
    upsert:()=>({then:(resolve,reject)=>Promise.resolve({data:null,error:new Error('Upsert is not yet available offline')}).then(resolve,reject)}),
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
