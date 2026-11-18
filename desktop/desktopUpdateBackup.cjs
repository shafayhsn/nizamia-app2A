'use strict'
const fs=require('node:fs')
const path=require('node:path')
const crypto=require('node:crypto')
const {backupDatabaseToFile}=require('./desktopLocalBackup.cjs')

async function backupDatabaseBeforeUpdate({directory,backupRoot}){
 if(!directory||!backupRoot)throw Error('Database and backup directories are required')
 const live=fs.realpathSync(directory)
 fs.mkdirSync(backupRoot,{recursive:true,mode:0o700})
 const backup=fs.realpathSync(backupRoot)
 if(backup===live||backup.startsWith(live+path.sep)||live.startsWith(backup+path.sep))
  throw Error('Backup must be outside the live database folder')
 const destination=path.join(backup,'nizamia-app2a-pre-update-'+crypto.randomUUID()+'.sqlite')
 return backupDatabaseToFile({directory:live,destination})
}
module.exports={backupDatabaseBeforeUpdate}
