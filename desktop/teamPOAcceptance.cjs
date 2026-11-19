// Intel Electron UI acceptance with isolated accounts and an in-memory cloud fixture.
'use strict'
const {app,BrowserWindow,dialog}=require('electron')
const {randomUUID}=require('node:crypto')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {setTimeout:delay}=require('node:timers/promises')
const assert=require('node:assert/strict')
const {scopeKey}=require('../server/teamSnapshot.cjs')
assert.equal(app.isPackaged,false)
assert.equal(process.arch,'x64')
assert.equal(process.platform,'darwin')
const dir=fs.mkdtempSync(path.join(os.homedir(),'nzos-team-qa-'))
app.setPath('userData',dir)
const member={id:randomUUID(),username:'QA Staff',role:'team',role_id:randomUUID(),is_active:true,
 permissions:{purchasing:{view:true,create:true,edit:true},suppliers:{view:true}}}
const admin={id:randomUUID(),username:'QA Admin',role:'admin',is_active:true}
const supplier={id:randomUUID(),name:'Fixture supplier'}
let actor,order,task
const tokens=new Map()
dialog.showMessageBox=async()=>({response:0})
global.fetch=async(url,init={})=>{
 const u=new URL(url)
 assert.equal(u.origin,'https://app.nizamia.com')
 const b=init.body?JSON.parse(init.body):{}
 const action=b.action||u.searchParams.get('action')
 const ok=data=>Response.json(data)
 if(action==='login'){
   actor=b.identifier===member.username?member:admin
   const token=Buffer.from(JSON.stringify({id:actor.id,scope:'desktop-snapshot',exp:Date.now()+3600000})).toString('base64url')+'.fixture';tokens.set(token,actor)
   return Response.json({ok:true,desktopUser:actor,desktopSnapshotToken:token},{headers:{'Set-Cookie':'nizamia_backend_session='+actor.id+'; HttpOnly'}})
 }
 if(u.pathname==='/api/desktop/snapshot'){
   const user=tokens.get(init.headers.authorization.slice(7))
   const tables={orders:[],buyers:[],suppliers:[supplier],app_tasks:user===admin&&task?[task]:[]}
   return ok({tables,backup_metadata:{staff_scope:user===member?scopeKey(user):undefined,table_count:4,
     table_row_counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]))}})
 }
 if(action==='poApprovers')return ok({data:[admin]})
 if(action==='readPOPage')return ok({rows:order?[order]:[]})
 if(action==='assignedPOReviews')return ok({data:task?[task]:[]})
 if(action==='savePurchaseOrder'){
   assert.equal(init.headers.Cookie,'nizamia_backend_session='+member.id)
   assert.equal(b.approver,admin.id);assert.equal(b.header.supplier_id,supplier.id)
   assert.equal(b.lines[0].description,'Custom denim label')
   order={id:b.operation,po_number:'QA-101',status:'Draft',details_hidden:true,purchase_order_items:b.lines}
   task={id:randomUUID(),title:'Approve PO QA-101',related_record:'PO approval: '+order.id,assignee_id:admin.id,status:'Pending'}
   return ok({id:order.id})
 }
 if(action==='approveAssignedPO'){
   assert.equal(init.headers.Cookie,'nizamia_backend_session='+admin.id);assert.equal(b.poId,order.id)
   task.status='Completed';Object.assign(order,{status:'approved',details_hidden:false,supplier_id:supplier.id,approval_verified:true})
   return ok({taskId:task.id})
 }
 return Response.json({error:'Unavailable in fixture'},{status:503})
}
require('./main.cjs')
async function until(fn,label){
 const limit=Date.now()+30000
 while(Date.now()<limit){const value=await fn();if(value)return value;await delay(150)}
 throw Error('Timed out waiting for '+label)
}
async function run(){
 const win=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('app2a://local/')),'app window')
 const js=s=>win.webContents.executeJavaScript(s)
 const login=async(user,page)=>{
   await js("(async()=>{const r=await fetch('/api/offline/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:"+JSON.stringify(JSON.stringify({action:'login',username:user.username,password:'fixture-password'}))+"});if(!r.ok)throw Error((await r.json()).error)})()")
   await win.loadURL('app2a://local/'+page)
 }
 const waitJs=(s,label)=>until(()=>js(s),label)
 const btn=text=>"Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+JSON.stringify(text)+")"
 const click=async(text)=>{await waitJs('!!('+btn(text)+')',text);await js(btn(text)+'.click()')}
 await login(member,'purchasing')
 await click('+ New custom PO')
 await waitJs("Array.from(document.querySelectorAll('option')).some(o=>o.textContent==='Fixture supplier')",'supplier')
 await waitJs("Array.from(document.querySelectorAll('option')).some(o=>o.textContent==='QA Admin')",'admin')
 await js(`for(const val of [${JSON.stringify(admin.id)},${JSON.stringify(supplier.id)}]){const s=document.querySelector('option[value="'+val+'"]').parentElement;s.value=val;s.dispatchEvent(new Event('change',{bubbles:true}))}`)
 await js(`const input=document.querySelector('input[placeholder="Item description"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Custom denim label');input.dispatchEvent(new Event('input',{bubbles:true}))`)
 await click('Create PO');await until(()=>task,'assigned task')
 await click('Purchase Orders')
 await waitJs("document.querySelector('tbody')?.innerText.includes('Awaiting approval')",'hidden supplier')
 await login(admin,'tasks')
 await waitJs("Array.from(document.querySelectorAll('tbody tr')).some(r=>r.innerText.includes('Approve PO QA-101'))",'Admin inbox')
 await js("Array.from(document.querySelectorAll('tbody tr')).find(r=>r.innerText.includes('Approve PO QA-101')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))")
 await click('Approve PO for issuance');await until(()=>task.status==='Completed','approval')
 await login(member,'purchasing?tab=pos')
 await waitJs("Array.from(document.querySelectorAll('tbody tr')).some(r=>r.innerText.includes('QA-101') && r.innerText.includes('Fixture supplier'))",'approved supplier')
 console.log('Staff created a custom PO, the selected Admin approved from Tasks, and the staff register revealed the supplier.')
}
run().then(()=>app.exit(0)).catch(error=>{console.error(error);const w=BrowserWindow.getAllWindows()[0];w?.webContents.executeJavaScript('document.body.innerText.slice(-1600)').then(console.error).finally(()=>app.exit(1));if(!w)app.exit(1)})
