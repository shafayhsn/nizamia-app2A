'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const crypto=require('node:crypto')
const {verifyDownloadedInstaller}=require('./desktopUpdateLaunch.cjs')
const root=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-launch-'))
try{
 const file=path.join(root,'update.dmg'),bytes=Buffer.alloc(2048,23)
 fs.writeFileSync(file,bytes)
 const asset={size:bytes.length,digest:crypto.createHash('sha256').update(bytes).digest('hex')}
 assert.equal(verifyDownloadedInstaller({file,asset}),asset.digest)
 fs.appendFileSync(file,'changed')
 assert.throws(()=>verifyDownloadedInstaller({file,asset}),/changed/)
 console.log('Update launch checksum revalidation tests passed')
}finally{fs.rmSync(root,{recursive:true,force:true})}
