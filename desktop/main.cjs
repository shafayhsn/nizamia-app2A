'use strict'
const {marketRates,handleWebLink,registerInstalledMacApp}=require('./desktopOnline.cjs')
const path = require('node:path')
const { app, BrowserWindow, shell, dialog, Menu, protocol, net, safeStorage } = require('electron')
const { getDatabaseDirectory: baseDirectory, initializeDatabase } = require('./localDatabase.cjs')
const { importBackup } = require('./snapshotImport.cjs')
const { inspectSnapshot } = require('./snapshotInspect.cjs')
const { showLocalSnapshot } = require('./snapshotViewer.cjs')
const fs = require('node:fs')
const {createLocalAuth}=require('./localDesktopAuth.cjs')
const {readSettings,saveSettings}=require('./localDatabase.cjs')
const {prepareWorkspace,archivePdf,privateFolder}=require('./nzosWorkspace.cjs')
if(app.isPackaged && ['darwin','win32'].includes(process.platform)) {
  const support=app.getPath('appData')
  const profiles=[app.getPath('userData'),path.join(support,'nizamia-app2a-desktop'),path.join(support,'Nizamia App-2A')]
  const pending=profiles.find(dir=>fs.existsSync(path.join(dir,'desktop-update-pending.json')))
  const configured=profiles.find(dir=>fs.existsSync(path.join(dir,'local-database-settings.json')))
  const profile=app.commandLine.getSwitchValue('user-data-dir') || pending || configured || path.join(support,'NZOS')
  fs.mkdirSync(profile,{recursive:true,mode:0o700})
  app.setPath('userData',profile)
  if(!app.requestSingleInstanceLock())app.exit(0)
  app.setName('NZOS')
}
let rebuildMenu=()=>{}
let desktopAuth,cloudSessionStore
let staffDirectory=null
function getDatabaseDirectory(){
 const user=desktopAuth?.status().user
 return user && user.role!=='admin'?staffDirectory:baseDirectory()
}
let onlineSnapshotToken=null
const {createHash}=require('node:crypto')
function scopeKey(user){
 const grants=Object.entries(user.permissions||{}).filter(([,v])=>v.view).map(([k])=>k).sort()
 return createHash('sha256').update(JSON.stringify([user.id,user.role_id,grants])).digest('hex')
}

const { snapshotReady } = require('./snapshotStartup.cjs')

// Serve the bundled web SPA under a proper origin so BrowserRouter routes and
// local asset URLs work without an internet connection.
protocol.registerSchemesAsPrivileged([{scheme:'app2a',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])
const APP_URL = 'https://app.nizamia.com'
const ALLOWED_ORIGIN = new URL(APP_URL).origin
const staffActions={
 hr:{'/api/offline/hr-attendance':['hrAttendance']},
 production_incharge:{'/api/offline/staff-workspace':['staffProductionList','staffProductionLog']},
 sample_room:{'/api/offline/staff-workspace':['staffSamplingList','staffSampleStage','staffSamplingProgram']},
 storekeeper:{'/api/offline/staff-workspace':['staffReceivingList'],'/api/offline/fulfillment':['readPoReceiving','postPoReceiving']},
}
const restrictedStaff=role=>Object.hasOwn(staffActions,String(role||'').toLowerCase())
let onlineWebSession=null
let onlineSyncSession=null
const {createOfflineSyncClient}=require('./offlineSyncClient.cjs')
const {createOfflineSyncCoordinator}=require('./offlineSyncCoordinator.cjs')
const {createDesktopSyncLoop}=require('./desktopSyncLoop.cjs')
const syncCoordinator=createOfflineSyncCoordinator({
 client:createOfflineSyncClient({endpoint:APP_URL+'/api/offline-sync',fetchImpl:fetch}),
 getDirectory:getDatabaseDirectory,
 orderNotesOnly:true,
 getSession:()=>onlineSyncSession,
 getToken:session=>session===onlineSyncSession&&Date.now()<session.expiresAt?session.token:null,
 authenticateSession:async session=>session===onlineSyncSession&&desktopAuth?.status().user?.id===session.identity
})
function productionSyncOwner(){
 const user=desktopAuth?.status().user
 return user?.role==='admin' || (staffDirectory && user?.role_id)?user.id:null
}

async function synchronizeDesktopChanges(){
 const session=onlineSyncSession
 const directory=getDatabaseDirectory()
 const result=await syncCoordinator.synchronize()
 const isCurrent=()=>session&&session===onlineSyncSession&&Date.now()<session.expiresAt&&
  productionSyncOwner()===session.identity&&getDatabaseDirectory()===directory
 if(!directory||!isCurrent())return result
 try{
  const {submitPendingMutations}=require('./standaloneRecords.cjs')
  const batch=await submitPendingMutations(directory,{
   ownerId:session.identity,isCurrent,
   async submit(operations){
    const response=await fetch(APP_URL+'/api/desktop/mutations',{
     method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},
     body:JSON.stringify({operations}),signal:AbortSignal.timeout(15000),redirect:'error'
    })
    if(!response.ok)throw Error('Production entries are waiting for the cloud service.')
    return (await response.json()).results
   }
  })
  return {...result,archived:result.archived+batch.archived,
   conflicts:result.conflicts+batch.conflicts,retained:result.retained+batch.retained}
 }catch{
  return {...result,retained:result.retained+1}
 }
}

const syncLoop=createDesktopSyncLoop({
 coordinator:{synchronize:synchronizeDesktopChanges},
 isOnline:()=>net.isOnline(),
 refresh:refreshAfterUploads
})
async function refreshAfterUploads(session){
 const token=onlineSnapshotToken
 const {setTimeout}=require('node:timers/promises')
 // The login refresh can have read cloud data before an upload committed.
 // Let it finish, then request a fresh snapshot for the acknowledged writes.
 while(refreshInFlight&&session===onlineSyncSession&&token===onlineSnapshotToken)
  await setTimeout(100)
 if(session===onlineSyncSession&&token===onlineSnapshotToken)return refreshCloudSnapshot(token)
 return null
}
function activateOnlineSession(user,tokens){
 onlineSnapshotToken=tokens?.snapshot?.token||null
 if(tokens?.sync){
  onlineSyncSession={authenticated:true,identity:user.id,...tokens.sync}
  syncLoop.start(onlineSyncSession)
 }
}
function clearOnlineSession(){
 onlineWebSession=null
 onlineSnapshotToken=null
 onlineSyncSession=null
 syncLoop.stop()
}


// Automatically refresh the read-only cloud snapshot after a verified online
// sign-in. A failed refresh never blocks login or removes local work.
let refreshInFlight=false
let lastSnapshot=null
function announceCloudRefresh(){
 for(const window of BrowserWindow.getAllWindows()){
  if(!window.isDestroyed()&&window.webContents.getURL().startsWith('app2a://local/')){
   window.webContents.executeJavaScript("window.dispatchEvent(new Event('app2a-cloud-snapshot-updated'))").catch(()=>{})
  }
 }
}

async function refreshCloudSnapshot(token){
 if(refreshInFlight)return {status:'busy'}
 refreshInFlight=true
 try{
  if(!desktopAuth?.isAuthenticated()||!token||token!==onlineSnapshotToken)return {status:'skipped'}
  const directory=getDatabaseDirectory()
  if(!directory)throw Error('Local database directory unavailable')
  const {createSnapshotDownloadClient}=require('./snapshotDownloadClient.cjs')
  const {readCheckpoint,applyCloudSnapshot}=require('./applyCloudSnapshot.cjs')
  const checkpoint=await readCheckpoint(directory)
  const member=desktopAuth.status().user
  let payload
  try{
   payload=await createSnapshotDownloadClient({origin:APP_URL,fetchImpl:fetch}).download({token,checkpoint,incremental:true})
   if(payload.checkpoint?.scope && payload.checkpoint.scope!==scopeKey(member))throw Object.assign(Error('Access changed. Sign in again.'),{status:403})
  }catch(error){
   if(error.status===403 && onlineSnapshotToken===token){
    desktopAuth.forget(member.username);desktopAuth.logout();clearOnlineSession();staffDirectory=null
    for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.loadURL('app2a://local/login')
   }
   throw error
  }
  if(!desktopAuth?.isAuthenticated()||token!==onlineSnapshotToken)return {status:'skipped'}
  if(directory!==getDatabaseDirectory())return {status:'skipped'}
  if(payload.delta){
   const member=desktopAuth.status().user
   if(member.role!=='admin'&&scopeKey(member)!==payload.checkpoint.scope)throw Error('Permissions changed. Sign in again.')
   if(payload.checkpoint.revision===checkpoint.revision&&!Object.keys(payload.delta.changes).length)return {status:'current'}
   const result=await applyCloudSnapshot({directory,delta:payload.delta,checkpoint:payload.checkpoint,adminScope:member.role==='admin'})
   lastSnapshot=null
   if(payload.delta.more&&!result.unresolved?.length)setImmediate(()=>{if(onlineSnapshotToken===token)refreshCloudSnapshot(token).catch(error=>console.warn('Sync will retry:',error.message))})
   announceCloudRefresh()
   return {status:'updated',tables:result.updatedTables,unresolved:result.unresolved}
  }
  const excluded=new Set(['users','permissions','roles','app_database_sync_status','notification_reads','app_task_reads'])
  const sensitive=/password|secret|token|api_key|private_key|session|credential|auth_hash|passkey_hash/i
  const tables=Object.fromEntries(Object.entries(payload.tables)
   .filter(([name])=>!excluded.has(name))
   .map(([name,rows])=>[name,rows.map(row=>Object.fromEntries(Object.entries(row).filter(([field])=>!sensitive.test(field))))]))
  if(getDatabaseDirectory()!==directory)return {status:'skipped'}
  const digest=require('node:crypto').createHash('sha256').update(JSON.stringify(tables)).digest('hex')
  if(!payload.checkpoint?.scope&&lastSnapshot?.directory===directory&&lastSnapshot.digest===digest){
   const file=path.join(directory,'nizamia-app2a.sqlite')
   if(fs.statSync(file).mtimeMs===lastSnapshot.mtime)return {status:'current',unresolved:lastSnapshot.unresolved}
  }
  const user=desktopAuth.status().user
  if(user.role!=='admin' && (payload.backup_metadata.staff_scope!==scopeKey(user)||directory!==staffDirectory))throw Error('Permissions changed. Sign in again before refreshing.')
  const result=await applyCloudSnapshot({directory,tables,adminScope:user.role==='admin',checkpoint:payload.checkpoint?.scope?payload.checkpoint:null})
  lastSnapshot={directory,digest,unresolved:result.unresolved,mtime:fs.statSync(path.join(directory,'nizamia-app2a.sqlite')).mtimeMs}
  announceCloudRefresh()
  return {status:'updated',tables:result.updatedTables,unresolved:result.unresolved}
 }finally{refreshInFlight=false}
}

function allowedNavigation(url) {
  try { return new URL(url).origin === ALLOWED_ORIGIN && new URL(url).protocol === 'https:' }
  catch { return false }
}

async function enforceLocalDataScope(directory=getDatabaseDirectory()){
 const user=desktopAuth?.status().user
 if(user?.role==='admin')return
 if(restrictedStaff(user?.role)&&directory)throw Error('This workspace uses online records only.')
 if(user && staffDirectory && directory===staffDirectory)return
 if(!directory||!fs.existsSync(path.join(directory,'nizamia-app2a.sqlite')))return
 const {hasAdminCloudSnapshot}=require('./applyCloudSnapshot.cjs')
 if(await hasAdminCloudSnapshot(directory))
  throw Error('This computer contains an administrator-only cloud snapshot. Sign in as an administrator or use the web app.')
}
async function openLocalData() {
  try {
    const directory = getDatabaseDirectory()
    if (!directory || !fs.existsSync(path.join(directory, 'nizamia-app2a.sqlite')))
      throw new Error('Choose a database folder to initialize your standalone database.')
    await enforceLocalDataScope()
    showLocalSnapshot(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null, getDatabaseDirectory,enforceLocalDataScope)
  } catch (error) { dialog.showErrorBox('Local SQLite viewer', error.message) }
}
let initializing=null
function ensureDesktop(){
  if(!initializing)initializing=startDesktop().finally(()=>{initializing=null})
  return initializing
}
async function startDesktop() {
  try {
    let directory=getDatabaseDirectory()
    if (!readSettings().workspaceRoot) {
      const saved=readSettings()
      // The old helper waits for startup. Migrate beside its verified database without a new Documents permission prompt.
      const upgrading=fs.existsSync(path.join(app.getPath('userData'),'desktop-update-pending.json'))
      const home=fs.realpathSync.native(require('node:os').homedir())
      let selected=saved.workspaceParent||(upgrading&&directory?path.dirname(directory):app.getPath('documents'))
      let pickFolder=app.isPackaged && !saved.workspaceParent && !upgrading
      if(!app.isPackaged) selected=app.getPath('userData')
      let settings
      while(!settings){
        if(pickFolder){
          const choice=await dialog.showOpenDialog({title:'Choose NZOS Data Folder',defaultPath:selected,properties:['openDirectory','createDirectory']})
          if(choice.canceled){app.quit();return}
          selected=choice.filePaths[0]
        }
        try{
          settings=await prepareWorkspace(selected,directory,home,initializeDatabase)
        }catch(error){
          if(process.platform!=='win32' || !app.isPackaged)throw error
          const choice=await dialog.showMessageBox({
            type:'warning',title:'NZOS data folder',message:'NZOS could not use this folder.',
            detail:selected+'\n\n'+error.message,buttons:['Choose Another Folder','Quit'],cancelId:1
          })
          if(choice.response!==0){app.quit();return}
          selected=home
          pickFolder=true
        }
      }
      saveSettings(settings)
      directory=settings.databaseDirectory
    }
    if (!fs.existsSync(path.join(directory,'nizamia-app2a.sqlite'))) throw Error('The configured NZOS database is missing.')
    const assets=path.join(process.resourcesPath,'brand-assets')
    if(fs.existsSync(assets)){
      const folder=privateFolder(privateFolder(readSettings().workspaceRoot,'App Assets'),app.getVersion())
      for(const entry of fs.readdirSync(assets,{withFileTypes:true})){
        if(entry.isFile()) {
          try{fs.copyFileSync(path.join(assets,entry.name),path.join(folder,entry.name),fs.constants.COPYFILE_EXCL)}
          catch(error){if(error.code!=='EEXIST')throw error}
        }
      }
    }
    if (!await snapshotReady(directory)) throw new Error('Local SQLite database could not be verified')
    // Align only explicitly reviewed business tables, after SQLite verification.
    // The migration creates a verified pre-change backup and never drops columns.
    const alignment=await require('./offlineSchemaStartup.cjs').migrateReviewedLocalSchema(directory)
    if(alignment.status==='review-required') {
      console.warn('Local schema needs manual review; existing database preserved:',alignment.issues)
    } else if(alignment.status==='updated' && !await snapshotReady(directory)) {
      throw new Error('Migrated local SQLite database failed startup verification; pre-change backup retained')
    }
    desktopAuth=createLocalAuth(app.getPath('userData'))
    if(['darwin','win32'].includes(process.platform)){
      const {createDesktopCloudSessionStore}=require('./desktopCloudSession.cjs')
      cloudSessionStore=createDesktopCloudSessionStore({directory:app.getPath('userData'),safeStorage})
    }
    if(fs.existsSync(path.join(process.resourcesPath,'web','index.html')))openBundledWebApp()
    else await openLocalData()
    // Confirm only after the local database passed startup verification.
    try{require('./desktopUpdateLaunch.cjs').confirmSuccessfulStartup({userData:app.getPath('userData'),version:app.getVersion()})}catch(error){console.error('Update startup confirmation failed:',error)}
  } catch(error) {
    console.error('NZOS startup failed:',error.message)
    try{fs.writeFileSync(path.join(app.getPath('userData'),'last-startup-error.txt'),error.message,{mode:0o600})}catch{}
    dialog.showErrorBox('Standalone startup failed',error.message+'\n\nKeep your existing database and backups. Close NZOS before recovering the workspace.')
  }
}
// The original App-2A React entry is bundled with the DMG. This opens that
// exact UI rather than reconstructing it in the standalone snapshot viewer.
// Its Supabase-dependent operations still need a local data adapter for offline use.
function openBundledWebApp() {
  const bundled=path.join(process.resourcesPath,'web','index.html')
  if(!fs.existsSync(bundled)) {
    dialog.showErrorBox('App-2A web interface','Bundled web application is missing from this installation.')
    return
  }
  const win=new BrowserWindow({
    width:1360,height:900,minWidth:960,minHeight:650,
    title:'NZOS',
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
  })
  const openLink=url=>handleWebLink(url,href=>shell.openExternal(href),error=>dialog.showErrorBox('Could not open link',error.message))
  win.webContents.setWindowOpenHandler(({url})=>{
    openLink(url)
    return {action:'deny'}
  })
  win.webContents.on('will-navigate',(event,url)=>{
    if(!url.startsWith('app2a://local/')){event.preventDefault();openLink(url)}
  })
  win.on('page-title-updated',event=>event.preventDefault())
  win.loadURL('app2a://local/').catch(error=>dialog.showErrorBox('App-2A web interface',error.message))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 960, minHeight: 650,
    title: 'Nizamia App-2A',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  })

  // Reports generate PDF/print content using window.open('', '_blank') and
  // document.write(). Permit ONLY this blank child window; block all other
  // popup creation. Child windows inherit the sandboxed renderer security.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1050, height: 800,
          title: 'Nizamia Report',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            devTools: !app.isPackaged
          }
        }
      }
    }
    if (allowedNavigation(url)) shell.openExternal(url)
    else if (/^https:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-create-window', child => {
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    child.webContents.on('will-navigate', (event, url) => {
      if (url !== 'about:blank') event.preventDefault()
    })
    child.webContents.on('will-attach-webview', event => event.preventDefault())
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url === 'file://' + path.join(__dirname, 'offline.html')) return
    if (!allowedNavigation(url)) {
      event.preventDefault()
      if (/^https:\/\//i.test(url)) shell.openExternal(url)
    }
  })
  win.webContents.on('will-attach-webview', event => event.preventDefault())
  let fallbackActive = false
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && code !== -3 && !fallbackActive && validatedURL !== 'file://' + path.join(__dirname, 'offline.html')) {
      fallbackActive = true
      win.loadFile(path.join(__dirname, 'offline.html')).catch(() => {})
      dialog.showMessageBox(win, {
        type: 'warning', title: 'Cloud connection unavailable',
        message: 'App-2A cannot reach the cloud application.',
        detail: 'Your previously imported SQLite snapshot can still be viewed locally. It is read-only and may be out of date.\\n\\n' + description,
        buttons: ['Open Local Data', 'Retry Connection', 'Cancel'],
        defaultId: 0, cancelId: 2
      }).then(async ({ response }) => {
        if (win.isDestroyed()) return
        if (response === 0) {
          try { await enforceLocalDataScope();showLocalSnapshot(win,getDatabaseDirectory,enforceLocalDataScope) }
          catch (error) { dialog.showErrorBox('Local data unavailable', error.message) }
        } else if (response === 1) { fallbackActive = false; win.loadURL(APP_URL) }
      }).catch(error => dialog.showErrorBox('Connection dialog error', error.message))
    }
  })
  win.loadURL(APP_URL)
}

app.whenReady().then(async () => {
  if(app.isPackaged && process.platform==='darwin')registerInstalledMacApp(process.resourcesPath)
  const refreshInterval=setInterval(()=>{
   if(net.isOnline()&&onlineSnapshotToken)
    refreshCloudSnapshot(onlineSnapshotToken).catch(()=>{})
  },5*60*1000)
  refreshInterval.unref?.()
  protocol.handle('app2a',async request=>{
    const url=new URL(request.url)
    if(url.hostname!=='local')return new Response('Not found',{status:404})
    if(url.pathname==='/api/market-rates')return marketRates(request.method)
    if(url.pathname==='/api/offline/auth'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      try{const raw=await request.text();if(raw.length>2048)return Response.json({error:'Request too large'},{status:413});const input=JSON.parse(raw);if(!desktopAuth)return Response.json({error:'Local account not ready'},{status:503});let data;if(input.action==='status')data=desktopAuth.status();else if(input.action==='login'){
        desktopAuth.logout();staffDirectory=null;clearOnlineSession()
        let networkUnavailable=false
        try{
          const response=await fetch(APP_URL+'/api/oms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',identifier:input.username,password:input.password,desktopEnrollment:true}),signal:AbortSignal.timeout(10000)})
          if(response.status===401||response.status===403){
            desktopAuth.forget(input.username)
            throw Error('Online credentials rejected or account unavailable')
          }
          if(!response.ok)throw Error('Cloud login temporarily unavailable')
          const verified=await response.json()
          if(!verified.ok||!verified.desktopUser)throw Error('Online enrollment response invalid')
          data=restrictedStaff(verified.desktopUser.role)
            ?desktopAuth.onlineOnly(input.username,verified.desktopUser)
            :desktopAuth.enroll(input.username,input.password,verified.desktopUser)
          const tokens={snapshotToken:verified.desktopSnapshotToken,syncToken:verified.desktopSyncToken}
          const cookie=response.headers.get('set-cookie')?.match(/(?:^|,\s*)(nizamia_backend_session=[A-Za-z0-9_.-]+);/)?.[1]
           if(!cookie&&restrictedStaff(data.user.role))throw Error('Could not establish the online workspace session.')
          if(cookie)onlineWebSession={id:data.user.id,cookie}
          if(data.user.role!=='admin'&&!restrictedStaff(data.user.role)){
            staffDirectory=privateFolder(privateFolder(baseDirectory(),'Team'),scopeKey(data.user))
            await initializeDatabase(staffDirectory)
          }
          {
           const fallback={snapshot:tokens.snapshotToken?{token:tokens.snapshotToken}:null,
            sync:tokens.syncToken?{token:tokens.syncToken,expiresAt:Date.now()+8*60*60*1000}:null}
           activateOnlineSession(data.user,cloudSessionStore?.save(data.user.id,tokens)||fallback)
          }
          if(onlineSnapshotToken){
            const token=onlineSnapshotToken
            setImmediate(()=>refreshCloudSnapshot(token).then(result=>{
              if(result.status==='updated')console.info('Cloud snapshot refreshed after online sign-in:',result.tables,'tables')
            }).catch(error=>{
              console.warn('Automatic cloud refresh skipped; local data preserved:',error.message)
              const owner=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed())
              if(owner&&onlineSnapshotToken===token)dialog.showMessageBox(owner,{type:'warning',title:'Cloud data not refreshed',
                message:'The app could not finish downloading cloud data.',
                detail:error.code==='SNAPSHOT_TIMEOUT'?error.message:error.message+' Retry with Connected → Refresh from Cloud.',
                buttons:['OK']}).catch(()=>{})
            }))
          }
        }catch(error){
          if(error.message==='Online credentials rejected or account unavailable'||error.message==='Online enrollment response invalid')throw error
          if(desktopAuth.isAuthenticated()){desktopAuth.logout();staffDirectory=null;clearOnlineSession();throw error}
          networkUnavailable=true
        }
        if(networkUnavailable){
          data=desktopAuth.login(input.username,input.password)
          if(restrictedStaff(data.user.role)){
            desktopAuth.logout()
            throw Error('This workspace requires an online sign-in.')
          }
          if(data.user.role!=='admin'){
            staffDirectory=privateFolder(privateFolder(baseDirectory(),'Team'),scopeKey(data.user))
            await initializeDatabase(staffDirectory)
          }
          activateOnlineSession(data.user,cloudSessionStore?.read(data.user.id))
        }
      }else if(input.action==='logout'){const user=desktopAuth.status().user;if(user)cloudSessionStore?.clear(user.id);clearOnlineSession();data=desktopAuth.logout();}else return Response.json({error:'Unknown action'},{status:400});rebuildMenu();return Response.json({data},{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({error:error.message},{status:401})}
    }
    if(url.pathname.startsWith('/api/')&&desktopAuth?.isAuthenticated()){
      const member=desktopAuth.status().user
      if(restrictedStaff(member.role)){
        const role=String(member.role).toLowerCase()
        const permits=staffActions[role][url.pathname]
        if(permits && request.method==='POST'){
          const session=onlineWebSession
          if(!session||session.id!==member.id)return Response.json({error:'Sign in online to use this workspace.'},{status:401})
          try{
            const body=await request.json()
            if(!permits.includes(body?.action))return Response.json({error:'Action is outside this workspace.'},{status:403})
            const response=await fetch(APP_URL+'/api/oms',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
              headers:{Cookie:session.cookie,'Content-Type':'application/json'},body:JSON.stringify(body)})
            const result=await response.json()
            if(onlineWebSession!==session)return Response.json({error:'Session changed.'},{status:403})
            return Response.json(result,{status:response.status,headers:{'Cache-Control':'no-store'}})
          }catch{return Response.json({error:'Workspace unavailable. Check your connection.'},{status:503})}
        }
        if(role!=='sample_room'||url.pathname!=='/api/offline/pdf')
          return Response.json({error:'Action is outside this workspace.'},{status:403})
      }
      if(member.role!=='admin' && !await require('./staffOperations.cjs').staffRequestAllowed(member,url.pathname,request))
        return Response.json({error:'This offline operation requires additional authorization.'},{status:403})
      try{await enforceLocalDataScope()}
      catch(error){return Response.json({error:error.message},{status:403})}
    }
    if(url.pathname==='/api/offline/refresh' && request.method==='POST'){
      if(!desktopAuth?.isAuthenticated()||!onlineSnapshotToken)return Response.json({error:'Sign in online to refresh.'},{status:401})
      try{return Response.json(await refreshCloudSnapshot(onlineSnapshotToken))}catch(error){return Response.json({error:error.message},{status:503})}
    }
    if(url.pathname==='/api/offline/version')return Response.json({version:app.getVersion(),platform:process.platform,pdf:'native',updates:'manual'})
    if(url.pathname==='/api/offline/pdf'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405})
      let pdfWindow=null
      try{
        const raw=await request.text()
        if(raw.length>4000000)return Response.json({error:'Report too large'},{status:413})
        const input=JSON.parse(raw)
        if(typeof input.html!=='string'||!input.html.startsWith('<html')||input.html.length>3000000)return Response.json({error:'Invalid report HTML'},{status:400})
        const filename=String(input.filename||'Nizamia Report').replace(/[^a-zA-Z0-9 _.-]/g,'').slice(0,100)||'Nizamia Report'
        pdfWindow=new BrowserWindow({show:false,width:1123,height:794,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true}})
        await pdfWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(input.html.replace(/<head[^>]*>/i,head=>head+'<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; style-src &apos;unsafe-inline&apos;; img-src data: https:; font-src data:">')))
        await pdfWindow.webContents.executeJavaScript('document.fonts.ready.then(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))')
        const pdf=await pdfWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true})
        const owner=BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows().find(w=>w!==pdfWindow)
        const choice=await dialog.showSaveDialog(owner,{title:'Save Nizamia Report PDF',defaultPath:filename.replace(/\.pdf$/i,'')+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]})
        if(choice.canceled||!choice.filePath)return Response.json({cancelled:true})
        fs.writeFileSync(choice.filePath,pdf,{flag:'w',mode:0o600})
        try{archivePdf(readSettings().workspaceRoot,filename,pdf)}catch(error){return Response.json({error:'Your selected PDF was saved. The NZOS archive copy failed: '+error.message},{status:500})}
        return Response.json({ok:true})
      }catch(error){return Response.json({error:'PDF generation failed: '+error.message},{status:500})}
      finally{if(pdfWindow&&!pdfWindow.isDestroyed())pdfWindow.destroy()}
    }
    if(['/api/offline/accounts','/api/offline/po-review','/api/offline/fulfillment','/api/offline/hr-attendance','/api/offline/notification-reads'].includes(url.pathname)){
      const review=url.pathname==='/api/offline/po-review'
      const tracking=url.pathname==='/api/offline/fulfillment'
      const hr=url.pathname==='/api/offline/hr-attendance'
      const notifications=url.pathname==='/api/offline/notification-reads'
      const actor=desktopAuth?.status().user
      if(!actor||(!review&&!tracking&&!notifications&&actor.role!=='admin')||!onlineWebSession||onlineWebSession.id!==actor.id)
        return Response.json({error:'Sign in online with the required permissions.'},{status:403})
      try{
        const body=request.method==='POST'?await request.json():null
        const action=body?.action||url.searchParams.get('action')
        const permitted=notifications?(request.method==='POST'?['notificationReads']:[]):hr?(request.method==='POST'?['hrAttendance']:[]):tracking?(request.method==='POST'?['readStoreReceipts','postStoreReceipt','readPoReceiving','postPoReceiving','readWorkOrderTracking','postWorkOrderMovement']:[]):review?(request.method==='GET'?['poApprovers','assignedPOReviews']:['savePurchaseOrder','readPOHistory','setPOStage','readPOPage','requestPOReview','approveAssignedPO']):request.method==='GET'?['accountList','accountRoles']:['accountRoleRights','accountSaveRights','accountDelete','accountHistory','accountCreate','accountPassword','accountRole','accountActive','accountRestriction']
        if(!['GET','POST'].includes(request.method)||!permitted.includes(action))
          return Response.json({error:'Unknown account request'},{status:400})
        const endpoint=new URL('/api/oms',APP_URL)
        if(!body)endpoint.searchParams.set('action',action)
        const session=onlineWebSession
        const result=await fetch(endpoint,{method:request.method,redirect:'error',signal:AbortSignal.timeout(15000),
          headers:{Cookie:session.cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
        const data=await result.json()
        if(onlineWebSession!==session)return Response.json({error:'Session changed'},{status:403})
        return Response.json(data,{status:result.status,headers:{'Cache-Control':'no-store'}})
      }catch{return Response.json({error:notifications?'Notification sync unavailable.':(tracking||hr)?'Register unavailable. Check your connection.':'Account service unavailable. Check your connection.'},{status:503})}
    }
    if(url.pathname==='/api/oms'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      try{const directory=getDatabaseDirectory();if(!directory)return Response.json({error:'Local database unavailable'},{status:503});return await require('./offlineOms.cjs').handleOfflineOms(directory,url,request,{
        saveCatalog:async input=>{
         const ownerId=productionSyncOwner()
         if(!ownerId)throw Error('Administrator access required')
         const records=require('./standaloneRecords.cjs')
         const {id}=await records.queueOperationalChange(directory,{input,ownerId,isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
         const table={costing:'costing_sheets',proforma:'proforma_invoices',meeting:'pp_meetings'}[input.kind]||input.kind
         if(input.kind==='costingAssignment'||input.action==='delete')return {id}
         return (await records.listCombinedRecords(directory,table)).find(row=>row.id===id)
        },
        queueParcelInvoice: input=>{
         const ownerId=productionSyncOwner()
         const {queueParcelInvoice}=require('./standaloneRecords.cjs')
         return queueParcelInvoice(directory,{...input,ownerId,isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        }
      })}catch(error){return Response.json({error:error.message},{status:400})}
    }
    // Local-only read bridge for the bundled original React interface.
    // Never expose arbitrary SQL, filesystem paths, or cloud credentials.
    // Read-only local edit inventory. These edits are NOT marked as cloud-synced.
    // Authenticated read-only draft queue. Identity is derived exclusively from
    // the locally authenticated user, never from a renderer-supplied query.
    if(url.pathname==='/api/offline/order-note'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const user=desktopAuth?.status().user
      if(!user || user.role!=='admin' && !user.permissions?.orders?.edit)return Response.json({error:'Orders edit access required'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>65536)return Response.json({error:'Order note is too large'},{status:413})
        const input=JSON.parse(raw)
        const directory=getDatabaseDirectory()
        if(!directory)return Response.json({error:'Local database unavailable'},{status:503})
        const {stageOrderNote}=require('./offlineDraftJournal.cjs')
        const data=await stageOrderNote({
          directory,recordId:input.orderId,notes:input.notes,expectedNotes:input.expectedNotes,
          session:{identity:user.id},authenticateSession:()=>desktopAuth.status().user===user
        })
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:409})}
    }
    if(url.pathname==='/api/offline/drafts'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      if(request.method!=='GET')return new Response('Method not allowed',{status:405})
      try{
        const directory=getDatabaseDirectory()
        const user=desktopAuth.status().user
        if(!directory||!user?.id)return Response.json({error:'Local session unavailable'},{status:503})
        const session={authenticated:true,identity:user.id}
        const drafts=await require('./offlineDraftJournal.cjs').listDrafts({
          directory,session,includeChanges:true,
          authenticateSession:async candidate=>desktopAuth.isAuthenticated()&&desktopAuth.status().user?.id===candidate.identity
        })
        return Response.json({data:drafts,error:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:'Could not read local drafts'},{status:500})}
    }
    if(url.pathname==='/api/offline/pending-status'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      if(request.method!=='GET')return new Response('Method not allowed',{status:405})
      try{
        const directory=getDatabaseDirectory()
        if(!directory)return Response.json({error:'Local database unavailable'},{status:503})
        const status=await require('./offlinePendingStatus.cjs').readPendingStatus(directory,desktopAuth.status().user?.id)
        return Response.json({data:{...status,refreshConflicts:lastSnapshot?.directory===directory?lastSnapshot.unresolved.length:0,cloudSync:onlineSyncSession&&onlineSyncSession.expiresAt<=Date.now()?{state:'sign-in-required'}:syncLoop.getStatus()},error:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:500})}
    }
    if(url.pathname==='/api/offline/records'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      if(request.method!=='GET')return new Response('Method not allowed',{status:405})
      const table=url.searchParams.get('table')
      const {listCombinedRecords}=require('./standaloneRecords.cjs')
      if(!table||!/^[a-z][a-z0-9_]{0,63}$/.test(table))return Response.json({error:'Unsupported table'},{status:400})
      try{
        const directory=getDatabaseDirectory()
        if(!directory)return Response.json({error:'Local database unavailable'},{status:503})
        const rows=await listCombinedRecords(directory,table)
        return Response.json({data:rows,error:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:500})}
    }
    if(url.pathname==='/api/offline/batch'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      try{
        const {createLocalRecordBatch}=require('./standaloneRecords.cjs')
        const raw=await request.text()
        if(Buffer.byteLength(raw)>1048576)return Response.json({error:'Batch too large'},{status:413})
        const input=JSON.parse(raw),directory=getDatabaseDirectory()
        if(!directory)return Response.json({error:'Local database unavailable'},{status:503})
        const result=await createLocalRecordBatch(directory,{table:input.table,rows:input.rows,ownerId:productionSyncOwner()})
        return Response.json({data:result,error:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({data:null,error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/upsert-batch'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      try{
        const {upsertLocalRecordBatch}=require('./standaloneRecords.cjs')
        const raw=await request.text()
        if(Buffer.byteLength(raw)>1048576)return Response.json({error:'Batch too large'},{status:413})
        const input=JSON.parse(raw),directory=getDatabaseDirectory()
        if(!directory)return Response.json({error:'Local database unavailable'},{status:503})
        return Response.json({data:await upsertLocalRecordBatch(directory,input),error:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({data:null,error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/mutate-batch'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      try{
        const {mutateLocalRecordBatch}=require('./standaloneRecords.cjs')
        const raw=await request.text()
        if(Buffer.byteLength(raw)>1048576)return Response.json({error:'Batch too large'},{status:413})
        const input=JSON.parse(raw),directory=getDatabaseDirectory()
        if(!directory)return Response.json({error:'Local database unavailable'},{status:503})
        const result=await mutateLocalRecordBatch(directory,{...input,ownerId:productionSyncOwner()})
        return Response.json({data:result,error:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({data:null,error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/order-copy'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for offline order copy'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>8192)return Response.json({error:'Too many destination orders'},{status:413})
        const {sourceId,targetIds,sections}=JSON.parse(raw)
        const {queueOrderCopy}=require('./standaloneRecords.cjs')
        const data=await queueOrderCopy(directory,{sourceId,targetIds,sections,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/order-removal'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for offline order removal'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>8192)return Response.json({error:'Too many orders selected'},{status:413})
        const {orderIds}=JSON.parse(raw)
        const {queueOrderRemoval}=require('./standaloneRecords.cjs')
        await queueOrderRemoval(directory,{orderIds,ownerId,isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/order-import'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for offline import'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>115000)return Response.json({error:'CSV import too large for offline sync'},{status:413})
        const {rows}=JSON.parse(raw)
        const {queueOrderImport}=require('./standaloneRecords.cjs')
        const data=await queueOrderImport(directory,{rows,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/order-general'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for order sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>115000)return Response.json({error:'General Info is too large for offline sync'},{status:413})
        const {orderId,cloneOrderId,fields}=JSON.parse(raw)
        const {queueOrderGeneral}=require('./standaloneRecords.cjs')
        const data=await queueOrderGeneral(directory,{orderId,cloneOrderId,fields,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/buyer'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for buyer sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>115000)return Response.json({error:'Buyer profile too large for offline sync'},{status:413})
        const {buyerId,fields,addresses,contacts}=JSON.parse(raw)
        const {queueBuyer}=require('./standaloneRecords.cjs')
        await queueBuyer(directory,{buyerId,fields,addresses,contacts,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/order-section'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for order section sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>115000)return Response.json({error:'Order section too large for offline sync'},{status:413})
        const {table,orderId,rows,enabled,notes,rule,finishing}=JSON.parse(raw)
        const {queueOrderSection}=require('./standaloneRecords.cjs')
        const data=await queueOrderSection(directory,{table,orderId,rows,enabled,notes,rule,finishing,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/bom'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for BOM sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>115000)return Response.json({error:'BOM too large for offline sync'},{status:413})
        const {orderId,rows}=JSON.parse(raw)
        const {queueBom}=require('./standaloneRecords.cjs')
        const data=await queueBom(directory,{orderId,rows,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/po-matrix'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for PO Matrix sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>115000)return Response.json({error:'PO Matrix too large for offline sync'},{status:413})
        const {queuePoMatrix}=require('./standaloneRecords.cjs')
        await queuePoMatrix(directory,{payload:JSON.parse(raw),ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/job-create'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for offline job sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>22000)return Response.json({error:'Too many orders for offline job sync'},{status:413})
        const {orderIds}=JSON.parse(raw)
        const {queueNewJob}=require('./standaloneRecords.cjs')
        const data=await queueNewJob(directory,{orderIds,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/private-download'){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405})
      const owner=productionSyncOwner(),directory=getDatabaseDirectory(),kind=url.searchParams.get('kind'),id=url.searchParams.get('id')
      if(!owner||!directory)return Response.json({error:'Sign in required'},{status:403})
      if(!['meeting','asset'].includes(kind)||!/^[a-f0-9-]{36}$/i.test(id||''))return Response.json({error:'Invalid attachment'},{status:400})
      try{
        const isCurrent=()=>owner===productionSyncOwner()&&directory===getDatabaseDirectory()
        const rows=await require('./standaloneRecords.cjs').listCombinedRecords(directory,kind==='asset'?'feature_assets':'pp_meetings')
        const bytes=await require('./privateDownload.cjs').privateDownload({directory,owner,kind,id,record:rows.find(row=>row.id===id),
         online:net.isOnline(),token:onlineSnapshotToken,origin:APP_URL,isCurrent})
        if(!isCurrent())throw Error('Sign-in changed.')
        return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store','Content-Disposition':'attachment'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/operational-record'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for production and shipping sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>95000)return Response.json({error:'Too much data for one offline operation'},{status:413})
        const {queueOperationalChange}=require('./standaloneRecords.cjs')
        const data=await queueOperationalChange(directory,{input:JSON.parse(raw),ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/purchasing-remove'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for purchasing sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>4096)return Response.json({error:'Purchasing request too large'},{status:413})
        const {table,id}=JSON.parse(raw)
        const {queuePurchasingRemoval}=require('./standaloneRecords.cjs')
        const data=await queuePurchasingRemoval(directory,{table,id,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/purchasing-create'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for offline purchasing sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>110000)return Response.json({error:'Document too large for offline sync'},{status:413})
        const {table,fields,lines,documentId}=JSON.parse(raw)
        const {queuePurchasingDocument}=require('./standaloneRecords.cjs')
        const data=await queuePurchasingDocument(directory,{table,fields,lines,documentId,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/sampling-parcels'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for Sampling and Parcels sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>800000)return Response.json({error:'Too much data selected'},{status:413})
        const {action,table,ids,rows}=JSON.parse(raw)
        const {queueArea3Records}=require('./standaloneRecords.cjs')
        const data=await queueArea3Records(directory,{action,table,ids,rows,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/parcel-create'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for offline parcel sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>110000)return Response.json({error:'Parcel too large for offline sync'},{status:413})
        const {items,customItems,addressId,contactId}=JSON.parse(raw)
        const {queueParcelCreate}=require('./standaloneRecords.cjs')
        const data=await queueParcelCreate(directory,{items,customItems,addressId,contactId,ownerId,
          isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/parcel-transition'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
      if(!ownerId||!directory)return Response.json({error:'Administrator access required for offline parcel sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>110000)return Response.json({error:'Request too large'},{status:413})
        const {id,status,deliveryDate,receivedBy,details}=JSON.parse(raw)
        const {queueParcelTransition}=require('./standaloneRecords.cjs')
        const data=await queueParcelTransition(directory,{id,status,deliveryDate,receivedBy,details,ownerId,
         isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/sample-stage'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      const ownerId=productionSyncOwner()
      if(!ownerId)return Response.json({error:'Administrator access required for offline sample stage sync'},{status:403})
      try{
        const raw=await request.text()
        if(Buffer.byteLength(raw)>4096)return Response.json({error:'Request too large'},{status:413})
        const {id,stage}=JSON.parse(raw),directory=getDatabaseDirectory()
        const {mutateLocalRecord}=require('./standaloneRecords.cjs')
        const data=await mutateLocalRecord(directory,{action:'update',table:'samples',id,fields:{stage},ownerId,sampleStage:true})
        return Response.json({data},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({error:error.message},{status:400})}
    }
    if(url.pathname==='/api/offline/mutate'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      try{
        const {mutateLocalRecord,TABLES}=require('./standaloneRecords.cjs')
        const raw=await request.text()
        if(Buffer.byteLength(raw)>300000)return Response.json({error:'Request too large'},{status:413})
        const input=JSON.parse(raw)
        if(!TABLES.has(input.table))return Response.json({error:'Unsupported table'},{status:400})
        if(!['create','update','delete'].includes(input.action))return Response.json({error:'Unsupported operation'},{status:400})
        const directory=getDatabaseDirectory()
        if(!directory)return Response.json({error:'Local database unavailable'},{status:503})
        const result=await mutateLocalRecord(directory,{action:input.action,table:input.table,id:input.id,fields:input.fields,ownerId:productionSyncOwner()})
        return Response.json({data:result,error:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({data:null,error:error.message},{status:400})}
    }
    const root=path.resolve(process.resourcesPath,'web')
    let relative
    try{relative=decodeURIComponent(url.pathname)}catch{return new Response('Bad request',{status:400})}
    const candidate=path.resolve(root,'.'+relative)
    if(candidate!==root&&!candidate.startsWith(root+path.sep))return new Response('Forbidden',{status:403})
    const target=fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(root,'index.html')
    return net.fetch(require('node:url').pathToFileURL(target).toString())
  })
  const maintenance = [
      { label: 'Back Up Local Database…', click: async () => {
        const owner=BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows()[0]
        try {
          const directory=getDatabaseDirectory()
          if(!directory)throw Error('Choose a database folder before backing up.')
          const filename='nizamia-app2a-local-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite'
          const destination=path.join(privateFolder(readSettings().workspaceRoot,'Backups'),filename)
          const {backupDatabaseToFile}=require('./desktopLocalBackup.cjs')
          const result=await backupDatabaseToFile({directory,destination})
          await dialog.showMessageBox(owner,{type:'info',title:'Local backup complete',message:'SQLite backup saved and verified',detail:'File: '+result.file+'\\nSHA-256: '+result.sha256+'\\n\\nThis backs up the local SQLite snapshot, not the Supabase cloud database.',buttons:['OK']})
        }catch(error){await dialog.showMessageBox(owner,{type:'warning',title:'Local backup failed',message:'The local backup was not completed',detail:error.message,buttons:['OK']})}
      } },
      { label: 'Restore Backup to a New Folder…', click: async () => {
        const owner=BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows()[0]
        try {
          const backups=privateFolder(readSettings().workspaceRoot,'Backups')
          const candidates=fs.readdirSync(backups,{withFileTypes:true})
            .filter(entry=>entry.isFile() && entry.name.endsWith('.sqlite'))
            .map(entry=>({file:path.join(backups,entry.name),time:fs.statSync(path.join(backups,entry.name)).mtimeMs}))
            .sort((a,b)=>b.time-a.time)
          let source=candidates[0]?.file
          if(source){
            const answer=await dialog.showMessageBox(owner,{type:'question',message:'Recover the newest backup?',detail:path.basename(source),buttons:['Recover This Copy','Choose Another…','Cancel'],defaultId:0,cancelId:2})
            if(answer.response===2)return
            if(answer.response===1)source=null
          }
          if(!source){
            const choice=await dialog.showOpenDialog(owner,{title:'Select an NZOS SQLite backup',defaultPath:backups,properties:['openFile'],filters:[{name:'SQLite database',extensions:['sqlite']}]})
            if(choice.canceled)return
            source=choice.filePaths[0]
          }
          const directory=fs.mkdtempSync(path.join(app.getPath('userData'),'Recovered Database-'))
          const {restoreDatabaseFromFile}=require('./desktopLocalBackup.cjs')
          const result=await restoreDatabaseFromFile({directory,source,separate:true})
          const answer=await dialog.showMessageBox(owner,{
            type:'info',title:'Verified database recovery',message:'The backup was restored to a separate folder.',
            detail:'The active database and its pending edits are still in their original folder. Recovered copy: '+result.file,
            buttons:['Show in Finder','Done']
          })
          if(answer.response===0)shell.showItemInFolder(result.file)
        }catch(error){await dialog.showMessageBox(owner,{type:'warning',title:'Backup recovery failed',message:error.message})}
      } },
      { label: 'Review Saved Offline Changes…', click: async () => {
        const parent=BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows()[0]
        try{
          const ownerId=productionSyncOwner(),directory=getDatabaseDirectory()
          if(!ownerId||!directory)throw Error('Sign in as an administrator to review saved changes.')
          const {reviewSavedChanges}=require('./standaloneRecords.cjs')
          const preview=await reviewSavedChanges(directory)
          if(!preview.operations){
            await dialog.showMessageBox(parent,{type:'info',message:'No saved changes eligible for upload',
              detail:preview.skipped+' items stayed local for review.'})
            return
          }
          const answer=await dialog.showMessageBox(parent,{type:'question',message:'Queue saved changes for Supabase?',
            detail:preview.operations+' operations and '+preview.linked+' linked history entries will be queued. '+preview.skipped+' items will stay local.',
            buttons:['Cancel','Queue Changes'],defaultId:0,cancelId:0})
          if(answer.response!==1)return
          await reviewSavedChanges(directory,{ownerId,approval:preview.approval,
            isCurrent:()=>productionSyncOwner()===ownerId&&getDatabaseDirectory()===directory})
          await dialog.showMessageBox(parent,{type:'info',message:'Saved changes queued',
            detail:'App-2A will upload them when the cloud connection is available.'})
        }catch(error){await dialog.showMessageBox(parent,{type:'warning',message:'Saved changes could not be queued',detail:error.message})}
      } },
      { label: 'Import Read-Only Snapshot…', click: () => importBackup(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], getDatabaseDirectory()) },
      { label: 'Verify Local Snapshot…', click: () => inspectSnapshot(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], getDatabaseDirectory()) },
      { label: 'Browse Local Data (Read Only)…', click: openLocalData }
  ]
  const update =
      { label: 'Check for App Updates…', click: async()=>{
        const {checkForDesktopRelease,downloadVerifiedInstaller}=require('./desktopUpdates.cjs')
        const owner=BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows()[0]
        try{
          const result=await checkForDesktopRelease({currentVersion:app.getVersion()})
          if(result.status==='newer'){
            const windows=process.platform==='win32'
            const asset=result.asset
            const detail='Installed: '+app.getVersion()+'\nAvailable: '+result.version+'\n\n'+(asset?'Verified installer available ('+Math.round(asset.size/1048576)+' MB).':'No SHA-256-verified installer for this computer is attached to this release.')
            const answer=await dialog.showMessageBox(owner,{type:'info',title:'Nizamia App-2A updates',message:'New desktop version available',detail,buttons:asset?[windows?'Download Windows Installer':'Download Verified DMG','Open Release Page','Later']:['Open Release Page','Later'],defaultId:0,cancelId:asset?2:1})
            if(asset&&answer.response===0){
              const target=await dialog.showSaveDialog(owner,{title:'Save Nizamia App-2A update',defaultPath:path.join(app.getPath('downloads'),asset.name),buttonLabel:'Download',filters:[{name:'NZOS Installer',extensions:[windows?'exe':'dmg']}]})
              if(target.canceled||!target.filePath)return
              const progress=new BrowserWindow({parent:owner,modal:true,width:410,height:170,resizable:false,minimizable:false,maximizable:false,title:'Downloading App Update',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}})
              progress.setMenuBarVisibility(false)
              progress.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="font:14px system-ui;padding:20px"><strong>Downloading verified update…</strong><p>Keep this window open. The downloaded installer will be checked before use.</p></body>'))
              try{
                await downloadVerifiedInstaller({asset,destination:target.filePath})
                progress.close()
                if(windows){
                  const answer=await dialog.showMessageBox(owner,{type:'info',title:'Install NZOS update',message:'Back up your database and open the Windows installer?',detail:'Save any open edits before continuing.',buttons:['Back Up and Install','Later'],defaultId:1,cancelId:1})
                  if(answer.response===0){
                    await require('./desktopUpdateBackup.cjs').backupDatabaseBeforeUpdate({directory:getDatabaseDirectory(),backupRoot:privateFolder(readSettings().workspaceRoot,'Backups')})
                    const error=await shell.openPath(target.filePath)
                    if(error)throw Error(error)
                    app.quit()
                  }
                  return
                }
                const ready=await dialog.showMessageBox(owner,{type:'info',title:'Update downloaded',message:'Installer downloaded and SHA-256 verified',detail:'File: '+target.filePath+'\\n\\nAutomatic installation requires a backup and may request manual permission on unsigned builds.',buttons:['Install and Restart','Open DMG Manually','Later'],defaultId:0,cancelId:2})
                if(ready.response===0){
                  const confirm=await dialog.showMessageBox(owner,{type:'warning',title:'Install verified update',message:'Back up local data, close App-2A and install version '+result.version+'?',detail:'Your existing application will be retained for rollback. Save any unfinished work first. Automatic installation works only from /Applications or ~/Applications when writable.',buttons:['Back Up and Install','Cancel'],defaultId:1,cancelId:1})
                  if(confirm.response!==0)return
                  const {backupDatabaseBeforeUpdate}=require('./desktopUpdateBackup.cjs')
                  const {stageMacUpdate}=require('./desktopUpdateLaunch.cjs')
                  const directory=getDatabaseDirectory()
                  if(!directory)throw Error('No local database folder configured')
                  const backup=await backupDatabaseBeforeUpdate({directory,backupRoot:privateFolder(readSettings().workspaceRoot,'Backups')})
                  await stageMacUpdate({appPath:path.resolve(process.resourcesPath,'..','..'),resourcesPath:process.resourcesPath,dmgPath:target.filePath,version:result.version,asset,userData:app.getPath('userData'),pid:process.pid})
                  await dialog.showMessageBox(owner,{type:'info',title:'Update started',message:'Verified backup saved; installation will begin when App-2A closes',detail:'Backup: '+backup.file+'\\n\\nThe previous application will be kept for rollback.',buttons:['Close App and Install']})
                  app.quit()
                }else if(ready.response===1){
                  const openError=await shell.openPath(target.filePath)
                  if(openError)throw Error(openError)
                }
              }catch(error){if(!progress.isDestroyed())progress.close();throw error}
            }else if(answer.response===(asset?1:0))await shell.openExternal(result.url)
          }else{
            const answer=await dialog.showMessageBox(owner,{type:'info',title:'Nizamia App-2A updates',message:result.status==='current'?'No newer published release':'No published desktop release yet',detail:'Installed: '+app.getVersion()+'\n\nTest builds from GitHub Actions are separate from published update releases.',buttons:['OK','View Test Builds'],defaultId:0,cancelId:0})
            if(answer.response===1)await shell.openExternal('https://github.com/shafayhsn/nizamia-app2A/actions/workflows/desktop-mac-intel.yml')
          }
        }catch(error){await dialog.showMessageBox(owner,{type:'warning',title:'Update check failed',message:'The update could not be downloaded or verified',detail:error.message+'\n\nYour installed app and local database have not been changed.',buttons:['OK']})}
      } }
  const destinations = [
    ['Orders','orders',[['Buyer Purchase Orders','/orders?tab=orders'],['Queues','/orders?tab=queues']]],
    ['Parcels','parcels',[['Ready for Dispatch','/parcels?tab=ready'],['Dispatched Parcels','/parcels?tab=dispatched']]],
    ['Shipments','shipping',[['Booking & Shipping','/shipping']]],
    ['Reports','reports',[['Active Orders Report','/reports?open=active'],['Production Formats','/reports?open=formats']]]
  ]
  const {can,desktopRole}=await import('./permissions.mjs')
  rebuildMenu=()=>{
    const user=desktopAuth?.status().user
    const admin=user?.role==='admin'
    const tools=maintenance.map(item=>({...item,click:()=>{
      if(desktopAuth?.status().user?.role==='admin')return item.click()
    }}))
    const submenu=[{role:'about'},update]
    if(user)submenu.push({label:'Open Downloads Folder',click:()=>shell.openPath(privateFolder(readSettings().workspaceRoot,'Downloads'))})
    if(admin)submenu.push({label:process.platform==='win32'?'Maintenance':'Mac Maintenance',submenu:tools})
    submenu.push({type:'separator'},{role:'quit'})
    const menus=destinations.filter(([,module])=>can(desktopRole(user),module)).map(([label,module,items])=>({label,submenu:items.map(([label,route])=>({label,click:()=>{
      if(!can(desktopRole(desktopAuth?.status().user),module))return
      const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('app2a://local/'))
      if(win){win.focus();win.webContents.executeJavaScript('window.dispatchEvent(new CustomEvent("nzos-navigate",{detail:'+JSON.stringify(route)+'}))')}
    }}))}))
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'NZOS',submenu},...menus,
      {label:'View',submenu:[{role:'reload'},{role:'togglefullscreen'}]},
      {label:'Window',submenu:[{role:'minimize'},{role:'close'}]}]))
  }
  rebuildMenu()
  ensureDesktop().catch(error => dialog.showErrorBox('Desktop startup', error.message))
  // Open the bundled original UI by default; the SQLite viewer remains in the menu.
  // Offline authentication and complete feature coverage still require integration.
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) ensureDesktop().catch(error => dialog.showErrorBox('Desktop startup', error.message)) })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
