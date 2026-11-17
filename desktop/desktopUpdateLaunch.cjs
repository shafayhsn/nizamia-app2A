'use strict'
const fs=require('node:fs')
const path=require('node:path')
const crypto=require('node:crypto')
const {spawn}=require('node:child_process')
const os=require('node:os')
const {validateMacInstallTarget}=require('./desktopInstallGuard.cjs')
const {inspectVerifiedDmg}=require('./desktopDmgPreflight.cjs')
function verifyDownloadedInstaller({file,asset}){
 if(!asset||!Number.isSafeInteger(asset.size)||!/^([a-f0-9]{64})$/.test(asset.digest))throw Error('Invalid release metadata')
 const stat=fs.lstatSync(file)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==asset.size)throw Error('Installer size or file type changed')
 const digest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
 if(digest!==asset.digest)throw Error('Installer checksum changed')
 return digest
}
async function stageMacUpdate({appPath,resourcesPath,dmgPath,version,asset,userData,pid,inspect=inspectVerifiedDmg,launch=spawn}){
 const target=validateMacInstallTarget({appPath,resourcesPath})
 const digest=verifyDownloadedInstaller({file:dmgPath,asset})
 await inspect({dmgPath,version})
 const helperSource=path.join(__dirname,'desktopMacUpdateHelper.sh')
 const bytes=fs.readFileSync(helperSource)
 const folder=path.join(userData,'Update Helper')
 fs.mkdirSync(folder,{recursive:true,mode:0o700})
 const helper=path.join(folder,'install-'+crypto.randomBytes(10).toString('hex')+'.sh')
 fs.writeFileSync(helper,bytes,{flag:'wx',mode:0o700})
 const token=crypto.randomBytes(20).toString('hex')
 const pending=path.join(userData,'desktop-update-pending.json')
 const ready=path.join(userData,'desktop-update-ready.txt')
 fs.writeFileSync(pending,JSON.stringify({version,token}),{flag:'wx',mode:0o600})
 try{fs.unlinkSync(ready)}catch(error){if(error.code!=='ENOENT')throw error}
 const child=launch('/bin/bash',[helper,dmgPath,target.appPath,version,digest,String(pid),ready,token],{detached:true,stdio:'ignore',env:{HOME:require('node:os').homedir(),PATH:'/usr/bin:/bin:/usr/sbin:/sbin'}})
 if(!child||!child.pid){try{fs.unlinkSync(pending)}catch{};throw Error('Could not start external update helper')}
 child.unref()
 return {helper,pid:child.pid}
}
function confirmSuccessfulStartup({userData,version}){
 const pending=path.join(userData,'desktop-update-pending.json')
 if(!fs.existsSync(pending))return false
 const data=JSON.parse(fs.readFileSync(pending,'utf8'))
 if(data.version!==version||!/^([a-f0-9]{40})$/.test(data.token))return false
 fs.writeFileSync(path.join(userData,'desktop-update-ready.txt'),data.token,{mode:0o600})
 fs.unlinkSync(pending)
 return true
}
module.exports={verifyDownloadedInstaller,stageMacUpdate,confirmSuccessfulStartup}
