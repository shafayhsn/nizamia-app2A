const {test}=require('node:test')
const assert=require('node:assert/strict')
const {randomUUID,createHmac}=require('node:crypto')
const {createDesktopMutationHttp}=require('./desktopMutationHttp.cjs')
const {issueDesktopSyncToken}=require('./desktopSyncToken.cjs')

test('sample stage, approval and retry use authenticated desktop uploads',async()=>{
 const key=randomUUID(),actor=randomUUID(),id=randomUUID(),operationId=randomUUID(),calls=[]
 const handle=createDesktopMutationHttp({key,db:{rpc:async(name,args)=>{
  calls.push({name,args});return {data:'applied'}
 }}})
 const stage={operation:'update',table:'samples',id,expected:{stage:'Cutting'},changes:{stage:'Ready'}}
 const send=(token,intent)=>handle({method:'POST',headers:{authorization:'Bearer '+token},body:{operations:[{operationId,intent}]}})
 const legacy=Buffer.from(JSON.stringify({id:actor,scope:'desktop-sync',exp:Date.now()+10000})).toString('base64url')
 const oldToken=legacy+'.'+createHmac('sha256',key).update('desktop-sync:'+legacy).digest('base64url')
 assert.equal((await send(oldToken,stage)).body.results[0].outcome,'retry')
 assert.equal(calls.length,0)
 const token=issueDesktopSyncToken(key,actor)
 assert.equal((await send(token,stage)).body.results[0].outcome,'applied')
 assert.deepEqual(calls[0],{name:'desktop_update_sample_stage',args:{actor,operation:operationId,target_sample:id,previous_stage:'Cutting',new_stage:'Ready'}})
 const patch={approval_status:'Approved'},expected={approval_status:'Pending'}
 await send(token,{table:'samples',operation:'update',id,changes:{area3:patch},expected:{area3:expected}})
 assert.deepEqual(calls[1],{name:'desktop_change_sampling_parcel',args:{actor,operation:operationId,kind:'samples',target:id,verb:'update',patch,expected}})
 assert.equal((await send('expired',stage)).status,401)
})
