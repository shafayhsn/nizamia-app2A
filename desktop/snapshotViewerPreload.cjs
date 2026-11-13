'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('localSnapshot', Object.freeze({
  tables: () => ipcRenderer.invoke('nizamia-local-snapshot', 'tables', {}),
  rows: (table, offset) => ipcRenderer.invoke('nizamia-local-snapshot', 'rows', { table, offset })
}))
