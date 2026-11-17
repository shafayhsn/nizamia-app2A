'use strict'
const path = require('node:path')
const { app, BrowserWindow, shell, dialog, Menu, protocol, net } = require('electron')
const { chooseDatabaseFolder, showDatabaseLocation, getDatabaseDirectory, initializeDatabase } = require('./localDatabase.cjs')
const { importBackup } = require('./snapshotImport.cjs')
const { inspectSnapshot } = require('./snapshotInspect.cjs')
const { showLocalSnapshot } = require('./snapshotViewer.cjs')
const fs = require('node:fs')
const {createLocalAuth}=require('./localDesktopAuth.cjs')
let desktopAuth
const { snapshotReady } = require('./snapshotStartup.cjs')

// Serve the bundled web SPA under a proper origin so BrowserRouter routes and
// local asset URLs work without an internet connection.
protocol.registerSchemesAsPrivileged([{scheme:'app2a',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])
const APP_URL = 'https://app.nizamia.com'
const ALLOWED_ORIGIN = new URL(APP_URL).origin

function allowedNavigation(url) {
  try { return new URL(url).origin === ALLOWED_ORIGIN && new URL(url).protocol === 'https:' }
  catch { return false }
}

function openLocalData() {
  try {
    const directory = getDatabaseDirectory()
    if (!directory || !fs.existsSync(path.join(directory, 'nizamia-app2a.sqlite')))
      throw new Error('Choose a database folder to initialize your standalone database.')
    showLocalSnapshot(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null, getDatabaseDirectory)
  } catch (error) { dialog.showErrorBox('Local SQLite viewer', error.message) }
}
async function startDesktop() {
  try {
    let directory=getDatabaseDirectory()
    if (!directory) {
      directory=path.join(app.getPath('userData'),'Standalone Database')
      fs.mkdirSync(directory,{recursive:true,mode:0o700})
      await initializeDatabase(directory)
      // Persist the default folder without prompting on every offline launch.
      require('./localDatabase.cjs').saveSettings({databaseDirectory:fs.realpathSync(directory)})
    } else if (!fs.existsSync(path.join(directory,'nizamia-app2a.sqlite'))) {
      await initializeDatabase(directory)
    }
    if (!await snapshotReady(directory)) throw new Error('Local SQLite database could not be verified')
    desktopAuth=createLocalAuth(app.getPath('userData'))
    if(fs.existsSync(path.join(process.resourcesPath,'web','index.html')))openBundledWebApp()
    else showLocalSnapshot(null,getDatabaseDirectory)
  } catch(error) {
    dialog.showErrorBox('Standalone startup failed',error.message+'\n\nChoose a database folder from the Database menu to recover. The cloud app will not open automatically.')
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
    title:'Nizamia App-2A',
    webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
  })
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  win.webContents.on('will-navigate',(event,url)=>{
    if(!url.startsWith('app2a://local/'))event.preventDefault()
  })
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
      }).then(({ response }) => {
        if (win.isDestroyed()) return
        if (response === 0) {
          try { showLocalSnapshot(win, getDatabaseDirectory) }
          catch (error) { dialog.showErrorBox('Local data unavailable', error.message) }
        } else if (response === 1) { fallbackActive = false; win.loadURL(APP_URL) }
      }).catch(error => dialog.showErrorBox('Connection dialog error', error.message))
    }
  })
  win.loadURL(APP_URL)
}

app.whenReady().then(() => {
  protocol.handle('app2a',async request=>{
    const url=new URL(request.url)
    if(url.hostname!=='local')return new Response('Not found',{status:404})
    if(url.pathname==='/api/offline/auth'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405})
      try{const raw=await request.text();if(raw.length>2048)return Response.json({error:'Request too large'},{status:413});const input=JSON.parse(raw);if(!desktopAuth)return Response.json({error:'Local account not ready'},{status:503});let data;if(input.action==='status')data=desktopAuth.status();else if(input.action==='login'){
        try{data=desktopAuth.login(input.username,input.password)}catch(localError){
          if(!String(localError.message).includes('First sign in online'))throw localError
          const response=await fetch(APP_URL+'/api/oms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',identifier:input.username,password:input.password,desktopEnrollment:true}),signal:AbortSignal.timeout(10000)})
          const verified=await response.json();if(!response.ok||!verified.ok||!verified.desktopUser)throw Error('Online sign-in required before offline access; check your connection or contact admin')
          data=desktopAuth.enroll(input.username,input.password,verified.desktopUser)
        }
      }else if(input.action==='logout')data=desktopAuth.logout();else return Response.json({error:'Unknown action'},{status:400});return Response.json({data},{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({error:error.message},{status:401})}
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
        await pdfWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(input.html))
        await pdfWindow.webContents.executeJavaScript('document.fonts.ready.then(()=>Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))))')
        const pdf=await pdfWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true})
        const owner=BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows().find(w=>w!==pdfWindow)
        const choice=await dialog.showSaveDialog(owner,{title:'Save Nizamia Report PDF',defaultPath:filename.replace(/\.pdf$/i,'')+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]})
        if(choice.canceled||!choice.filePath)return Response.json({cancelled:true})
        fs.writeFileSync(choice.filePath,pdf,{flag:'w'})
        return Response.json({ok:true})
      }catch(error){return Response.json({error:'PDF generation failed: '+error.message},{status:500})}
      finally{if(pdfWindow&&!pdfWindow.isDestroyed())pdfWindow.destroy()}
    }
    if(url.pathname==='/api/oms'){
      if(!desktopAuth?.isAuthenticated())return Response.json({error:'Local login required'},{status:401})
      try{const directory=getDatabaseDirectory();if(!directory)return Response.json({error:'Local database unavailable'},{status:503});return await require('./offlineOms.cjs').handleOfflineOms(directory,url,request)}catch(error){return Response.json({error:error.message},{status:400})}
    }
    // Local-only read bridge for the bundled original React interface.
    // Never expose arbitrary SQL, filesystem paths, or cloud credentials.
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
        const result=await createLocalRecordBatch(directory,{table:input.table,rows:input.rows})
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
        const result=await mutateLocalRecordBatch(directory,input)
        return Response.json({data:result,error:null},{headers:{'Cache-Control':'no-store'}})
      }catch(error){return Response.json({data:null,error:error.message},{status:400})}
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
        const result=await mutateLocalRecord(directory,{action:input.action,table:input.table,id:input.id,fields:input.fields})
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
  const menu = Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: app.name, submenu: [{ role: 'about' }, { role: 'quit' }] }] : []),
    { label: 'Database', submenu: [
      { label: 'Choose Database Folder…', click: () => chooseDatabaseFolder(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]) },
      { label: 'Show Database Location', click: () => showDatabaseLocation(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]) },
      { label: 'Import Read-Only Snapshot…', click: () => importBackup(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], getDatabaseDirectory()) },
      { label: 'Verify Local Snapshot…', click: () => inspectSnapshot(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], getDatabaseDirectory()) },
      { label: 'Browse Local Data (Read Only)…', click: openLocalData }
    ] },
    { label: 'App', submenu: [
      { label: 'Open Offline Desktop', click: openLocalData },
      { label: 'Open App-2A Interface', click: openBundledWebApp },
      { label: 'Open Cloud App', click: createWindow },
      { type:'separator' },
      { label: 'Check for App Updates…', click: async()=>{
        const {checkForDesktopRelease,downloadVerifiedInstaller}=require('./desktopUpdates.cjs')
        const owner=BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows()[0]
        try{
          const result=await checkForDesktopRelease({currentVersion:app.getVersion()})
          if(result.status==='newer'){
            const asset=result.asset
            const detail='Installed: '+app.getVersion()+'\nAvailable: '+result.version+'\n\n'+(asset?'Verified installer available ('+Math.round(asset.size/1048576)+' MB).':'No SHA-256-verified macOS installer is attached to this release.')
            const answer=await dialog.showMessageBox(owner,{type:'info',title:'Nizamia App-2A updates',message:'New desktop version available',detail,buttons:asset?['Download Verified DMG','Open Release Page','Later']:['Open Release Page','Later'],defaultId:0,cancelId:asset?2:1})
            if(asset&&answer.response===0){
              const target=await dialog.showSaveDialog(owner,{title:'Save Nizamia App-2A update',defaultPath:path.join(app.getPath('downloads'),asset.name),buttonLabel:'Download',filters:[{name:'Mac Installer',extensions:['dmg']}]})
              if(target.canceled||!target.filePath)return
              const progress=new BrowserWindow({parent:owner,modal:true,width:410,height:170,resizable:false,minimizable:false,maximizable:false,title:'Downloading App Update',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}})
              progress.setMenuBarVisibility(false)
              progress.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="font:14px system-ui;padding:20px"><strong>Downloading verified update…</strong><p>Keep this window open. The downloaded installer will be checked before use.</p></body>'))
              try{
                await downloadVerifiedInstaller({asset,destination:target.filePath})
                progress.close()
                const ready=await dialog.showMessageBox(owner,{type:'info',title:'Update downloaded',message:'Installer downloaded and SHA-256 verified',detail:'File: '+target.filePath+'\\n\\nAutomatic installation requires a backup and may request manual permission on unsigned builds.',buttons:['Install and Restart','Open DMG Manually','Later'],defaultId:0,cancelId:2})
                if(ready.response===0){
                  const confirm=await dialog.showMessageBox(owner,{type:'warning',title:'Install verified update',message:'Back up local data, close App-2A and install version '+result.version+'?',detail:'Your existing application will be retained for rollback. Save any unfinished work first. Automatic installation works only from /Applications or ~/Applications when writable.',buttons:['Back Up and Install','Cancel'],defaultId:1,cancelId:1})
                  if(confirm.response!==0)return
                  const {backupDatabaseBeforeUpdate}=require('./desktopUpdateBackup.cjs')
                  const {stageMacUpdate}=require('./desktopUpdateLaunch.cjs')
                  const directory=getDatabaseDirectory()
                  if(!directory)throw Error('No local database folder configured')
                  const backup=backupDatabaseBeforeUpdate({directory,backupRoot:path.join(app.getPath('userData'),'Pre-Update Backups')})
                  await stageMacUpdate({appPath:app.getAppPath().replace(/\\/Contents\\/Resources\\/app\\.asar(?:\\/.*)?$/,''),resourcesPath:process.resourcesPath,dmgPath:target.filePath,version:result.version,asset,userData:app.getPath('userData'),pid:process.pid})
                  await dialog.showMessageBox(owner,{type:'info',title:'Update started',message:'Verified backup saved; installation will begin when App-2A closes',detail:'Backup: '+backup.file+'\\n\\nThe previous application will be kept for rollback.',buttons:['Close App and Install']})
                  app.quit()
                }else if(ready.response===1){
                  const openError=await shell.openPath(target.filePath)
                  if(openError)throw Error(openError)
                }
              }catch(error){progress.close();throw error}
            }else if(answer.response===(asset?1:0))await shell.openExternal(result.url)
          }else{
            const answer=await dialog.showMessageBox(owner,{type:'info',title:'Nizamia App-2A updates',message:result.status==='current'?'No newer published release':'No published desktop release yet',detail:'Installed: '+app.getVersion()+'\n\nTest builds from GitHub Actions are separate from published update releases.',buttons:['OK','View Test Builds'],defaultId:0,cancelId:0})
            if(answer.response===1)await shell.openExternal('https://github.com/shafayhsn/nizamia-app2A/actions/workflows/desktop-mac-intel.yml')
          }
        }catch(error){await dialog.showMessageBox(owner,{type:'warning',title:'Update check failed',message:'The update could not be downloaded or verified',detail:error.message+'\n\nYour installed app and local database have not been changed.',buttons:['OK']})}
      } }
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
  ])
  Menu.setApplicationMenu(menu)
  startDesktop().catch(error => dialog.showErrorBox('Desktop startup', error.message))
  // Open the bundled original UI by default; the SQLite viewer remains in the menu.
  // Offline authentication and complete feature coverage still require integration.
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) startDesktop().catch(error => dialog.showErrorBox('Desktop startup', error.message)) })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
