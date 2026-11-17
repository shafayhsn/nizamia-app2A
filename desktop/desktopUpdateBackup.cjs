'use strict'
const fs=require('node:fs')
const path=require('node:path')
const crypto=require('node:crypto')
const DB_FILE='nizamia-app2a.sqlite'
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex')}
function backupDatabaseBeforeUpdate({directory,backupRoot}){
 if(!directory||!backupRoot)throw Error('Database and backup directories are required')
 const source=path.join(fs.realpathSync(directory),DB_FILE)
 const stat=fs.lstatSync(source)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<100)throw Error('Local database is not a regular nonempty file')
 const backupDir=path.resolve(backupRoot)
 if(backupDir===path.dirname(source)||backupDir.startsWith(path.dirname(source)+path.sep)||path.dirname(source).startsWith(backupDir+path.sep))throw Error('Backup must be outside the live database folder')
 fs.mkdirSync(backupDir,{recursive:true,mode:0o700})
 const bytes=fs.readFileSync(source)
 const digest=sha256(bytes)
 const dest=path.join(backupDir,'nizamia-app2a-pre-update-'+Date.now()+'-'+crypto.randomBytes(5).toString('hex')+'.sqlite')
 try{
  fs.writeFileSync(dest,bytes,{flag:'wx',mode:0o600})
  if(sha256(fs.readFileSync(dest))!==digest)throw Error('Backup verification failed')
  return {file:dest,sha256:digest,size:bytes.length}
 }catch(error){try{fs.unlinkSync(dest)}catch{};throw error}
}
module.exports={backupDatabaseBeforeUpdate}
