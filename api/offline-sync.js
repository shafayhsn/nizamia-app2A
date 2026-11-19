import {createClient} from '@supabase/supabase-js'
import desktopOrderSync from '../server/desktopOrderSync.cjs'

const key=process.env.SUPABASE_SERVICE_ROLE_KEY
const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL
const enabled=process.env.DESKTOP_OFFLINE_SYNC_ENABLED==='true'
const db=enabled&&key&&url?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null
const sync=db?desktopOrderSync.createDesktopOrderSync({db,key,actorDb:actor=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'x-nzos-actor':actor,'x-nzos-source':'Mac'}}})}):null

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(!sync)return res.status(503).json({error:'Cloud synchronization is unavailable'})
 const rawBody=typeof req.body==='string'?req.body:JSON.stringify(req.body)
 const result=await sync({method:req.method,headers:req.headers,rawBody})
 return res.status(result.status).json(result.body)
}
