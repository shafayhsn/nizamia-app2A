'use strict'
const fs=require('node:fs')
const path=require('node:path')
const {execFile}=require('node:child_process')
const {promisify}=require('node:util')
const run=promisify(execFile)
const APP='Nizamia App-2A.app'
const ID='com.nizamia.app2a.desktop'
function validateMountedBundle({mountPath,version}){
 if(!/^\d+\.\d+\.\d+$/.test(String(version)))throw Error('Invalid expected version')
 const root=fs.realpathSync(mountPath)
 const app=path.join(root,APP)
 if(!fs.existsSync(app)||fs.lstatSync(app).isSymbolicLink()||!fs.lstatSync(app).isDirectory())throw Error('Expected application bundle not found')
 if(fs.realpathSync(app)!==app)throw Error('Bundle path contains symlinks')
 const plist=path.join(app,'Contents','Info.plist')
 const executable=path.join(app,'Contents','MacOS','Nizamia App-2A')
 if(!fs.existsSync(plist)||!fs.existsSync(executable))throw Error('Incomplete application bundle')
 return {app,plist}
}
async function inspectVerifiedDmg({dmgPath,version,exec=run}){
 if(process.platform!=='darwin')throw Error('DMG inspection requires macOS')
 if(!path.isAbsolute(dmgPath)||!fs.statSync(dmgPath).isFile())throw Error('Installer must be a regular file')
 const mount=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'app2a-update-mount-'))
 let attached=false
 try{
  await exec('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',mount,dmgPath],{timeout:90000})
  attached=true
  const bundle=validateMountedBundle({mountPath:mount,version})
  const read=async key=>(await exec('/usr/libexec/PlistBuddy',['-c','Print :'+key,bundle.plist],{timeout:10000})).stdout.trim()
  if(await read('CFBundleIdentifier')!==ID)throw Error('Unexpected application bundle identifier')
  if(await read('CFBundleShortVersionString')!==version)throw Error('Installer version does not match verified release')
  return {version,bundleId:ID,validated:true}
 }finally{
  if(attached)await exec('/usr/bin/hdiutil',['detach',mount],{timeout:45000}).catch(()=>{})
  try{fs.rmdirSync(mount)}catch{}
 }
}
module.exports={validateMountedBundle,inspectVerifiedDmg}
