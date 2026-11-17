'use strict'
const fs=require('node:fs')
const path=require('node:path')
const APP_NAME='Nizamia App-2A.app'
function validateMacInstallTarget({appPath,resourcesPath,platform=process.platform}){
 if(platform!=='darwin')throw Error('Mac updater can only run on macOS')
 if(typeof appPath!=='string'||!path.isAbsolute(appPath))throw Error('App path must be absolute')
 const normalized=path.resolve(appPath)
 if(path.basename(normalized)!==APP_NAME)throw Error('Unexpected application name')
 if(!fs.existsSync(normalized))throw Error('Installed application was not found')
 const stat=fs.lstatSync(normalized)
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Application must be a real directory')
 const canonical=fs.realpathSync(normalized)
 if(canonical!==normalized)throw Error('Application path contains aliases or symlinks')
 if(!normalized.startsWith('/Applications/')&&!normalized.startsWith(path.join(require('node:os').homedir(),'Applications')+path.sep))throw Error('Application is not in an approved Applications folder')
 if(!fs.existsSync(path.join(normalized,'Contents','Info.plist')))throw Error('Application bundle is incomplete')
 if(typeof resourcesPath!=='string'||!fs.realpathSync(resourcesPath).startsWith(normalized+path.sep))throw Error('Updater is not running from the selected app bundle')
 return {appPath:normalized}
}
module.exports={validateMacInstallTarget}
