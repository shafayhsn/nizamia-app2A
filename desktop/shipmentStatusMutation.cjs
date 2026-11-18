'use strict'

const {isDeepStrictEqual}=require('node:util')
const marker='\n\n[[APP2A_SHIPPING_META:'
const statuses=new Set(['Gate-In','In-Transit','Discharged','Gate-Out','Delivered'])

function split(value){
 if(value===null)return {text:'',meta:{}}
 if(typeof value!=='string'||Buffer.byteLength(value)>56000)return null
 const index=value.lastIndexOf(marker)
 if(index<0)return {text:value.trim(),meta:{}}
 const encoded=value.slice(index+marker.length)
 if(!/^[A-Za-z0-9+/=]+\]\]$/.test(encoded))return null
 try{
  const meta=JSON.parse(Buffer.from(encoded.slice(0,-2),'base64').toString('latin1'))
  if(!meta||typeof meta!=='object'||Array.isArray(meta))return null
  return {text:value.slice(0,index).trim(),meta}
 }catch{return null}
}

function isShipmentStatusChange(before,after){
 const old=split(before),fresh=split(after)
 if(!old||!fresh||old.text!==fresh.text)return false
 const {display_status:previous,status_history:history=[],...oldFields}=old.meta
 const {display_status:next,status_history:nextHistory,...freshFields}=fresh.meta
 if(!statuses.has(next)||previous===next||!isDeepStrictEqual(oldFields,freshFields)||
    !Array.isArray(history)||!Array.isArray(nextHistory)||nextHistory.length!==history.length+1||
    !isDeepStrictEqual(history,nextHistory.slice(0,-1)))return false
 const event=nextHistory.at(-1)
 return event&&Object.keys(event).length===3&&event.to===next&&typeof event.from==='string'&&
  event.from.length<=64&&(previous===undefined||event.from===previous)&&
  typeof event.at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(event.at)&&
  Number.isFinite(Date.parse(event.at))
}

module.exports={isShipmentStatusChange}
