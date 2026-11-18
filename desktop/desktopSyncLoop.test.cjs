'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createDesktopSyncLoop}=require('./desktopSyncLoop.cjs')

test('upload waits for connectivity, retries, refreshes after acknowledgement and hides credentials',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 let online=false,calls=0,refreshed=[]
 const session={token:'test secret'}
 const loop=createDesktopSyncLoop({
  isOnline:()=>online,intervalMs:1000,
  coordinator:{async synchronize(){
   if(++calls===1)throw Error('network fault')
   return {archived:1,retained:0,conflicts:0}
  }},
  async refresh(current){refreshed.push(current)}
 })
 const tick=async value=>{t.mock.timers.tick(value);await Promise.resolve();await Promise.resolve()}
 loop.start(session)
 await tick(0)
 assert.equal(loop.getStatus().state,'offline')
 assert.equal(calls,0)
 online=true
 await tick(1000)
 assert.equal(loop.getStatus().state,'retrying')
 await tick(1000)
 assert.deepEqual(loop.getStatus(),{state:'ready',archived:1,retained:0,conflicts:0})
 assert.deepEqual(refreshed,[session])
 loop.stop()
 await tick(1000)
 assert.equal(loop.getStatus().state,'sign-in-required')
 assert.equal(calls,2)
})
