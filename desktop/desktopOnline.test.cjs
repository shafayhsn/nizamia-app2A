const {test}=require('node:test')
const assert=require('node:assert/strict')
const {marketRates,handleWebLink}=require('./desktopOnline.cjs')
test('returns dated available quotes and rejects empty, failed and non-GET requests',async()=>{
  const usd={value:275,date:'2026-11-19'}
  const valid=await marketRates('GET',async url=>{
    assert.equal(url,'https://app.nizamia.com/api/market-rates')
    return Response.json({fx:{USD:usd,EUR:{value:-1}},cotton:null})
  })
  assert.deepEqual(await valid.json(),{fx:{USD:usd},cotton:null})
  assert.equal((await marketRates('GET',async()=>Response.json({}))).status,503)
  assert.equal((await marketRates('GET',async()=>{throw Error('offline')})).status,503)
  assert.equal((await marketRates('POST')).status,405)
})
test('hands web tracking URLs to the browser and declines other schemes',()=>{
  const opened=[]
  for(const url of ['https://carrier.example/track?id=42','http://carrier.example/','file:///tmp/a','javascript:void(0)','ftp://host','https://user:pass@host','about:blank'])
    handleWebLink(url,async href=>opened.push(href),assert.fail)
  assert.deepEqual(opened,['https://carrier.example/track?id=42','http://carrier.example/'])
})
