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
 const requestedBackupDir=path.resolve(backupRoot)
 fs.mkdirSync(requestedBackupDir,{recursive:true,mode:0o700})
 // macOS maps /var to /private/var; compare canonical paths, not aliases.
 const backupDir=fs.realpathSync(requestedBackupDir)
 const liveDir=path.dirname(source)
 if(backupDir===liveDir||backupDir.startsWith(liveDir+path.sep)||liveDir.startsWith(backupDir+path.sep))throw Error('Backup must be outside the live database folder')
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
