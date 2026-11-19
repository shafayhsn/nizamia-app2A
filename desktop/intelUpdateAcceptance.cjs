// CI-only. Exercise the real update helper on a disposable Intel Mac runner.
'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {execFileSync,spawn}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto')
const {setTimeout:delay}=require('node:timers/promises')
const {backupDatabaseBeforeUpdate}=require('./desktopUpdateBackup.cjs')
const {stageMacUpdate}=require('./desktopUpdateLaunch.cjs')
async function until(f,desc,limit=120000){
 const deadline=Date.now()+limit
 while(Date.now()<deadline){const hit=f();if(hit)return hit;await delay(500)}
 throw Error(desc)
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.platform,'darwin');assert.equal(process.arch,'x64')
 const parent=path.join(os.homedir(),'Applications'),target=path.join(parent,'Nizamia App-2A.app')
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nizamia-update-')),mount=path.join(root,'old')
 fs.mkdirSync(parent,{recursive:true});fs.mkdirSync(mount);assert.ok(!fs.existsSync(target))
 execFileSync('hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',mount,process.argv[2]])
 try{execFileSync('ditto',[path.join(mount,path.basename(target)),target])}finally{execFileSync('hdiutil',['detach',mount])}
 const binary=path.join(target,'Contents/MacOS/Nizamia App-2A'),support=path.join(os.homedir(),'Library/Application Support')
 const old=spawn(binary,[],{stdio:'ignore'});const exited=new Promise(resolve=>old.once('exit',resolve))
 const settings=await until(()=>fs.readdirSync(support).filter(n=>/nizamia/i.test(n)).map(n=>path.join(support,n,'local-database-settings.json')).find(p=>fs.existsSync(p)),'Installed 0.1.9 did not initialize its database')
 const profile=path.dirname(settings),directory=JSON.parse(fs.readFileSync(settings)).databaseDirectory,dbFile=path.join(directory,'nizamia-app2a.sqlite')
 old.kill('SIGTERM');await exited
 const SQL=await require('sql.js')(),db=new SQL.Database(fs.readFileSync(dbFile)),owner=randomUUID(),id=randomUUID()
 require('./offlineMutationOutbox.cjs').stageMutation(db,owner,{id,table:'orders',operation:'update',changes:{notes:'Intel update acceptance'},fingerprint:'a'.repeat(64)})
 fs.writeFileSync(dbFile,Buffer.from(db.export()));db.close()
 const before=fs.readFileSync(dbFile)
 const backup=await backupDatabaseBeforeUpdate({directory,backupRoot:path.join(profile,'Update Backups')})
 assert.deepEqual(fs.readFileSync(backup.file),before)
 const dmgPath=path.resolve(process.argv[3]),bytes=fs.readFileSync(dmgPath),version=require('./package.json').version
 const staged=await stageMacUpdate({appPath:target,resourcesPath:path.join(target,'Contents/Resources'),dmgPath,version,
  asset:{size:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')},userData:profile,pid:old.pid})
 const ready=path.join(profile,'desktop-update-ready.txt'),pending=path.join(profile,'desktop-update-pending.json')
 const {token}=JSON.parse(fs.readFileSync(pending))
 try{await until(()=>fs.existsSync(ready)&&fs.readFileSync(ready,'utf8')===token&&!fs.existsSync(pending),'Updated app did not confirm startup')}
 catch(e){console.error(fs.readFileSync(path.join(profile,'Update Helper/latest-install.log'),'utf8'));throw e}
 assert.equal(execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(target,'Contents/Info.plist')],{encoding:'utf8'}).trim(),version)
 const restored=new SQL.Database(fs.readFileSync(dbFile))
 assert.equal(restored.exec('pragma integrity_check')[0].values[0][0],'ok')
 const [[state,intent]]=restored.exec('select state,intent_json from offline_mutation_outbox where owner_id=? and record_id=?',[owner,id])[0].values
 assert.equal(state,'pending');assert.equal(JSON.parse(intent).changes.notes,'Intel update acceptance');restored.close()
 console.log('Verified 0.1.9 to '+version+' replacement, relaunch, pending SQLite edit and verified backup. Helper PID '+staged.pid)
}
main().catch(e=>{console.error(e);process.exit(1)})
