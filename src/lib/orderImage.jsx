import React,{useEffect,useRef} from 'react'
import {supabase} from './supabase'

export function useOrderImageLoader(userKey,setOrders) {
 const session=useRef(null)
 if(session.current?.userKey!==userKey)session.current={userKey,images:new Map()}
 const current=session.current
 return async function loadImage(row){
   const version=row?.nzos_image_version
   if(!version||row.style_image_base64||row.style_image_url)return
   let pending=current.images.get(version)
   if(!pending){
     pending=supabase.from('orders').select('style_image_base64').eq('id',row.id).eq('nzos_image_version',version).maybeSingle()
     current.images.set(version,pending=Promise.resolve(pending))
   }
   try{
     const {data,error}=await pending
     if(error||!data?.style_image_base64){current.images.delete(version);return}
     if(session.current!==current)return
     setOrders(rows=>rows.map(r=>r.nzos_image_version===version&&!r.style_image_base64?{...r,style_image_base64:data.style_image_base64}:r))
   }catch{current.images.delete(version)}
 }
}
export function VisibleOrderImage({row,load,children}){
 const ref=useRef(null),fetchRef=useRef(load)
 fetchRef.current=load
 useEffect(()=>{
   if(!row?.nzos_image_version||row.style_image_base64||row.style_image_url)return
   const observer=new IntersectionObserver(entries=>{
     if(entries.some(e=>e.isIntersecting)){observer.disconnect();fetchRef.current(row)}
   })
   observer.observe(ref.current)
   return ()=>observer.disconnect()
 },[row?.id,row?.nzos_image_version,row?.style_image_base64,row?.style_image_url])
 return <div ref={ref}>{children}</div>
}
