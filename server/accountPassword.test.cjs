const {test}=require('node:test')
const assert=require('node:assert/strict')
const {hashPassword,verifyPassword}=require('./accountPassword.cjs')
test('legacy accounts can migrate while new passwords are salted and verified',async()=>{
 const password='fixture-passphrase'
 const first=await hashPassword(password), second=await hashPassword(password)
 assert.notEqual(first,second)
 assert.equal(first.includes(password),false)
 assert.equal(await verifyPassword(password,first),true)
 assert.equal(await verifyPassword('wrong',first),false)
 assert.equal(await verifyPassword(password,password),true)
 assert.equal(await verifyPassword('wrong',password),false)
})
