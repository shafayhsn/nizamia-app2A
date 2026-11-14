'use strict'
const path = require('node:path')
const { app, BrowserWindow, shell, dialog, Menu, protocol, net } = require('electron')
const { chooseDatabaseFolder, showDatabaseLocation, getDatabaseDirectory, initializeDatabase } = require('./localDatabase.cjs')
const { importBackup } = require('./snapshotImport.cjs')
const { inspectSnapshot } = require('./snapshotInspect.cjs')
const { showLocalSnapshot } = require('./snapshotViewer.cjs')
const fs = require('node:fs')
const { snapshotReady } = require('./snapshotStartup.cjs')

// Serve the bundled web SPA under a proper origin so BrowserRouter routes and\n// local asset URLs work without an internet connection.\nprotocol.registerSchemesAsPrivileged([{scheme:'app2a',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])\nconst APP_URL = 'https://app.nizamia.com'
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
    showLocalSnapshot(null,getDatabaseDirectory)
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
    title:'Nizamia App-2A — Original Interface (Preview)',
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
  protocol.handle('app2a',request=>{
    const url=new URL(request.url)
    if(url.hostname!=='local')return new Response('Not found',{status:404})
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
      { label: 'Open Original Web Interface (Preview)', click: openBundledWebApp },
      { label: 'Open Cloud App', click: createWindow }
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
  ])
  Menu.setApplicationMenu(menu)
  startDesktop().catch(error => dialog.showErrorBox('Desktop startup', error.message))
  // Local records remain accessible without waiting for a cloud timeout.
  // Opening the viewer never grants editing or cloud synchronization rights.
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) startDesktop().catch(error => dialog.showErrorBox('Desktop startup', error.message)) })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
