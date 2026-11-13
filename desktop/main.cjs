'use strict'
const { app, BrowserWindow, shell, dialog, Menu } = require('electron')
const { chooseDatabaseFolder, showDatabaseLocation, getDatabaseDirectory } = require('./localDatabase.cjs')
const { importBackup } = require('./snapshotImport.cjs')

const APP_URL = 'https://app.nizamia.com'
const ALLOWED_ORIGIN = new URL(APP_URL).origin

function allowedNavigation(url) {
  try { return new URL(url).origin === ALLOWED_ORIGIN && new URL(url).protocol === 'https:' }
  catch { return false }
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
    if (!allowedNavigation(url)) {
      event.preventDefault()
      if (/^https:\/\//i.test(url)) shell.openExternal(url)
    }
  })
  win.webContents.on('will-attach-webview', event => event.preventDefault())
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      dialog.showMessageBox(win, {
        type: 'warning', title: 'Connection required',
        message: 'This first desktop prototype requires an internet connection.',
        detail: 'App-2A could not load. Please reconnect and use View → Reload.\n\n' + description,
        buttons: ['OK']
      })
    }
  })
  win.loadURL(APP_URL)
}

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: app.name, submenu: [{ role: 'about' }, { role: 'quit' }] }] : []),
    { label: 'Database', submenu: [
      { label: 'Choose Database Folder…', click: () => chooseDatabaseFolder(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]) },
      { label: 'Show Database Location', click: () => showDatabaseLocation(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]) },
      { label: 'Import Read-Only Snapshot…', click: () => importBackup(BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0], getDatabaseDirectory()) }
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
  ])
  Menu.setApplicationMenu(menu)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
