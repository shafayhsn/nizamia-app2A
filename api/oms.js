import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

const key=process.env.SUPABASE_SERVICE_ROLE_KEY
const url=process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const db=key&&url?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null
const cookieName='nizamia_backend_session'
const sign=payload=>createHmac('sha256',key).update(payload).digest('base64url')
const readCookie=req=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)
const session=async req=>{
 const token=readCookie(req)
 if(!token)return null
 const [payload,mac]=token.split('.')
 if(!payload||!mac)return null
 const expected=sign(payload)
 if(mac.length!==expected.length||!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null
 let info;try{info=JSON.parse(Buffer.from(payload,'base64url').toString())}catch{return null}
 if(!info.id||!info.exp||Date.now()>info.exp)return null
 const {data,error}=await db.from('users').select('id,role,is_active,is_restricted').eq('id',info.id).maybeSingle()
 if(error||!data||data.is_active===false||data.is_restricted===true)return null
 return data
}
const err=(res,code,message)=>res.status(code).json({error:message})
const tables={addresses:'buyer_addresses',contacts:'buyer_contacts',snapshots:'parcel_invoice_snapshots'}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store')
 if(!db)return err(res,503,'Backend Supabase configuration missing')
 if(!['POST','GET'].includes(req.method))return err(res,405,'Method not allowed')
 const action=req.method==='GET'?req.query.action:req.body?.action
 if(action==='login'&&req.method==='POST'){
   const identifier=String(req.body?.identifier||'').trim().slice(0,320)
   const password=String(req.body?.password||'')
   if(!identifier||!password)return err(res,400,'Credentials required')
   const field=identifier.includes('@')?'email':'username'
   const {data,error}=await db.from('users').select('id,password_hash,is_active,is_restricted').eq(field,identifier).maybeSingle()
   if(error||!data||data.is_active===false||data.is_restricted===true)return err(res,401,'Invalid credentials')
   const stored=Buffer.from(String(data.password_hash||''))
   const supplied=Buffer.from(password)
   if(stored.length!==supplied.length||!timingSafeEqual(stored,supplied))return err(res,401,'Invalid credentials')
   const payload=Buffer.from(JSON.stringify({id:data.id,exp:Date.now()+8*60*60*1000})).toString('base64url')
   res.setHeader('Set-Cookie',cookieName+'='+payload+'.'+sign(payload)+'; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=28800')
   return res.json({ok:true})
 }
 if(action==='logout'&&req.method==='POST'){
   res.setHeader('Set-Cookie',cookieName+'=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0')
   return res.json({ok:true})
 }
 const user=await session(req)
 if(!user)return err(res,401,'Please sign in again to access buyer details')
 if(action==='session')return res.json({ok:true})
 if(action==='backupProtected'&&req.method==='GET'){
   const role=String(user.role||'').toLowerCase()
   const {data:roleRow}=await db.from('roles').select('name').eq('id',user.role).maybeSingle()
   if(role!=='admin'&&String(roleRow?.name||'').toLowerCase()!=='admin')return err(res,403,'Admin access required')
   const result={}
   for(const [type,table] of Object.entries(tables)){
     const {data,error}=await db.from(table).select('*').limit(10000)
     if(error)return err(res,500,'Could not export '+type)
     if(data.length===10000)return err(res,500,'Backup limit reached for '+type)
     result[table]=data
   }
   return res.json({tables:result})
 }

 if(action==='createParcel'&&req.method==='POST'){
   const payload=req.body?.parcel
   if(!payload||typeof payload!=='object'||!Array.isArray(payload.items)||!Array.isArray(payload.custom_items))return err(res,400,'Invalid parcel data')
   const {data:number,error:numberError}=await db.rpc('allocate_parcel_number_2026')
   if(numberError||!number)return err(res,500,'Could not allocate parcel number')
   const {data,error}=await db.from('parcels').insert({...payload,id:number}).select('id').single()
   if(error)return err(res,500,'Could not create parcel: '+error.message)
   return res.json({id:data.id})
 }
 const type=req.method==='GET'?req.query.type:req.body?.type
 const table=tables[type]
 if(!table)return err(res,400,'Invalid data type')
 if(type==='snapshots'){
   const parcelId=String(req.method==='GET'?req.query.parcelId:req.body?.parcelId||'')
   if(!parcelId)return err(res,400,'Parcel ID required')
   if(req.method==='GET'){
     const {data,error}=await db.from(table).select('*').eq('parcel_id',parcelId).maybeSingle()
     return error?err(res,500,'Could not load invoice'):res.json({data})
   }
   if(action!=='save')return err(res,400,'Invalid action')
   const {data:parcel}=await db.from('parcels').select('id').eq('id',parcelId).maybeSingle()
   if(!parcel)return err(res,404,'Parcel not found')
   const addressId=String(req.body?.addressId||'')
   const contactId=req.body?.contactId||null
   const {data:address}=await db.from('buyer_addresses').select('*').eq('id',addressId).maybeSingle()
   if(!address)return err(res,400,'Address not found')
   let contact=null
   if(contactId){
     const result=await db.from('buyer_contacts').select('*').eq('id',contactId).eq('buyer_id',address.buyer_id).maybeSingle()
     contact=result.data
     if(!contact)return err(res,400,'Contact does not belong to this buyer')
   }
   const {data:buyer}=await db.from('buyers').select('name,contact_person').eq('id',address.buyer_id).maybeSingle()
   const consignee={name:address.recipient||buyer?.name||'',label:address.label||'',address_line1:address.address_line1||'',address_line2:address.address_line2||'',city:address.city||'',region:address.region||'',postal_code:address.postal_code||'',country:address.country||'',contact_name:contact?.name||buyer?.contact_person||'',phone:contact?.phone||address.phone||'',email:contact?.email||address.email||''}
   const {data,error}=await db.from(table).upsert({parcel_id:parcelId,buyer_id:address.buyer_id,address_id:addressId,contact_id:contactId,consignee,updated_at:new Date().toISOString()},{onConflict:'parcel_id'}).select('*').single()
   return error?err(res,500,'Could not save invoice'):res.json({data})
 }
 const buyerId=String(req.method==='GET'?req.query.buyerId:req.body?.buyerId||'')
 if(req.method==='GET'&&action==='check'){
   const {error}=await db.from(table).select('id').limit(1)
   return error?err(res,500,'Storage unavailable'):res.json({ok:true})
 }
 if(!buyerId)return err(res,400,'Buyer ID required')
 const {data:buyer}=await db.from('buyers').select('id').eq('id',buyerId).maybeSingle()
 if(!buyer)return err(res,404,'Buyer not found')
 if(req.method==='GET'){
   const {data,error}=await db.from(table).select('*').eq('buyer_id',buyerId).order('created_at')
   return error?err(res,500,'Could not load buyer details'):res.json({data:data||[]})
 }
 if(action!=='sync')return err(res,400,'Invalid action')
 if(!['admin','manager'].includes(String(user.role||'').toLowerCase()))return err(res,403,'Administrator or manager access required')
 const rows=req.body?.rows
 if(!Array.isArray(rows)||rows.length>100)return err(res,400,'Invalid records')
 if(rows.length&&rows.filter(r=>r.is_default).length!==1)return err(res,400,'Select exactly one default')
 const {data:old,error:oldError}=await db.from(table).select('id').eq('buyer_id',buyerId)
 if(oldError)return err(res,500,'Could not read existing details')
 const oldIds=new Set((old||[]).map(x=>x.id))
 for(const row of rows)if(row.id&&!oldIds.has(row.id))return err(res,400,'Record does not belong to buyer')
 const keep=new Set(rows.map(r=>r.id).filter(Boolean))
 const removed=(old||[]).map(r=>r.id).filter(id=>!keep.has(id))
 // Clear old defaults before upserting the new default to satisfy unique index.
 const {error:clearError}=await db.from(table).update({is_default:false}).eq('buyer_id',buyerId)
 if(clearError)return err(res,500,'Could not prepare default record')
 const allowed=type==='addresses'?['label','recipient','address_line1','address_line2','city','region','postal_code','country','phone','email','is_default']:['name','designation','department','phone','email','is_default']
 const incoming=rows.map(row=>({buyer_id:buyerId,...(row.id?{id:row.id}:{}),...Object.fromEntries(allowed.map(k=>[k,row[k]??(k==='is_default'?false:'')]))}))
 if(incoming.length){
   const {error}=await db.from(table).upsert(incoming)
   if(error)return err(res,500,'Could not save buyer details')
 }
 if(removed.length){
   const {error}=await db.from(table).delete().in('id',removed).eq('buyer_id',buyerId)
   if(error)return err(res,500,'Could not remove old buyer details')
 }
 return res.json({ok:true})
}
