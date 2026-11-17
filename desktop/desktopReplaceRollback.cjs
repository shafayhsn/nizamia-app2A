'use strict'
const fs=require('node:fs')
const path=require('node:path')
const APP='Nizamia App-2A.app'
function prepareReplacementPaths({targetApp,stagedApp}){
 if(!path.isAbsolute(targetApp)||!path.isAbsolute(stagedApp))throw Error('Absolute application paths required')
 if(path.basename(targetApp)!==APP||path.basename(stagedApp)!==APP)throw Error('Unexpected application bundle name')
 for(const entry of [targetApp,stagedApp]){
  const stat=fs.lstatSync(entry)
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Application path must be a real directory')
  if(fs.realpathSync(entry)!==path.resolve(entry))throw Error('Application path must be canonical')
  if(!fs.existsSync(path.join(entry,'Contents','Info.plist')))throw Error('Application bundle is incomplete')
 }
 if(targetApp===stagedApp)throw Error('Source and destination cannot match')
 if(fs.statSync(targetApp).dev!==fs.statSync(stagedApp).dev)throw Error('Staged and installed applications must be on the same volume')
 const parent=path.dirname(targetApp)
 const rollback=path.join(parent,'.Nizamia-App-2A-rollback.app')
 if(fs.existsSync(rollback))throw Error('An existing rollback copy must be resolved first')
 return {targetApp,stagedApp,rollback}
}
function replaceWithRollback({targetApp,stagedApp,rename=fs.renameSync}){
 const paths=prepareReplacementPaths({targetApp,stagedApp})
 let oldMoved=false
 try{
  rename(paths.targetApp,paths.rollback)
  oldMoved=true
  rename(paths.stagedApp,paths.targetApp)
  return {installed:paths.targetApp,rollback:paths.rollback}
 }catch(error){
  if(oldMoved){
   try{
    if(!fs.existsSync(paths.targetApp))rename(paths.rollback,paths.targetApp)
   }catch(restoreError){
    throw new AggregateError([error,restoreError],'Installation failed and automatic rollback failed; old app remains at '+paths.rollback)
   }
  }
  throw error
 }
}
module.exports={prepareReplacementPaths,replaceWithRollback}
