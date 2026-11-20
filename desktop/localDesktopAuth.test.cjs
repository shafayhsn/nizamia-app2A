'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const {createLocalAuth}=require('./localDesktopAuth.cjs')

test('verified enrollment enables offline login after the app reopens',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'app2a-auth-test-'))
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
 const user={id:'operator-1',username:'operator',email:'operator@example.test',role:'operator',is_active:true}
 const password='fixture-password'
 const auth=createLocalAuth(directory)
 assert.equal(auth.isAuthenticated(),false)
 assert.throws(()=>auth.login('operator',password),/First sign in online/)
 assert.throws(()=>auth.enroll('operator',password,{...user,is_active:false}),/verification failed/)
 assert.equal(auth.enroll('operator',password,user).authenticated,true)
 auth.logout()
 assert.equal(auth.isAuthenticated(),false)
 const reopened=createLocalAuth(directory)
 assert.throws(()=>reopened.login('operator','wrong'),/Invalid credentials/)
 assert.equal(reopened.login(user.email,password).user.id,user.id)
 const file=path.join(directory,'desktop-web-users.json')
 assert.equal(fs.readFileSync(file,'utf8').includes(password),false)
 assert.equal(fs.statSync(file).mode&0o777,0o600)
})

test('online-only workspace credentials replace stale offline access',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nzos-staff-auth-'))
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
 const auth=createLocalAuth(directory)
 const user={id:'operator-1',username:'operator',role:'merchandiser',is_active:true}
 auth.enroll('operator','fixture-password',user)
 const scoped={...user,role:'sample_room',permissions:{}}
 assert.deepEqual(auth.onlineOnly('operator',scoped).user,scoped)
 auth.logout()
 assert.throws(()=>auth.login('operator','fixture-password'),/First sign in online/)
})
