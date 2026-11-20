'use strict'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
function createLocalAuth(directory){
 const file=path.join(directory,'desktop-web-users.json')
 let active=null,failures=0,lockedUntil=0
 function read(){if(!fs.existsSync(file))return [];const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>262144)throw Error('Unsafe offline account store');const value=JSON.parse(fs.readFileSync(file,'utf8'));return Array.isArray(value)?value:[]}
 function save(rows){const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rows),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}
 const status=()=>({setupRequired:false,authenticated:!!active,user:active})
 function login(username,password){
  if(Date.now()<lockedUntil)throw Error('Too many attempts; try again later')
  if(typeof username!=='string'||typeof password!=='string'||!password||password.length>256)throw Error('Invalid credentials')
  const entry=read().find(row=>row.identifiers.includes(username.trim().toLowerCase()))
  if(!entry)throw Error('First sign in online on this computer to enable offline login')
  const supplied=crypto.scryptSync(password,Buffer.from(entry.salt,'hex'),64),expected=Buffer.from(entry.hash,'hex')
  if(expected.length!==supplied.length||!crypto.timingSafeEqual(expected,supplied)){if(++failures>=5){lockedUntil=Date.now()+60000;failures=0}throw Error('Invalid credentials')}
  if(entry.user.role!=='admin' && (!entry.verifiedAt || Date.now()-entry.verifiedAt>8*60*60*1000))
    throw Error('Sign in online to verify your team permissions again.')
  if(entry.user.is_active===false||entry.user.is_restricted===true)throw Error('Account access denied')
  failures=0;active=entry.user;return status()
 }
 function enroll(identifier,password,user){
  if(!user||typeof user.id!=='string'||!user.id||!user.role||user.is_active!==true)throw Error('Online identity verification failed')
  const salt=crypto.randomBytes(32),hash=crypto.scryptSync(password,salt,64)
  const identifiers=[identifier,user.username,user.email].filter(Boolean).map(v=>String(v).trim().toLowerCase())
  const rows=read().filter(row=>row.user.id!==user.id)
  rows.push({user,verifiedAt:Date.now(),identifiers:[...new Set(identifiers)],salt:salt.toString('hex'),hash:hash.toString('hex')})
  save(rows);active=user;failures=0;return status()
 }
 function forget(identifier){
  const value=String(identifier).trim().toLowerCase()
  const rows=read(),remaining=rows.filter(row=>!row.identifiers.includes(value))
  if(remaining.length!==rows.length)save(remaining)
  active=null
 }
 function onlineOnly(identifier,user){
  if(!user||typeof user.id!=='string'||!user.role||user.is_active!==true)throw Error('Online identity verification failed')
  forget(identifier)
  active=user;failures=0
  return status()
 }
 const logout=()=>{active=null;return status()}
 return {status,login,enroll,onlineOnly,forget,logout,isAuthenticated:()=>!!active}
}
module.exports={createLocalAuth}
