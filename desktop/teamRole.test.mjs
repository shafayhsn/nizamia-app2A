import test from 'node:test'
import assert from 'node:assert/strict'
import {can,desktopHome,desktopRole} from './permissions.mjs'

test('two accounts sharing a role use the same explicit four-action grants',()=>{
  const role={role_id:'r1',role:'merchandiser',permissions:{orders:{view:true,create:true,edit:true,delete:false},shipping:{view:true}}}
  for(const id of ['member-a','member-b']){
    const member=desktopRole({...role,id})
    assert.equal(desktopHome(member),'/orders')
    for(const action of ['view','create','edit'])assert.equal(can(member,'orders',action),true)
    assert.equal(can(member,'orders','delete'),false)
    assert.equal(can(member,'shipping','edit'),false)
    assert.equal(can(member,'tasks'),false)
    assert.equal(can(member,'dashboard'),false)
  }
})
test('future roles, removed grants and unassigned users need no name-specific rule',()=>{
  const newRole={role_id:'r2',role:'Future Team',permissions:{parcels:{view:true}}}
  assert.equal(desktopHome(newRole),'/parcels')
  assert.equal(desktopHome({...newRole,permissions:{}}),null)
  assert.equal(desktopHome({...newRole,role_id:null}),null)
  assert.equal(desktopHome({role:'admin'}),'/dashboard')
})

import staffOperations from './staffOperations.cjs'

test('staff routes distinguish view, create and edit and reserve account management for Admin',async()=>{
  const member={role_id:'future-role',permissions:{buyers:{view:true},tasks:{view:true,create:true},'features/costing':{view:true,create:true}}}
  const allowed=(path,body)=>{
    const url=new URL(path,'https://app.local')
    const request=new Request(url,body?{method:'POST',body:JSON.stringify(body)}:{})
    return staffOperations.staffRequestAllowed(member,url.pathname,request)
  }
  assert.equal(await allowed('/api/oms?action=list&type=contacts'),true)
  assert.equal(await allowed('/api/oms?action=ppmList'),false)
  assert.equal(await allowed('/api/oms',{action:'saveCosting'}),true)
  assert.equal(await allowed('/api/oms',{action:'saveCosting',id:'existing'}),false)
  assert.equal(await allowed('/api/offline/operational-record',{kind:'app_tasks',action:'save'}),true)
  assert.equal(await allowed('/api/offline/operational-record',{kind:'app_tasks',action:'save',id:'existing'}),false)
  assert.equal(await allowed('/api/offline/accounts',{action:'accountDelete'}),false)
})

test('desktop fulfillment forwards only the actions granted to staff', async () => {
  const url = 'app2a://local/api/offline/fulfillment'
  const member = { role_id: 'staff', permissions: {
    purchasing: { view: true },
    production: { view: true, create: true },
  } }
  const check = action => staffOperations.staffRequestAllowed(member, new URL(url).pathname,
    new Request(url, { method: 'POST', body: JSON.stringify({ action }) }))
  assert.equal(await check('readStoreReceipts'), true)
  assert.equal(await check('postStoreReceipt'), false)
  assert.equal(await check('readWorkOrderTracking'), true)
  assert.equal(await check('postWorkOrderMovement'), true)
  assert.equal(await check('hrAttendance'), false)
})
