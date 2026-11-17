'use strict'
const fs=require('node:fs')
const path=require('node:path')
const crypto=require('node:crypto')
function backupDatabaseToFile({directory,destination}){
 if(!directory||!destination||!path.isAbsolute(destination))throw Error('Absolute database and destination paths are required')
 const source=path.join(fs.realpathSync(directory),'nizamia-app2a.sqlite')
 const src=fs.lstatSync(source)
 if(!src.isFile()||src.isSymbolicLink()||src.size<100)throw Error('Local SQLite database is missing or invalid')
 const target=path.resolve(destination)
 const parent=fs.realpathSync(path.dirname(target))
 const live=fs.realpathSync(directory)
 if(parent===live||parent.startsWith(live+path.sep))throw Error('Choose a backup location outside the live database folder')
 if(fs.existsSync(target))throw Error('Backup destination already exists. Choose a new filename.')
 const bytes=fs.readFileSync(source)
 if(bytes.subarray(0,16).toString('binary')!=='SQLite format 3\0')throw Error('Local database has an invalid SQLite header')
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex')
 try{
  fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600})
  const actual=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  if(actual!==sha256)throw Error('Backup checksum verification failed')
  return {file:target,sha256,size:bytes.length}
 }catch(error){try{fs.unlinkSync(target)}catch{};throw error}
}
module.exports={backupDatabaseToFile}
