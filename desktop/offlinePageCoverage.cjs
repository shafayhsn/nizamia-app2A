'use strict'
// CP-18 scope contract: original web pages are not silently dropped from desktop.
// A page appearing in navigation does not mean its forms or workflows are complete.
const PAGES = Object.freeze([
 'dashboard','orders','purchasing','sampling','parcels','shipping','reports',
 'tasks','production','buyers','suppliers','library','costing','ppmeeting',
 'customreports','users','settings','features'
])
const REQUIREMENTS = Object.freeze({
 orders:['browse','create','edit','size breakdown','BOM','packing','export','sync'],
 production:['browse','department tracking','daily entry','edit','report','sync'],
 purchasing:['browse','purchase order','supplier linkage','edit','sync'],
 sampling:['samples','approvals','history','sync'],
 parcels:['dispatch','tracking','sync'],
 shipping:['booking','shipment','documents','sync'],
 reports:['PDF','Excel','column visibility','date filters','QMS formats','production formats'],
 tasks:['browse','create','assign','status','sync'],
 buyers:['browse','edit','sync'],
 suppliers:['browse','edit','sync'],
 library:['browse','attachments','sync'],
 costing:['browse','cost sheets','edit','sync'],
 ppmeeting:['browse','meeting checklist','edit','sync'],
 customreports:['browse','report designer','save layout','export'],
 users:['verified enrollment','permissions','session'],
 settings:['configuration','offline status'],
 features:['feature flags'],
 dashboard:['summary','live metrics','offline metrics']
})
function auditCoverage(navigation, overviews) {
 const keys = new Set(navigation.map(item => item.key))
 const missing = PAGES.filter(key => !keys.has(key))
 const unknown = navigation.filter(item => !PAGES.includes(item.key) && item.key !== 'all').map(item=>item.key)
 const missingOverviews = PAGES.filter(key => !Object.hasOwn(overviews,key))
 return {complete:missing.length===0 && unknown.length===0 && missingOverviews.length===0,
   missing,unknown,missingOverviews,requiredPages:PAGES.length,requirements:REQUIREMENTS}
}
module.exports={PAGES,REQUIREMENTS,auditCoverage}
