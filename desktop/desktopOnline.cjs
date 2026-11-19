'use strict'
const path = require('node:path')
const os = require('node:os')
const {execFile} = require('node:child_process')

async function marketRates(method, fetchRates = fetch) {
  if (method !== 'GET') return new Response(null, {status:405})
  try {
    const response = await fetchRates('https://app.nizamia.com/api/market-rates', {
      signal:AbortSignal.timeout(7000), redirect:'error'
    })
    if (!response.ok) throw Error('Market service unavailable')
    const data = await response.json()
    const dated = q => typeof q?.value === 'number' && Number.isFinite(q.value) && q.value > 0 && typeof q.date === 'string' && q.date.trim()
    const fx = {}
    for (const code of ['USD','EUR','GBP']) {
      if (dated(data.fx?.[code])) fx[code] = {value:data.fx[code].value,date:data.fx[code].date}
    }
    const cotton = dated(data.cotton) ? {value:data.cotton.value,date:data.cotton.date} : null
    if (!cotton && !Object.keys(fx).length) throw Error('No dated quotes available')
    return Response.json({fx,cotton})
  } catch {
    return Response.json({error:'Market rates unavailable'}, {status:503})
  }
}
function handleWebLink(raw, open, report) {
  let url
  try { url = new URL(raw) } catch { return }
  if (!['https:','http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return
  open(url.href).catch(report)
}
function registerInstalledMacApp(resources) {
  const bundle = path.resolve(resources,'../..')
  if (!['/Applications',path.join(os.homedir(),'Applications')].includes(path.dirname(bundle))) return
  const tool='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
  execFile(tool,['-f',bundle],{timeout:5000},error=>{
    if(error) console.warn('Could not refresh macOS app registration:',error.message)
  })
}
module.exports={marketRates,handleWebLink,registerInstalledMacApp}
