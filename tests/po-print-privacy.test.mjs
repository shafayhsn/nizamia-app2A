import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'

test('PO print template masks draft identifiers even with populated cached objects',async()=>{
  const bundle=await build({entryPoints:['src/components/PrintReports.jsx'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,
    plugins:[{name:'print-fixtures',setup(b){
      b.onResolve({filter:/lib\/(supabase|utils)$/},a=>({path:a.path,namespace:'fixture'}))
      b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('utils')?'export const formatDate=()=>""':'export const supabase={}' }))
    }}]})
  const mod={exports:{}}
  new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports)
  const po={id:'p',po_number:'PO-TEST',status:'approved',supplier_id:'s',order_id:'o',purchase_order_items:[]}
  globalThis.localStorage={getItem:()=>null,setItem(){}}
  globalThis.location={protocol:'https:'}
  for(const proof of [false,true,'unavailable']){
    globalThis.fetch=async()=>{
      if(proof==='unavailable')throw Error('offline')
      return Response.json({rows:[{...po,approval_verified:proof}]})
    }
    let html=''
    const target={document:{open(){},write(s){html=s},close(){}},focus(){},print(){}}
    await mod.exports.printPurchaseOrder(po,{id:'s',name:'HiddenSupplierQA'},{id:'o',job_number:'PrivateJobQA'},null,target)
    for(const secret of ['HiddenSupplierQA','PrivateJobQA'])assert.equal(html.includes(secret),proof===true)
  }
})
