'use strict'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
function createLocalAuth(directory){
 const file=path.join(directory,'desktop-local-account.json')
 let authenticated=false,failures=0,lockedUntil=0
 const read=()=>{if(!fs.existsSync(file))return null;const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>8192)throw Error('Unsafe local account file');return JSON.parse(fs.readFileSync(file,'utf8'))}
 const profile=()=>({id:'desktop-local-operator',username:'Local Operator',displayName:'Local Operator',role:'admin',is_active:true,offline_local_only:true})
 const status=()=>({setupRequired:!read(),authenticated,user:authenticated?profile():null})
 function setup(username,password){if(read())throw Error('Local account already exists');if(typeof username!=='string'||username.trim().length<3||username.length>80||typeof password!=='string'||password.length<12||password.length>256)throw Error('Username must have 3+ characters and password at least 12 characters');const salt=crypto.randomBytes(32);const hash=crypto.scryptSync(password,salt,64);const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({version:1,username:username.trim(),salt:salt.toString('hex'),hash:hash.toString('hex')}))}finally{fs.closeSync(fd)};authenticated=true;return {authenticated:true,user:{...profile(),username:username.trim()}}}
 function login(username,password){if(Date.now()<lockedUntil)throw Error('Too many attempts; try again later');const entry=read();if(!entry)throw Error('Set up the local account first');if(typeof username!=='string'||typeof password!=='string'||password.length>256)throw Error('Invalid credentials');const supplied=crypto.scryptSync(password,Buffer.from(entry.salt,'hex'),64);const expected=Buffer.from(entry.hash,'hex');if(username.trim()!==entry.username||expected.length!==supplied.length||!crypto.timingSafeEqual(expected,supplied)){failures++;if(failures>=5){lockedUntil=Date.now()+60000;failures=0}throw Error('Invalid credentials')};failures=0;authenticated=true;return {authenticated:true,user:{...profile(),username:entry.username}}}
 const logout=()=>{authenticated=false;return status()}
 return {status,setup,login,logout,isAuthenticated:()=>authenticated}
}
module.exports={createLocalAuth}
