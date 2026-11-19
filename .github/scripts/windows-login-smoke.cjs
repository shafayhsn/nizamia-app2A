const assert=require('node:assert/strict')
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function run(){
  for(let attempt=0;attempt<60;attempt++){
    const pages=await fetch('http://127.0.0.1:9322/json/list').then(r=>r.json()).catch(()=>[])
    const page=pages.find(p=>p.type==='page' && p.url.startsWith('app2a://local/'))
    if(page){
      const socket=new WebSocket(page.webSocketDebuggerUrl)
      try{
        const value=await new Promise((resolve,reject)=>{
          socket.onerror=()=>reject(Error('Cannot inspect installed login screen'))
          socket.onopen=()=>socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{
            expression:"(async()=>({login:!!document.querySelector('#dl-user')&&!!document.querySelector('#dl-pass'),version:await fetch('/api/offline/version').then(r=>r.json())}))()",awaitPromise:true,returnByValue:true
          }}))
          socket.onmessage=({data})=>{const reply=JSON.parse(data);if(reply.id===1)resolve(reply.result?.result?.value)}
        })
        if(value?.login){assert.equal(value.version.platform,'win32');assert.equal(value.version.version,require('../../desktop/package.json').version);return}
      }finally{socket.close()}
    }
    await delay(1000)
  }
  throw Error('Installed NZOS did not display its login form')
}
run().catch(error=>{console.error(error);process.exitCode=1})
