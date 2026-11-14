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
      try{const raw=await request.text();if(raw.length>2048)return Response.json({error:'Request too large'},{status:413});const input=JSON.parse(raw);if(!desktopAuth)return Response.json({error:'Local account not ready'},{status:503});let data;if(input.action==='status')data=desktopAuth.status();else if(input.action==='setup')data=desktopAuth.setup(input.username,input.password);else if(input.action==='login')data=desktopAuth.login(input.username,input.password);else if(input.action==='logout')data=desktopAuth.logout();else return Response.json({error:'Unknown action'},{status:400});return Response.json({data},{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({error:error.message},{status:401})}
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
      { label: 'Open Cloud App', click: createWindow }
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
