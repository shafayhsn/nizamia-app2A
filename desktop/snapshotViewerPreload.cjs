'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('localSnapshot', Object.freeze({
  moduleOverview: module => ipcRenderer.invoke('nizamia-local-snapshot', 'moduleOverview', { module }),
  summary: () => ipcRenderer.invoke('nizamia-local-snapshot', 'summary', {}),
  tables: () => ipcRenderer.invoke('nizamia-local-snapshot', 'tables', {}),
  rows: (table, offset) => ipcRenderer.invoke('nizamia-local-snapshot', 'rows', { table, offset })
}))
