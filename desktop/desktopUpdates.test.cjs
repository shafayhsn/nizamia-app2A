'use strict'
const assert=require('node:assert/strict')
const {checkForDesktopRelease,isNewer}=require('./desktopUpdates.cjs')
;(async()=>{
 assert.equal(isNewer('0.2.0','0.1.0'),true)
 assert.equal(isNewer('0.1.0','0.1.0'),false)
 assert.equal(isNewer('0.0.9','0.1.0'),false)
 const result=await checkForDesktopRelease({currentVersion:'0.1.0',fetchRelease:async()=>({tag_name:'v0.2.0',html_url:'https://github.com/shafayhsn/nizamia-app2A/releases/tag/v0.2.0'})})
 assert.equal(result.status,'newer')
 assert.equal((await checkForDesktopRelease({currentVersion:'0.1.0',fetchRelease:async()=>null})).status,'unpublished')
 console.log('Desktop update checker tests passed')
})().catch(e=>{console.error(e);process.exitCode=1})
