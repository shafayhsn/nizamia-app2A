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
const tables={addresses:'buyer_addresses',contacts:'buyer_contacts',snapshots:'parcel_invoice_snapshots',testing_orders:'testing_orders',testing_requirements:'testing_requirements'}
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

 if(action==='testing'&&req.method==='GET'){
   const [requirements,issued,suppliers,orders]=await Promise.all([
     db.from('testing_requirements').select('*').order('created_at',{ascending:false}).limit(5000),
     db.from('testing_orders').select('*').order('issued_at',{ascending:false}).limit(2000),
     db.from('suppliers').select('id,name,category,phone,email').ilike('category','Testing'),
     db.from('orders').select('id,job_number,style_number,buyer_name,po_number,factory_ref').limit(5000)
   ])
   for(const result of [requirements,issued,suppliers,orders])if(result.error)return err(res,500,'Could not load testing data: '+result.error.message)
   return res.json({requirements:requirements.data||[],testingOrders:issued.data||[],suppliers:suppliers.data||[],orders:orders.data||[]})
 }
 if(action==='testingSave'&&req.method==='POST'){
   const orderId=String(req.body?.orderId||'')
   const rows=req.body?.rows
   if(!orderId||!Array.isArray(rows)||rows.length>500)return err(res,400,'Invalid testing requirements')
   const {data:order}=await db.from('orders').select('id').eq('id',orderId).maybeSingle()
   if(!order)return err(res,404,'Order not found')
   const {data:existing,error:existingError}=await db.from('testing_requirements').select('*').eq('order_id',orderId)
   if(existingError)return err(res,500,'Could not load existing requirements')
   const sourceRows={bom:[],sample:[]}
   for(const row of rows){
     if(!['bom','sample'].includes(row.source_type)||typeof row.source_id!=='string'||String(row.test_name||'').length>200)return err(res,400,'Invalid testing source or test name')
     sourceRows[row.source_type].push(row.source_id)
   }
   const unique=new Set(rows.map(x=>x.source_type+':'+x.source_id))
   if(unique.size!==rows.length)return err(res,400,'Duplicate testing sources')
   const [bom,samples]=await Promise.all([
     sourceRows.bom.length?db.from('bom_items').select('id,name,category,specification,detail').eq('order_id',orderId).in('id',sourceRows.bom):Promise.resolve({data:[]}),
     sourceRows.sample.length?db.from('samples').select('id,sample_number,sample_type,size,color').eq('order_id',orderId).in('id',sourceRows.sample):Promise.resolve({data:[]})
   ])
   if(bom.error||samples.error)return err(res,500,'Could not validate testing sources')
   if((bom.data||[]).length!==sourceRows.bom.length||(samples.data||[]).length!==sourceRows.sample.length)return err(res,400,'One or more sources do not belong to this order')
   const bySource=new Map([...bom.data.map(x=>['bom:'+x.id,{name:x.name||x.category||'BOM item',specification:[x.specification,x.detail].filter(Boolean).join(' · ')}]),...samples.data.map(x=>['sample:'+x.id,{name:x.sample_number||x.sample_type||'Sample',specification:[x.sample_type,x.size,x.color].filter(Boolean).join(' · ')}])])
   const previous=new Map((existing.data||[]).map(x=>[x.source_type+':'+x.source_id,x]))
   for(const old of existing.data||[]){
     const key=old.source_type+':'+old.source_id
     if(!unique.has(key)){
       if(old.status!=='awaiting_order')return err(res,409,'Issued testing requirements cannot be removed')
       const {error}=await db.from('testing_requirements').delete().eq('id',old.id).eq('status','awaiting_order')
       if(error)return err(res,500,'Could not remove requirement')
     }
   }
   for(const row of rows){
     const k=row.source_type+':'+row.source_id,old=previous.get(k)
     if(old&&old.status!=='awaiting_order')continue
     const details=bySource.get(k)
     const payload={order_id:orderId,source_type:row.source_type,source_id:row.source_id,item_name:details.name,specification:details.specification,test_name:String(row.test_name||'').trim()}
     const result=old?await db.from('testing_requirements').update(payload).eq('id',old.id).eq('status','awaiting_order'):await db.from('testing_requirements').insert(payload)
     if(result.error)return err(res,500,'Could not save requirement: '+result.error.message)
   }
   const {error:flagError}=await db.from('orders').update({step_testing:true}).eq('id',orderId)
   if(flagError)return err(res,500,'Could not update wizard step')
   return res.json({ok:true})
 }
 if(action==='testingIssue'&&req.method==='POST'){
   const supplierId=String(req.body?.supplierId||''),ids=req.body?.requirementIds
   if(!supplierId||!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length)return err(res,400,'Choose a testing supplier and valid requirements')
   const {data:supplier}=await db.from('suppliers').select('id').eq('id',supplierId).ilike('category','Testing').maybeSingle()
   if(!supplier)return err(res,400,'Supplier must belong to the Testing category')
   const {data:available,error:lookupError}=await db.from('testing_requirements').select('id,status').in('id',ids)
   if(lookupError||available?.length!==ids.length||available.some(x=>x.status!=='awaiting_order'))return err(res,409,'One or more requirements are no longer available')
   const {data:seq,error:seqError}=await db.rpc('next_testing_order_number')
   if(seqError||!seq)return err(res,500,'Could not allocate testing order number')
   const {data:issued,error:issueError}=await db.from('testing_orders').insert({supplier_id:supplierId,order_number:seq,notes:String(req.body?.notes||'').slice(0,2000)}).select('id,order_number').single()
   if(issueError)return err(res,500,'Could not create testing order')
   const {data:updated,error:updateError}=await db.from('testing_requirements').update({testing_order_id:issued.id,status:'ordered'}).in('id',ids).eq('status','awaiting_order').select('id')
   if(updateError||updated.length!==ids.length){
     await db.from('testing_requirements').update({testing_order_id:null,status:'awaiting_order'}).eq('testing_order_id',issued.id)
     await db.from('testing_orders').delete().eq('id',issued.id)
     return err(res,409,'Testing requirements changed during issue; please refresh')
   }
   return res.json({ok:true,testingOrder:issued})
 }
 if(action==='testingComplete'&&req.method==='POST'){
   const id=String(req.body?.testingOrderId||'')
   const {data:testingOrder}=await db.from('testing_orders').select('id,status').eq('id',id).maybeSingle()
   if(!testingOrder||testingOrder.status!=='ordered')return err(res,409,'Testing order is not open')
   const {error}=await db.from('testing_orders').update({status:'completed'}).eq('id',id).eq('status','ordered')
   if(error)return err(res,500,'Could not complete testing order')
   const {error:detailError}=await db.from('testing_requirements').update({status:'completed'}).eq('testing_order_id',id).eq('status','ordered')
   if(detailError)return err(res,500,'Could not complete testing requirements')
   return res.json({ok:true})
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
