'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')

test('projects purchasing lines and nested library items from local rows',async()=>{
 const {projectOfflineRows}=await import('./offlineProjection.js')
 const tables={
  purchase_order_items:[{id:'line',po_id:'p',amount:12},{id:'unrelated',po_id:'x',amount:1}],
  bom_preset_items:[{id:'item',preset_id:'b',library_item_id:'material'}],
  library_items:[{id:'material',name:'Denim'}]
 }
 const loadRows=async name=>tables[name]
 assert.deepEqual(await projectOfflineRows('purchase_orders',[{id:'p',status:'Draft'},{id:'empty'}],
  'id,purchase_order_items(amount)',loadRows),[
  {id:'p',purchase_order_items:[{amount:12}]},{id:'empty',purchase_order_items:[]}
 ])
 assert.deepEqual(await projectOfflineRows('bom_presets',[{id:'b'}],
  '*, bom_preset_items(id, library_items(name))',loadRows),[
  {id:'b',bom_preset_items:[{id:'item',library_items:{name:'Denim'}}]}
 ])
 await assert.rejects(projectOfflineRows('purchase_orders',[],'users(*)',loadRows),/Unsupported offline relationship/)
})
