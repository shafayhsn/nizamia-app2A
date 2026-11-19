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
 console.log('Mounting verified 0.1.11 installer')
 execFileSync('hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',mount,process.argv[2]],{timeout:90000})
 try{execFileSync('ditto',[path.join(mount,path.basename(target)),target],{timeout:120000})}finally{execFileSync('hdiutil',['detach',mount],{timeout:90000})}
 const binary=path.join(target,'Contents/MacOS/Nizamia App-2A'),support=path.join(os.homedir(),'Library/Application Support')
 console.log('Launching installed version 0.1.11')
 const old=spawn(binary,[],{stdio:'ignore'})
 const settings=await until(()=>fs.readdirSync(support).filter(n=>/nizamia/i.test(n)).map(n=>path.join(support,n,'local-database-settings.json')).find(p=>fs.existsSync(p)),'Installed 0.1.11 did not initialize its database')
 const profile=path.dirname(settings),directory=JSON.parse(fs.readFileSync(settings)).databaseDirectory,dbFile=path.join(directory,'nizamia-app2a.sqlite')
 console.log('Closing the CI copy of 0.1.11 before seeding its offline queue')
 const stopped=()=>old.exitCode!==null||old.signalCode!==null
 old.kill('SIGTERM')
 try{await until(stopped,'Old process is still running',10000)}
 catch{old.kill('SIGKILL');await until(stopped,'Could not close CI test process',10000)}
 const SQL=await require('sql.js')(),db=new SQL.Database(fs.readFileSync(dbFile)),owner=randomUUID(),id=randomUUID()
 require('./offlineMutationOutbox.cjs').stageMutation(db,owner,{id,table:'orders',operation:'update',changes:{notes:'Intel update acceptance'},fingerprint:'a'.repeat(64)})
 fs.writeFileSync(dbFile,Buffer.from(db.export()));db.close()
 const before=fs.readFileSync(dbFile)
 const backup=await backupDatabaseBeforeUpdate({directory,backupRoot:path.join(profile,'Update Backups')})
 assert.deepEqual(fs.readFileSync(backup.file),before)
 const dmgPath=path.resolve(process.argv[3]),bytes=fs.readFileSync(dmgPath),version=require('./package.json').version
 console.log('Starting native update helper with the verified DMG and backup')
 const asar=require('@electron/asar')
 const legacyFolder=path.join(root,'legacy-helper')
 fs.mkdirSync(legacyFolder)
 for(const name of ['desktopUpdateLaunch.cjs','desktopDmgPreflight.cjs','desktopInstallGuard.cjs','desktopMacUpdateHelper.sh'])
   fs.writeFileSync(path.join(legacyFolder,name),asar.extractFile(path.join(target,'Contents/Resources/app.asar'),name))
 await require(path.join(legacyFolder,'desktopUpdateLaunch.cjs')).stageMacUpdate({appPath:target,resourcesPath:path.join(target,'Contents/Resources'),dmgPath,version,
  asset:{size:bytes.length,digest:createHash('sha256').update(bytes).digest('hex')},userData:profile,pid:old.pid})
 console.log('Waiting for the updated application to verify its local database')
 const ready=path.join(profile,'desktop-update-ready.txt'),pending=path.join(profile,'desktop-update-pending.json')
 const {token}=JSON.parse(fs.readFileSync(pending))
 try{await until(()=>fs.existsSync(ready)&&fs.readFileSync(ready,'utf8')===token&&!fs.existsSync(pending),'Updated app did not confirm startup')}
 catch(e){console.error(fs.readFileSync(path.join(profile,'Update Helper/latest-install.log'),'utf8'));throw e}
 assert.equal(execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(target,'Contents/Info.plist')],{encoding:'utf8'}).trim(),version)
 const migrated=JSON.parse(fs.readFileSync(settings))
 assert.equal(path.basename(migrated.workspaceRoot),'NZOS')
 assert.deepEqual(fs.readFileSync(dbFile),before)
 const restored=new SQL.Database(fs.readFileSync(path.join(migrated.databaseDirectory,'nizamia-app2a.sqlite')))
 assert.equal(restored.exec('pragma integrity_check')[0].values[0][0],'ok')
 const [[state,intent]]=restored.exec('select state,intent_json from offline_mutation_outbox where owner_id=? and record_id=?',[owner,id])[0].values
 assert.equal(state,'pending');assert.equal(JSON.parse(intent).changes.notes,'Intel update acceptance');restored.close()
 console.log('Verified 0.1.11 to '+version+' replacement, relaunch, pending SQLite edit and verified backup.')
}
main().catch(e=>{console.error(e);process.exit(1)})
