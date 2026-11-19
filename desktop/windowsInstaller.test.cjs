const {test}=require('node:test')
const assert=require('node:assert/strict')
const {trustedAsset}=require('./desktopUpdates.cjs')
test('Windows and Mac choose their own verified installer',()=>{
  const names=['NZOS-1.0.3-Intel.dmg','NZOS-1.0.3-Windows-x64-Setup.exe']
  const assets=names.map(name=>({name,size:2000000,digest:'sha256:'+'a'.repeat(64),browser_download_url:'https://github.com/shafayhsn/nizamia-app2A/releases/download/v1.0.3/'+name}))
  assert.equal(trustedAsset({assets},'win32').name,names[1])
  assert.equal(trustedAsset({assets},'darwin').name,names[0])
  assert.equal(trustedAsset({assets:[assets[0]]},'win32'),null)
  assert.equal(trustedAsset({assets:[{...assets[1],digest:''}]},'win32'),null)
})

test('Windows finds a Windows-only release and Mac keeps its own release',async()=>{
  const {checkForDesktopRelease}=require('./desktopUpdates.cjs')
  const base='https://github.com/shafayhsn/nizamia-app2A/releases/'
  const asset=(tag,name)=>({name,size:2000000,digest:'sha256:'+'a'.repeat(64),browser_download_url:base+'download/'+tag+'/'+name})
  const windows=asset('windows-v1.0.4','NZOS-1.0.4-Windows-x64-Setup.exe')
  const mac=asset('v1.0.3','NZOS-1.0.3-Intel.dmg')
  const fetchRelease=async()=>[
    {tag_name:'v1.0.5',html_url:base+'tag/v1.0.5',assets:[mac]},
    {tag_name:'windows-v1.0.4',html_url:base+'tag/windows-v1.0.4',assets:[windows]},
    {tag_name:'v1.0.3',html_url:base+'tag/v1.0.3',assets:[mac]}
  ]
  const win=await checkForDesktopRelease({currentVersion:'1.0.3',fetchRelease,platform:'win32'})
  assert.equal(win.version,'1.0.4')
  assert.equal(win.asset.name,windows.name)
  const intel=await checkForDesktopRelease({currentVersion:'1.0.5',fetchRelease,platform:'darwin'})
  assert.equal(intel.status,'current')
})

test('Windows accepts a writable workspace outside the user profile',async t=>{
  const fs=require('node:fs')
  const path=require('node:path')
  const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'nzos-folders-'))
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}))
  const {prepareWorkspace}=require('./nzosWorkspace.cjs')
  const home=fs.realpathSync(fs.mkdirSync(path.join(root,'home'),{recursive:true}))
  const external=fs.realpathSync(fs.mkdirSync(path.join(root,'other folder'),{recursive:true}))
  const file='nizamia-app2a.sqlite'
  const initialize=async directory=>fs.writeFileSync(path.join(directory,file),'existing',{flag:'wx'})
  await assert.rejects(prepareWorkspace(external,null,home,initialize,'darwin'),/home directory/)
  const settings=await prepareWorkspace(external,null,home,initialize,'win32')
  assert.equal(settings.databaseDirectory,path.join(external,'NZOS','Database'))
  await assert.rejects(prepareWorkspace(external,null,home,initialize,'win32'),/already contains/)
  assert.equal(fs.readFileSync(path.join(settings.databaseDirectory,file),'utf8'),'existing')
})
