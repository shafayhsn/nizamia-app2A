const {test}=require('node:test')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {privateDownload}=require('./privateDownload.cjs')
test('private downloads require a matching object and account and preserve the last complete bytes',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'attachment-'))
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
 const signed='https://qa.supabase.co/storage/v1/object/sign/company-assets/fixture'
 let body='fixture'
 const options={directory,owner:'qa-user',kind:'asset',id:'fixture',record:{storage_path:'fixture',file_size:7},online:true,token:'qa',origin:'https://example.invalid',isCurrent:()=>true,
  fetchImpl:async(url,init)=>{
   if(String(url)===signed){assert.ok(!init.headers?.authorization);return new Response(body)}
   assert.equal(init.headers.authorization,'Bearer qa')
   return Response.json({url:signed,path:'fixture'})
  }}
 const read=async extra=>(await privateDownload({...options,...extra})).toString()
 assert.equal(await read({}),'fixture')
 body='short'
 await assert.rejects(read({}),/incomplete/)
 assert.equal(await read({online:false}),'fixture')
 await assert.rejects(read({online:false,owner:'different'}),/Download this attachment once/)
 await assert.rejects(read({isCurrent:()=>false}),/Sign in/)
})
