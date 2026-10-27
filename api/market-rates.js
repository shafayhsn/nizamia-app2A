// Lightweight server-side market quote proxy. Public data only; no database reads.
export default async function handler(req,res) {
  res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=86400')
  const result={fx:{},cotton:null}
  const get=async(url)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),5000);try{const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'NizamiaApp/1.0'}});if(!r.ok)throw Error('HTTP '+r.status);return r}finally{clearTimeout(t)}}
  await Promise.all([
    (async()=>{try{
      const data=await (await get('https://api.frankfurter.dev/v2/rates?base=USD&quotes=PKR,EUR,GBP')).json()
      const rates=Array.isArray(data)?data:[]
      const lookup=Object.fromEntries(rates.map(x=>[String(x.quote||'').toUpperCase(),x]))
      const pkr=Number(lookup.PKR?.rate),eur=Number(lookup.EUR?.rate),gbp=Number(lookup.GBP?.rate)
      if(pkr>0&&eur>0&&gbp>0)result.fx={USD:{value:pkr,date:lookup.PKR.date},EUR:{value:pkr/eur,date:lookup.EUR.date},GBP:{value:pkr/gbp,date:lookup.GBP.date}}
    }catch(e){result.fxError='Reference rates temporarily unavailable'}})(),
    (async()=>{try{
      // USDA AMS seven-market spot quotation, republished with source attribution.
      const html=await (await get('https://www.cottongrower.com/markets/')).text()
      const plain=html.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,' ').replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\\s+/g,' ')
      const match=plain.match(/7[\\s-]*market average\\s*([0-9]{2,3}\\.[0-9]{1,2})/i)
      const date=plain.match(/Base quality quotations reported\\s+([A-Za-z]+\\s+\\d{1,2}(?:,?\\s+\\d{4})?)/i)
      if(match&&date){const value=Number(match[1]);if(value>20&&value<250)result.cotton={value,date:date[1],source:'USDA AMS seven-market average (via Cotton Grower)'}}
    }catch(e){/* Leave unavailable rather than show an unverified price. */}})()
  ])
  res.status(200).json(result)
}
