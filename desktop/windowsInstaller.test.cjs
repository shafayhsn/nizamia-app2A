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
