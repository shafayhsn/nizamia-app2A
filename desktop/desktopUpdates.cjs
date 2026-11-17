'use strict'
const https=require('node:https')
const RELEASES_URL='https://api.github.com/repos/shafayhsn/nizamia-app2A/releases/latest'
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
async function checkForDesktopRelease({currentVersion,fetchRelease=fetchLatestRelease}){
 const release=await fetchRelease()
 if(!release||release.draft||release.prerelease)return {status:'unpublished'}
 const version=String(release.tag_name||'').replace(/^v/i,'')
 const url=String(release.html_url||'')
 if(!parseVersion(version)||!url.startsWith('https://github.com/shafayhsn/nizamia-app2A/releases/'))return {status:'unpublished'}
 return isNewer(version,currentVersion)?{status:'newer',version,url}:{status:'current',version,url}
}
module.exports={checkForDesktopRelease,isNewer,parseVersion}
