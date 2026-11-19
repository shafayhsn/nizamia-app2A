import {createClient} from '@supabase/supabase-js'
import desktopMutationHttp from '../../server/desktopMutationHttp.cjs'

const key=process.env.SUPABASE_SERVICE_ROLE_KEY
const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL
const db=process.env.DESKTOP_OFFLINE_SYNC_ENABLED==='true'&&key&&url
 ?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
 :null
const handle=db&&desktopMutationHttp.createDesktopMutationHttp({db,key,actorDb:actor=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'x-nzos-actor':actor,'x-nzos-source':'Mac'}}})})

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(!handle)return res.status(503).json({error:'Desktop mutation synchronization is unavailable'})
 const reply=await handle({method:req.method,headers:req.headers,body:req.body})
 return res.status(reply.status).json(reply.body)
}
