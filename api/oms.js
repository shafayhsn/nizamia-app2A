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
 const {data,error}=await db.from('users').select('id,role,role_id,is_active,is_restricted').eq('id',info.id).maybeSingle()
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
 if(action==='globalSearch'&&req.method==='GET'){
   const q=String(req.query.q||'').trim().slice(0,100)
   if(q.length<2)return res.json({results:[]})
   const safe=q.replace(/[%,()]/g,' ').trim()
   if(!safe)return res.json({results:[]})
   const like='%'+safe+'%'
   const sources=[
     {table:'orders',category:'Orders',module:'orders',fields:'id,job_number,style_number,po_number,buyer_name,description,factory_ref,brand_name,store_name,notes',match:["job_number","style_number","po_number","buyer_name","description","factory_ref","brand_name","store_name","notes"],ref:'job_number',label:'style_number',path:'/orders'},
     {table:'jobs',category:'Jobs',module:'orders',fields:'id,job_number,season,notes',match:["job_number","season","notes"],ref:'job_number',label:'season',path:'/orders'},
     {table:'order_queues',category:'Order queues',module:'orders',fields:'id,q_number,label,color_name,notes,order_id',match:["q_number","label","color_name","notes"],ref:'q_number',label:'label',path:'/orders'},
     {table:'buyers',category:'Buyers',module:'buyers',fields:'id,name,contact_person,email,phone,country,notes',match:["name","contact_person","email","phone","country","notes"],ref:'name',label:'contact_person',path:'/buyers'},
     {table:'buyer_contacts',category:'Buyer contacts',module:'buyers',fields:'id,buyer_id,name,designation,department,email,phone',match:["name","designation","department","email","phone"],ref:'name',label:'designation',path:'/buyers'},
     {table:'buyer_addresses',category:'Buyer addresses',module:'buyers',fields:'id,buyer_id,label,recipient,address_line1,city,country',match:["label","recipient","address_line1","city","country"],ref:'label',label:'city',path:'/buyers'},
     {table:'suppliers',category:'Suppliers',module:'suppliers',fields:'id,name,category,contact_person,email,phone,notes',match:["name","category","contact_person","email","phone","notes"],ref:'name',label:'category',path:'/suppliers'},
     {table:'samples',category:'Sampling',module:'sampling',fields:'id,sample_number,order_id',match:["sample_number"],ref:'sample_number',label:'sample_number',path:'/sampling'},
     {table:'sample_comments',category:'Sampling comments',module:'sampling',fields:'id,sam_number,comment_text,root_sample_id',match:["sam_number","comment_text"],ref:'sam_number',label:'comment_text',path:'/sampling'},
     {table:'sample_logs',category:'Sampling history',module:'sampling',fields:'id,sam_number,event_type,notes,root_sample_id',match:["sam_number","event_type","notes"],ref:'sam_number',label:'event_type',path:'/sampling'},
     {table:'purchase_orders',category:'Purchasing',module:'purchasing',fields:'id,po_number,order_id,status',match:["po_number"],ref:'po_number',label:'status',path:'/purchasing'},
     {table:'purchase_order_items',category:'PO line items',module:'purchasing',fields:'id,po_id,description,specification',match:["description","specification"],ref:'description',label:'specification',path:'/purchasing'},
     {table:'work_orders',category:'Work orders',module:'purchasing',fields:'id,wo_number,order_id,factory_ref,notes',match:["wo_number","factory_ref","notes"],ref:'wo_number',label:'factory_ref',path:'/purchasing'},
     {table:'work_order_items',category:'Work order items',module:'purchasing',fields:'id,wo_id,process_name,dept_info',match:["process_name","dept_info"],ref:'process_name',label:'dept_info',path:'/purchasing'},
     {table:'testing_orders',category:'Testing orders',module:'purchasing',fields:'id,order_number,notes',match:["order_number","notes"],ref:'order_number',label:'notes',path:'/purchasing'},
     {table:'testing_requirements',category:'Testing requirements',module:'purchasing',fields:'id,order_id,item_name,specification,test_name',match:["item_name","specification","test_name"],ref:'item_name',label:'test_name',path:'/purchasing'},
     {table:'bom_items',category:'BOM materials',module:'orders',fields:'id,order_id,name,category,specification,notes',match:["name","category","specification","notes"],ref:'name',label:'specification',path:'/orders'},
     {table:'washing',category:'Washing',module:'orders',fields:'id,order_id,color_name,wash_type,wash_ref,notes',match:["color_name","wash_type","wash_ref","notes"],ref:'wash_ref',label:'wash_type',path:'/orders'},
     {table:'embellishments',category:'Embellishments',module:'orders',fields:'id,order_id,description,technique,placement,artwork_ref,notes',match:["description","technique","placement","artwork_ref","notes"],ref:'artwork_ref',label:'description',path:'/orders'},
     {table:'fitting_blocks',category:'Fitting blocks',module:'orders',fields:'id,order_id,block_name,spec_code',match:["block_name","spec_code"],ref:'spec_code',label:'block_name',path:'/orders'},
     {table:'order_processes',category:'Order processes',module:'orders',fields:'id,order_id,process_name',match:["process_name"],ref:'process_name',label:'process_name',path:'/orders'},
     {table:'finishing_packs',category:'Packing',module:'orders',fields:'id,order_id,pack_name,pack_type',match:["pack_name","pack_type"],ref:'pack_name',label:'pack_type',path:'/orders'},
     {table:'production_batches',category:'Production batches',module:'orders',fields:'id,name',match:["name"],ref:'name',label:'name',path:'/production'},
     {table:'production_daily_entries',category:'Production entries',module:'orders',fields:'id,order_id,job_number,buyer_name,style_number,po_number,department,movement',match:["job_number","buyer_name","style_number","po_number","department","movement"],ref:'job_number',label:'department',path:'/production'},
     {table:'shipping_bookings',category:'Bookings',module:'shipping',fields:'id,booking_no,status,notes',match:["booking_no","status","notes"],ref:'booking_no',label:'status',path:'/shipping'},
     {table:'shipments',category:'Shipments',module:'shipping',fields:'id,shipment_no,container_no,booking_ref,gate_pass_no,delivery_challan_no,gd_no,hbl_hawb_no,fi_no,lc_no,notes',match:["shipment_no","container_no","booking_ref","gate_pass_no","delivery_challan_no","gd_no","hbl_hawb_no","fi_no","lc_no","notes"],ref:'shipment_no',label:'container_no',path:'/shipping'},
     {table:'parcels',category:'Parcels',module:'parcels',fields:'id,tracking_no,courier,notes',match:["tracking_no","courier","notes"],ref:'tracking_no',label:'courier',path:'/parcels'},
     {table:'app_tasks',category:'Tasks',module:'tasks',fields:'id,title,description,status,related_record',match:["title","description","status","related_record"],ref:'title',label:'description',path:'/tasks'},
     {table:'app_task_comments',category:'Task comments',module:'tasks',fields:'id,task_id,body',match:["body"],ref:'body',label:'body',path:'/tasks'},
     {table:'library_items',category:'Library items',module:'library',fields:'id,name,category,description,composition,colour,notes',match:["name","category","description","composition","colour","notes"],ref:'name',label:'category',path:'/library'},
     {table:'bom_presets',category:'BOM presets',module:'library',fields:'id,name,description',match:["name","description"],ref:'name',label:'description',path:'/library'},
     {table:'size_group_templates',category:'Size templates',module:'library',fields:'id,name,buyer_name',match:["name","buyer_name"],ref:'name',label:'buyer_name',path:'/library'},
     {table:'pp_meetings',category:'PP meetings',module:'reports',fields:'id,order_id,ppm_number,status,decision',match:["ppm_number","status","decision"],ref:'ppm_number',label:'status',path:'/reports/pp-meeting'},
     {table:'feature_certificates',category:'Certificates',module:'reports',fields:'id,certificate,certificate_number',match:["certificate","certificate_number"],ref:'certificate',label:'certificate_number',path:'/features'},
     {table:'document_numbering',category:'Document numbering',module:'settings',fields:'id,doc_type,prefix,label,pattern',match:["doc_type","prefix","label","pattern"],ref:'label',label:'prefix',path:'/settings'},
     {table:'uoms',category:'Units of measure',module:'settings',fields:'id,name,short_name,type',match:["name","short_name","type"],ref:'name',label:'short_name',path:'/settings'},
     {table:'roles',category:'Roles',module:'settings',fields:'id,name',match:["name"],ref:'name',label:'name',path:'/settings/users'}
   ]
   const allowed=new Set();
   if(String(user.role||'').toLowerCase()==='admin')sources.forEach(src=>allowed.add(src.category))
   else {
     const {data:permissions,error:permError}=user.role_id?await db.from('permissions').select('module,can_view').eq('role_id',user.role_id):{data:[],error:null}
     if(permError)return err(res,500,'Search permissions unavailable')
     const permitted=new Set((permissions||[]).filter(p=>p.can_view).map(p=>p.module))
     const legacy=user.role==='merchandiser'&&!user.role_id
     for(const src of sources){const mod=src.module;if(permitted.has(mod)||(legacy&&['orders','purchasing','buyers','suppliers','sampling','parcels','shipping','library','reports','tasks'].includes(mod)))allowed.add(src.category)}
   }
   const out=await Promise.all(sources.filter(src=>allowed.has(src.category)).map(async src=>{
     const query=db.from(src.table).select(src.fields).or(src.match.map(f=>f+'.ilike.'+like).join(',')).limit(5)
     const {data,error}=await query
     if(error)return {category:src.category,error:true,items:[]}
     return {category:src.category,module:src.module,items:(data||[]).map(row=>({id:row.id,reference:String(row[src.ref]||''),detail:String(row[src.label]||'').slice(0,160),path:src.path,orderId:row.order_id||null,taskId:row.task_id||null,buyerId:row.buyer_id||null,rootSampleId:row.root_sample_id||null,score:String(row[src.ref]||'').toLowerCase()===q.toLowerCase()?0:1}))}
   }))
   const results=out.flatMap(x=>x.items.flatMap(item=>x.category==='Sampling'?[{...item,category:x.category,module:x.module},{...item,module:x.module,category:'Sampling PDFs',documentType:'sampling-program',detail:'Generate and open sampling program PDF'}]:x.category==='Purchasing'?[{...item,category:x.category,module:x.module},{...item,module:x.module,category:'Purchase Order PDFs',documentType:'purchase-order',detail:'Generate and open supplier purchase order PDF'}]:[{...item,category:x.category,module:x.module}]))
   return res.json({results:results.sort((a,b)=>a.score-b.score).slice(0,90),partial:out.some(x=>x.error)})
 }
 if(action==='ppmList'&&req.method==='GET'){
   const orderId=String(req.query.orderId||'')
   let q=db.from('pp_meetings').select('*').order('created_at',{ascending:false}).limit(200)
   if(orderId)q=q.eq('order_id',orderId)
   const {data,error}=await q
   return error?err(res,500,'Could not load PP Meetings: '+error.message):res.json({data:data||[]})
 }
 if(action==='ppmCreate'&&req.method==='POST'){
   const orderId=String(req.body?.orderId||'')
   if(!/^[0-9a-f-]{36}$/i.test(orderId))return err(res,400,'Select a valid order')
   const {data:order}=await db.from('orders').select('id').eq('id',orderId).maybeSingle()
   if(!order)return err(res,404,'Order not found')
   const {data,error}=await db.from('pp_meetings').insert({order_id:orderId,created_by:null}).select().single()
   return error?err(res,500,'Could not create PP Meeting: '+error.message):res.json({data})
 }
 if(action==='ppmDelete'&&req.method==='POST'){
   const id=String(req.body?.id||'')
   if(!/^[0-9a-f-]{36}$/i.test(id))return err(res,400,'Invalid meeting')
   const {data:meeting,error:readError}=await db.from('pp_meetings').select('*').eq('id',id).maybeSingle()
   if(readError)return err(res,500,readError.message)
   if(!meeting)return err(res,404,'Meeting not found')
   const notes=Object.values(meeting.department_notes||{}).some(n=>n&&Object.values(n).some(v=>String(v||'').trim()))
   const populated=notes||Object.values(meeting.technical_checks||{}).some(Boolean)||meeting.fit_approved!==null||!!meeting.meeting_date||!!meeting.decision||!!String(meeting.outstanding_actions||'').trim()||!!meeting.attachment_path||meeting.status!=='Draft'
   if(populated)return err(res,409,'This meeting contains data and cannot be deleted. You can still edit it.')
   const {error}=await db.from('pp_meetings').delete().eq('id',id)
   return error?err(res,500,'Could not delete meeting: '+error.message):res.json({ok:true})
 }
 if(action==='ppmSave'&&req.method==='POST'){
   const id=String(req.body?.id||'')
   if(!/^[0-9a-f-]{36}$/i.test(id))return err(res,400,'Invalid meeting')
   const input=req.body?.data||{}
   const allowed=['meeting_date','status','decision','technical_checks','fit_approved','department_notes','outstanding_actions','signatures']
   const payload=Object.fromEntries(allowed.filter(k=>Object.prototype.hasOwnProperty.call(input,k)).map(k=>[k,input[k]]))
   if(!['Draft','Completed','Closed'].includes(payload.status))return err(res,400,'Invalid status')
   payload.updated_at=new Date().toISOString()
   const {data,error}=await db.from('pp_meetings').update(payload).eq('id',id).select().single()
   return error?err(res,500,'Could not save PP Meeting: '+error.message):res.json({data})
 }
 if(action==='ppmAttachmentUrl'&&req.method==='POST'){
   const id=String(req.body?.id||'')
   const extension=String(req.body?.extension||'').toLowerCase()
   const contentType=String(req.body?.contentType||'')
   if(!/^[0-9a-f-]{36}$/i.test(id)||!({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'}[extension]===contentType))return err(res,400,'Invalid attachment')
   const {data:meeting}=await db.from('pp_meetings').select('id').eq('id',id).maybeSingle()
   if(!meeting)return err(res,404,'Meeting not found')
   const path=id+'/'+Date.now()+'.'+extension
   const {data,error}=await db.storage.from('ppm-attachments').createSignedUploadUrl(path)
   return error?err(res,500,'Could not prepare upload'):res.json({path,token:data.token})
 }
 if(action==='ppmAttachmentSave'&&req.method==='POST'){
   const id=String(req.body?.id||''),path=String(req.body?.path||'')
   if(!/^[0-9a-f-]{36}$/i.test(id)||!path.startsWith(id+'/'))return err(res,400,'Invalid attachment')
   const {data,error}=await db.from('pp_meetings').update({attachment_path:path,updated_at:new Date().toISOString()}).eq('id',id).select().single()
   return error?err(res,500,'Could not save attachment'):res.json({data})
 }
 if(action==='ppmAttachmentView'&&req.method==='GET'){
   const id=String(req.query.id||'')
   const {data:meeting}=await db.from('pp_meetings').select('attachment_path').eq('id',id).maybeSingle()
   if(!meeting?.attachment_path)return err(res,404,'Attachment not found')
   const {data,error}=await db.storage.from('ppm-attachments').createSignedUrl(meeting.attachment_path,120)
   return error?err(res,500,'Could not open attachment'):res.json({url:data.signedUrl})
 }
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


 if(action==='restoreProtected'&&req.method==='POST'){
   const role=String(user.role||'').toLowerCase()
   const {data:roleRow}=await db.from('roles').select('name').eq('id',user.role).maybeSingle()
   if(role!=='admin'&&String(roleRow?.name||'').toLowerCase()!=='admin')return err(res,403,'Admin access required')
   const table=String(req.body?.table||'')
   if(!Object.values(tables).includes(table))return err(res,400,'Invalid protected table')
   const phase=req.body?.phase
   if(phase==='clear'){
     const {error}=await db.from(table).delete().not(table==='parcel_invoice_snapshots'?'parcel_id':'id','is',null)
     return error?err(res,500,'Could not clear '+table+': '+error.message):res.json({ok:true})
   }
   if(phase==='insert'){
     const rows=req.body?.rows
     if(!Array.isArray(rows)||rows.length>500)return err(res,400,'Invalid restore batch')
     if(rows.length){
       const {error}=await db.from(table).insert(rows)
       if(error)return err(res,500,'Could not restore '+table+': '+error.message)
     }
     return res.json({ok:true})
   }
   return err(res,400,'Invalid restore phase')
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
