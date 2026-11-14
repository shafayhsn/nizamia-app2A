'use strict'
const assert=require('node:assert/strict')
const crypto=require('node:crypto')
const {createTrustedGrantBroker}=require('./offlineTrustedGrantBroker.cjs')
const {createOfflineGrantIssuer}=require('../server/offlineGrantIssuer.cjs')
async function main(){
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519')
 const now=Date.now(),identity='operator_1',snapshotHash='a'.repeat(64)
 const issuer=createOfflineGrantIssuer({privateKey,authorize:async()=>true,now:()=>now})
 const client={draft:async(hash,permissions)=>issuer.draft({
  session:{authenticated:true},identity,snapshotHash:hash,permissions
 })}
 const broker=createTrustedGrantBroker({client,publicKey,clock:()=>now})
 const grant=await broker.request({identity,table:'orders',snapshotHash,token:'valid-server-session-token'})
 assert.equal(grant.identity,identity)
 assert.deepEqual([...grant.permissions],['offline:draft:orders'])
 await assert.rejects(()=>broker.request({identity,table:'suppliers',snapshotHash,token:'valid-server-session-token'}),/Invalid/)
 const forged=createTrustedGrantBroker({client:{draft:async()=>({claims:{},signature:'bad'})},publicKey,clock:()=>now})
 await assert.rejects(()=>forged.request({identity,table:'orders',snapshotHash,token:'valid-server-session-token'}),/rejected/)
 const wrongKey=crypto.generateKeyPairSync('ed25519').publicKey
 const untrusted=createTrustedGrantBroker({client,publicKey:wrongKey,clock:()=>now})
 await assert.rejects(()=>untrusted.request({identity,table:'orders',snapshotHash,token:'valid-server-session-token'}),/rejected/)
 const stale=createTrustedGrantBroker({client,publicKey,clock:()=>now+11*60*1000})
 await assert.rejects(()=>stale.request({identity,table:'orders',snapshotHash,token:'valid-server-session-token'}),/rejected/)
 let release
 const wait=new Promise(resolve=>{release=resolve})
 const busy=createTrustedGrantBroker({client:{draft:async()=>{await wait;return issuer.draft({
  session:{authenticated:true},identity,snapshotHash,permissions:['offline:draft:orders']})}},publicKey,clock:()=>now})
 const first=busy.request({identity,table:'orders',snapshotHash,token:'valid-server-session-token'})
 await assert.rejects(()=>busy.request({identity,table:'orders',snapshotHash,token:'valid-server-session-token'}),/already in progress/)
 release()
 await first
 process.stdout.write('Trusted signed grant broker tests passed.\n')
}
main().catch(e=>{console.error(e);process.exitCode=1})
