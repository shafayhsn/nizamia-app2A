import { trackedFetch } from './syncTracker'
import { createClient } from '@supabase/supabase-js'

// The Mac preview uses its existing SQLite records via Electron's local origin.
// The online web app keeps its original Supabase client unchanged.
const isMacOffline = typeof location !== 'undefined' && location.protocol === 'app2a:'
const offlineTables = new Set(['orders','tasks','buyers','suppliers','purchase_orders','samples','parcels','shipments','production_daily_entries','costing','pp_meetings'])
function offlineQuery(table) {
  let filters=[],sort=null,limit=null,single=false
  const run=async()=>{
    try {
      if(!offlineTables.has(table))return {data:single?null:[],error:new Error('This table is not yet available offline')}
      const response=await fetch('/api/offline/records?table='+encodeURIComponent(table))
      const payload=await response.json()
      if(!response.ok)throw Error(payload.error||'Offline database read failed')
      let rows=payload.data||[]
      for(const [field,operator,value] of filters){
        if(operator==='eq')rows=rows.filter(r=>String(r[field]??'')===String(value??''))
        if(operator==='neq')rows=rows.filter(r=>String(r[field]??'')!==String(value??''))
        if(operator==='is')rows=rows.filter(r=>value===null?r[field]==null:r[field]===value)
      }
      if(sort)rows=[...rows].sort((a,b)=>String(a[sort.field]??'').localeCompare(String(b[sort.field]??''))*(sort.ascending?1:-1))
      if(limit!==null)rows=rows.slice(0,limit)
      return {data:single?(rows[0]||null):rows,error:null}
    }catch(error){return {data:null,error}}
  }
  const query={
    select:()=>query,
    eq:(field,value)=>(filters.push([field,'eq',value]),query),
    neq:(field,value)=>(filters.push([field,'neq',value]),query),
    is:(field,value)=>(filters.push([field,'is',value]),query),
    not:(field,operator,value)=>(filters.push([field,operator==='is'?'neq':'neq',value]),query),
    order:(field,opts={})=>(sort={field,ascending:opts.ascending!==false},query),
    limit:value=>(limit=Math.max(0,Number(value)||0),query),
    maybeSingle:()=>(single=true,query),
    single:()=>(single=true,query),
    then:(resolve,reject)=>run().then(resolve,reject),
    insert:()=>Promise.resolve({data:null,error:new Error('Original web editor is not yet connected to local SQLite')}),
    update:()=>Promise.resolve({data:null,error:new Error('Original web editor is not yet connected to local SQLite')}),
    delete:()=>Promise.resolve({data:null,error:new Error('Original web editor is not yet connected to local SQLite')}),
    upsert:()=>Promise.resolve({data:null,error:new Error('Original web editor is not yet connected to local SQLite')})
  }
  return query
}
const offlineClient={from:offlineQuery}
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = isMacOffline ? offlineClient : (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {global:{fetch:trackedFetch}})
  : new Proxy({}, { get() { return () => Promise.resolve({ data: null, error: null }) } })
