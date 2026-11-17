'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {replaceWithRollback}=require('./desktopReplaceRollback.cjs')
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'app2a-rollback-')))
function make(folder,content){
 const app=path.join(folder,'Nizamia App-2A.app')
 fs.mkdirSync(path.join(app,'Contents'),{recursive:true})
 fs.writeFileSync(path.join(app,'Contents','Info.plist'),content)
 return app
}
try{
 const installed=path.join(root,'installed'),staging=path.join(root,'staging')
 fs.mkdirSync(installed);fs.mkdirSync(staging)
 const target=make(installed,'old'),source=make(staging,'new')
 let calls=0
 assert.throws(()=>replaceWithRollback({targetApp:target,stagedApp:source,rename:(a,b)=>{
  calls++;if(calls===2)throw Error('Simulated replacement failure')
  fs.renameSync(a,b)
 }}),/Simulated/)
 assert.equal(fs.readFileSync(path.join(target,'Contents','Info.plist'),'utf8'),'old')
 assert.equal(fs.readFileSync(path.join(source,'Contents','Info.plist'),'utf8'),'new')
 const result=replaceWithRollback({targetApp:target,stagedApp:source})
 assert.equal(fs.readFileSync(path.join(target,'Contents','Info.plist'),'utf8'),'new')
 assert.equal(fs.readFileSync(path.join(result.rollback,'Contents','Info.plist'),'utf8'),'old')
 assert.throws(()=>replaceWithRollback({targetApp:target,stagedApp:result.rollback}),/rollback|name/)
 console.log('Desktop replacement rollback tests passed')
}finally{fs.rmSync(root,{recursive:true,force:true})}
