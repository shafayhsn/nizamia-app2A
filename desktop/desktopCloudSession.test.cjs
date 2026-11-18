'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const os=require('node:os')
const {createDesktopCloudSessionStore}=require('./desktopCloudSession.cjs')
const {issueDesktopSyncToken}=require('../server/desktopSyncToken.cjs')

test('encrypted tokens survive restart only for the verified account and expiry window',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-cloud-session-'))
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
 let now=Date.now(),encrypted=0
 const safeStorage={
  isEncryptionAvailable:()=>true,
  encryptString(value){encrypted++;return Buffer.from(Array.from(value,x=>x.charCodeAt(0)^255))},
  decryptString(value){return Array.from(value,x=>String.fromCharCode(x^255)).join('')}
 }
 const options={directory,safeStorage,now:()=>now}
 const syncToken=issueDesktopSyncToken('fixture-signer','admin-1',now)
 const store=createDesktopCloudSessionStore(options)
 assert.equal(store.save('admin-1',{syncToken}).sync.token,syncToken)
 assert.equal(encrypted,1)
 const [file]=fs.readdirSync(directory)
 assert.equal(fs.readFileSync(path.join(directory,file)).includes(syncToken),false)
 assert.equal(fs.statSync(path.join(directory,file)).mode&0o777,0o600)
 const reopened=createDesktopCloudSessionStore(options)
 assert.equal(reopened.read('admin-1').sync.token,syncToken)
 assert.equal(reopened.read('admin-2').sync,undefined)
 assert.equal(store.save('admin-2',{syncToken}).sync,null)
 now+=9*60*60*1000
 assert.equal(reopened.read('admin-1').sync,null)
 reopened.clear('admin-1')
 assert.deepEqual(fs.readdirSync(directory),[])
})
