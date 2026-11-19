import test from 'node:test'
import assert from 'node:assert/strict'
import { accountAction } from '../server/accountActions.js'

test('account changes require an admin, including on future roles',async()=>{
  const res={status(n){this.code=n;return this},json(body){return body}}
  for(const role of ['merchandiser','production_manager','assistant_admin']){
    for(const action of ['accountCreate','accountPassword','accountActive','accountRestriction','accountRole','accountList','accountRoles']){
      await accountAction({method:'POST',body:{id:'target'}},res,null,{id:'caller',role},action)
      assert.equal(res.code,403)
    }
  }
})
