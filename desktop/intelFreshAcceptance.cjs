// Launch the installed NZOS binary twice using a disposable profile on the Intel runner.
'use strict'
const {spawn,execFileSync}=require('node:child_process')
const fs=require('node:fs')
const path=require('node:path')
const os=require('node:os')
const assert=require('node:assert/strict')
const {setTimeout:delay}=require('node:timers/promises')
async function main(){
  assert.equal(process.platform,'darwin')
  assert.equal(process.arch,'x64')
  assert.equal(process.env.GITHUB_ACTIONS,'true')
  const home=fs.mkdtempSync(path.join(os.homedir(),'nzos-fresh-check-'))
  const profile=path.join(home,'profile'),mount=path.join(home,'volume'),app=path.join(home,'NZOS.app')
  fs.mkdirSync(profile);fs.mkdirSync(mount)
  const settings=path.join(profile,'local-database-settings.json')
  // The setup dialog persists this location before it initializes the first workspace.
  fs.writeFileSync(settings,JSON.stringify({workspaceParent:home}))
  execFileSync('hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',mount,process.argv[2]])
  try{
    assert.ok(fs.lstatSync(path.join(mount,'Applications')).isSymbolicLink())
    execFileSync('ditto',[path.join(mount,'NZOS.app'),app])
  }finally{execFileSync('hdiutil',['detach',mount])}
  for(let i=0;i<2;i++){
    const port=19183+i
    const child=spawn(path.join(app,'Contents/MacOS/NZOS'),['--user-data-dir='+profile,'--remote-debugging-port='+port],{stdio:'inherit'})
    try{
      let login=false
      for(let n=0;n<90&&!login;n++){
        assert.equal(child.exitCode,null)
        try{
          const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()
          login=pages.some(p=>p.url==='app2a://local/login')
        }catch{}
        if(!login)await delay(500)
      }
      assert.ok(login,'Installed NZOS did not reach login')
      const state=JSON.parse(fs.readFileSync(settings))
      assert.equal(state.workspaceRoot,path.join(home,'NZOS'))
      for(const name of ['Backups','Database','Downloads','App Assets','Source Code'])assert.ok(fs.statSync(path.join(state.workspaceRoot,name)).isDirectory())
      assert.ok(fs.statSync(path.join(state.databaseDirectory,'nizamia-app2a.sqlite')).size>0)
      assert.ok(fs.statSync(path.join(state.workspaceRoot,'App Assets','1.0.0','QMS Excel formats.zip')).size>0)
    }finally{
      const done=new Promise(resolve=>child.once('exit',resolve))
      if(child.exitCode===null&&child.signalCode===null){
        child.kill('SIGTERM')
        const force=setTimeout(()=>child.kill('SIGKILL'),5000)
        await done;clearTimeout(force)
      }
    }
  }
  fs.rmSync(home,{recursive:true,force:true})
  console.log('Verified Intel fresh install, login screen, persisted workspace, packaged assets and reopen.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
