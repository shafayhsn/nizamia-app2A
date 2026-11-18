import {MODULES} from '../src/lib/permissions.js'

const knownModules=new Set(MODULES.map(({key})=>key))
const flags=['can_view','can_create','can_edit','can_delete']

export async function roleAction(req,res,db,user,action){
 const fail=(status,error)=>res.status(status).json({error})
 if(user.role!=='admin')return fail(403,'Administrator access required')
 if(req.method!=='POST')return fail(405,'Method not allowed')
 if(action==='roleCreate'){
  const name=req.body?.name
  if(typeof name!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(name)||name==='admin')
   return fail(400,'Invalid role name')
  const {data,error}=await db.from('roles').insert({name}).select('id,name,created_at').single()
  return error?fail(400,'Could not create role'):res.json({data})
 }
 if(action!=='rolePermissionsSave')return fail(400,'Unknown role action')
 const {roleId,permissions}=req.body||{}
 if(typeof roleId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(roleId)||
    !Array.isArray(permissions)||permissions.length!==knownModules.size||
    new Set(permissions.map(row=>row?.module)).size!==knownModules.size||
    permissions.some(row=>!knownModules.has(row?.module)||flags.some(flag=>typeof row[flag]!=='boolean')))
  return fail(400,'Invalid role permissions')
 const {data:role,error}=await db.from('roles').select('id,name').eq('id',roleId).maybeSingle()
 if(error||!role||role.name==='admin')return fail(400,'Role cannot be edited')
 const rows=permissions.map(row=>({
  role_id:role.id,module:row.module,...Object.fromEntries(flags.map(flag=>[flag,row[flag]]))
 }))
 const {error:saveError}=await db.from('permissions').upsert(rows,{onConflict:'role_id,module'})
 return saveError?fail(400,'Could not save role permissions'):res.json({ok:true})
}
