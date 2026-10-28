import { createClient } from '@supabase/supabase-js'
const MAX_SIZE=25*1024*1024
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!key)return res.status(503).json({error:'Admin file service requires SUPABASE_SERVICE_ROLE_KEY on Vercel.'})
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'})
  const db=createClient(url,key,{auth:{persistSession:false}})
  try{
    const {username,password,action,payload={}}=req.body||{}
    if(!username||!password)return res.status(401).json({error:'Please confirm your app login credentials.'})
    const field=String(username).includes('@')?'email':'username'
    const {data:user,error:userError}=await db.from('users').select('id,role,is_active,is_restricted,password_hash').eq(field,String(username)).maybeSingle()
    if(userError||!user||user.is_active===false||user.is_restricted===true||String(user.password_hash)!==String(password))return res.status(403).json({error:'Invalid credentials or account inactive.'})
    const admin=user.role==='admin'
    if(action!=='download'&&!admin)return res.status(403).json({error:'Only administrators can make changes.'})
    if(action==='download'){
      const {data:asset}=await db.from('feature_assets').select('storage_path,file_name').eq('id',payload.id).single()
      if(!asset)return res.status(404).json({error:'File not found'})
      const {data,error}=await db.storage.from('company-assets').createSignedUrl(asset.storage_path,90,{download:asset.file_name})
      if(error)throw error
      return res.status(200).json({url:data.signedUrl})
    }
    if(action==='saveCertificate'){
      const c=payload||{}
      if(!c.certificate?.trim()||!/^\d{4}-\d\d-\d\d$/.test(c.issued_on||'')||!/^\d{4}-\d\d-\d\d$/.test(c.expires_on||''))return res.status(400).json({error:'Certificate and both dates are required.'})
      if(c.expires_on<c.issued_on)return res.status(400).json({error:'Expiry must be after issue date.'})
      const row={certificate:c.certificate.trim().slice(0,200),issued_on:c.issued_on,expires_on:c.expires_on}
      const query=c.id?db.from('feature_certificates').update(row).eq('id',c.id):db.from('feature_certificates').insert(row)
      const {error}=await query
      if(error)throw error
    }else if(action==='renewCertificate'){
      const {data:old,error:oldError}=await db.from('feature_certificates').select('*').eq('id',payload.id).single()
      if(oldError)throw oldError
      if(!payload.issued_on||!payload.expires_on||payload.expires_on<payload.issued_on)return res.status(400).json({error:'Valid renewal dates required.'})
      const {error}=await db.from('feature_certificates').update({issued_on:payload.issued_on,expires_on:payload.expires_on}).eq('id',old.id)
      if(error)throw error
    }else if(action==='upload'){
      const {fileName,mimeType,base64}=payload
      if(!fileName||!base64)return res.status(400).json({error:'Missing file'})
      const bytes=Buffer.from(base64,'base64')
      if(bytes.length>MAX_SIZE)return res.status(413).json({error:'Maximum file size is 25 MB.'})
      const safeName=String(fileName).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,150)
      const path=crypto.randomUUID()+'/'+safeName
      const {error:uploadError}=await db.storage.from('company-assets').upload(path,bytes,{contentType:mimeType||'application/octet-stream',upsert:false})
      if(uploadError)throw uploadError
      const {error:metaError}=await db.from('feature_assets').insert({file_name:safeName,storage_path:path,mime_type:mimeType,file_size:bytes.length})
      if(metaError){await db.storage.from('company-assets').remove([path]);throw metaError}
    }else if(action==='deleteAsset'){
      const {data:asset}=await db.from('feature_assets').select('storage_path').eq('id',payload.id).single()
      if(!asset)return res.status(404).json({error:'File not found'})
      const {error:storageError}=await db.storage.from('company-assets').remove([asset.storage_path])
      if(storageError)throw storageError
      const {error}=await db.from('feature_assets').delete().eq('id',payload.id)
      if(error)throw error
    }else return res.status(400).json({error:'Unknown action'})
    return res.status(200).json({ok:true})
  }catch(e){return res.status(500).json({error:e.message||'Operation failed'})}
}
