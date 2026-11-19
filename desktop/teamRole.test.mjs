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
