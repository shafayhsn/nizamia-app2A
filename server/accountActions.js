import passwordTools from './accountPassword.cjs'

export const accountColumns='id,email,username,role,role_id,is_active,is_restricted,restricted_reason,restricted_at,created_at'

export async function accountAction(req,res,db,user,action){
 const fail=(status,error)=>res.status(status).json({error})
 if(action==='accountDirectory'&&req.method==='GET'){
  const {data,error}=await db.from('users').select('id,username').eq('is_active',true)
  return error?fail(503,'Account directory unavailable'):res.json({data})
 }
 if(user.role!=='admin')return fail(403,'Administrator access required')
 if(action==='accountList'&&req.method==='GET'){
  const {data,error}=await db.from('users').select(accountColumns).order('created_at',{ascending:false})
  return error?fail(503,'Accounts unavailable'):res.json({data})
 }
 if(req.method!=='POST')return fail(405,'Method not allowed')
 const {id,email,username,password,roleId,active,restricted,reason}=req.body
 if(action!=='accountCreate'&&(typeof id!=='string'||!id))return fail(400,'Account ID required')
 let fields={}
 if(action==='accountCreate'||action==='accountRole'){
  const {data:role,error}=await db.from('roles').select('id,name').eq('id',roleId).maybeSingle()
  if(error||!role)return fail(400,'Role unavailable')
  if(id===user.id&&role.name!=='admin')return fail(400,'Your own administrator role is required')
  fields={role:role.name,role_id:role.id}
 }
 if(action==='accountCreate'||action==='accountPassword'){
  if(typeof password!=='string'||password.length<6||Buffer.byteLength(password)>1024)return fail(400,'Use a password between 6 and 1024 bytes')
  fields.password_hash=await passwordTools.hashPassword(password)
 }
 if(action==='accountCreate'){
  if(typeof email!=='string'||!email.trim()||typeof username!=='string'||!username.trim())return fail(400,'Email and username required')
  const {error}=await db.from('users').insert({...fields,email:email.trim().toLowerCase(),username:username.trim(),is_active:true})
  return error?fail(400,'Could not create account'):res.json({ok:true})
 }
 if(action==='accountActive'){
  if(typeof active!=='boolean'||(id===user.id&&!active))return fail(400,'Invalid active state')
  fields={is_active:active}
 }
 if(action==='accountRestriction'){
  if(typeof restricted!=='boolean'||(id===user.id&&restricted))return fail(400,'Invalid restriction')
  fields={is_restricted:restricted,restricted_reason:restricted?String(reason||'Restricted by admin').slice(0,500):null,restricted_at:restricted?new Date().toISOString():null}
 }
 const {data,error}=await db.from('users').update(fields).eq('id',id).select('id').maybeSingle()
 return error||!data?fail(400,'Could not update account'):res.json({ok:true})
}
