'use strict'
const https=require('node:https')
const RELEASES_URL='https://api.github.com/repos/shafayhsn/nizamia-app2A/releases?per_page=20'
function parseVersion(v){
 const match=String(v||'').replace(/^v/i,'').match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
 return match?[Number(match[1]),Number(match[2]),Number(match[3])]:null
}
function isNewer(remote,current){
 const a=parseVersion(remote),b=parseVersion(current)
 if(!a||!b)return false
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}
 return false
}
function fetchLatestRelease(){
 return new Promise((resolve,reject)=>{
  const req=https.get(RELEASES_URL,{headers:{'User-Agent':'Nizamia-App2A-Desktop','Accept':'application/vnd.github+json'},timeout:9000},res=>{
   let body=''
   res.on('data',chunk=>{body+=chunk;if(body.length>250000){req.destroy(new Error('Update response too large'))}})
   res.on('end',()=>{
    if(res.statusCode===404){resolve(null);return}
    if(res.statusCode!==200){reject(new Error('Release server returned '+res.statusCode));return}
    try{const data=JSON.parse(body);resolve(data)}catch{reject(new Error('Invalid release response'))}
   })
  })
  req.on('timeout',()=>req.destroy(new Error('Update check timed out')))
  req.on('error',reject)
 })
}
async function checkForDesktopRelease({currentVersion,fetchRelease=fetchLatestRelease,platform=process.platform}){
 const fetched=await fetchRelease()
 const candidates=Array.isArray(fetched)?fetched:[fetched].filter(Boolean)
 const releaseVersion=r=>String(r.tag_name||'').replace(platform==='win32'?/^(?:windows-)?v/i:/^v/i,'')
 const release=candidates
  .filter(r=>r&&!r.draft&&parseVersion(releaseVersion(r))&&r.html_url?.startsWith('https://github.com/shafayhsn/nizamia-app2A/releases/')&&(platform!=='win32'||trustedAsset(r,platform)))
  .sort((a,b)=>isNewer(releaseVersion(a),releaseVersion(b))?-1:isNewer(releaseVersion(b),releaseVersion(a))?1:0)[0]
 if(!release)return {status:'unpublished'}
 const version=releaseVersion(release)
 const url=String(release.html_url||'')
 if(!parseVersion(version)||!url.startsWith('https://github.com/shafayhsn/nizamia-app2A/releases/'))return {status:'unpublished'}
 return isNewer(version,currentVersion)?{status:'newer',version,url,asset:trustedAsset(release,platform)}:{status:'current',version,url}
}

const fs=require('node:fs')
const path=require('node:path')
const crypto=require('node:crypto')
const {pipeline}=require('node:stream/promises')
const {Transform}=require('node:stream')
const MAX_INSTALLER_BYTES=800*1024*1024
function installerPattern(platform){
 return platform==='win32'?/^NZOS-\d+\.\d+\.\d+-Windows-x64-Setup\.exe$/i:/^(?:NZOS|Nizamia).*\.dmg$/i
}
function trustedAsset(release,platform=process.platform){
 const asset=[...(release.assets||[])].sort((a,b)=>Number(/^NZOS-/.test(b.name))-Number(/^NZOS-/.test(a.name))).find(a=>typeof a.name==='string'&&installerPattern(platform).test(a.name)&&/^sha256:[a-f0-9]{64}$/i.test(a.digest||'')&&a.size>1000000&&a.size<MAX_INSTALLER_BYTES&&/^https:\/\/github\.com\/shafayhsn\/nizamia-app2A\/releases\/download\//.test(a.browser_download_url||''))
 return asset?{name:asset.name,url:asset.browser_download_url,digest:asset.digest.slice(7).toLowerCase(),size:asset.size}:null
}
function requestInstaller(url,redirects=0){
 return new Promise((resolve,reject)=>{
  const parsed=new URL(url)
  if(parsed.protocol!=='https:'||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname))return reject(new Error('Untrusted installer download host'))
  const req=https.get(parsed,{headers:{'User-Agent':'Nizamia-App2A-Desktop','Accept':'application/octet-stream'},timeout:30000},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){
    res.resume()
    if(redirects>=5||!res.headers.location)return reject(new Error('Too many update redirects'))
    try{resolve(requestInstaller(new URL(res.headers.location,parsed).toString(),redirects+1))}catch(error){reject(error)}
    return
   }
   if(res.statusCode!==200){res.resume();reject(new Error('Download server returned '+res.statusCode));return}
   resolve(res)
  })
  req.on('timeout',()=>req.destroy(new Error('Update download timed out')))
  req.on('error',reject)
 })
}
async function downloadVerifiedInstaller({asset,destination,requestStream=requestInstaller,platform=process.platform}){
 if(!asset||!installerPattern(platform).test(asset.name)||!/^https:\/\/github\.com\/shafayhsn\/nizamia-app2A\/releases\/download\//.test(asset.url)||!/^([a-f0-9]{64})$/.test(asset.digest)||!Number.isSafeInteger(asset.size)||asset.size<1000000||asset.size>MAX_INSTALLER_BYTES)throw Error('Release is missing a trusted SHA-256 installer')
 const dest=path.resolve(destination)
 if(path.extname(dest).toLowerCase()!==path.extname(asset.name).toLowerCase())throw Error('Choose the correct installer extension')
 const temp=dest+'.partial'
 let bytes=0
 const hash=crypto.createHash('sha256')
 try{
  const response=await requestStream(asset.url)
  const check=new Transform({transform(chunk,enc,cb){bytes+=chunk.length;if(bytes>asset.size){cb(new Error('Installer exceeds declared size'));return}hash.update(chunk);cb(null,chunk)}})
  await pipeline(response,check,fs.createWriteStream(temp,{flags:'wx',mode:0o600}))
  if(bytes!==asset.size||hash.digest('hex')!==asset.digest){throw Error('Installer SHA-256 verification failed')}
  // Atomic no-clobber promotion: never replace an existing file or symlink.
  fs.linkSync(temp,dest)
  fs.unlinkSync(temp)
  return dest
 }catch(error){try{fs.unlinkSync(temp)}catch{};throw error}
}

module.exports={checkForDesktopRelease,isNewer,parseVersion,trustedAsset,downloadVerifiedInstaller}
