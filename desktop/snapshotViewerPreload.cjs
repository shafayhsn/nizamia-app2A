'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('localSnapshot', Object.freeze({
  exportCsv: (table, query, department) => ipcRenderer.invoke('nizamia-local-snapshot', 'exportCsv', { table, query, department }),
  filteredRows: (table, offset, query, department) => ipcRenderer.invoke('nizamia-local-snapshot', 'filteredRows', { table, offset, query, department }),
  relatedRows: orderId => ipcRenderer.invoke('nizamia-local-snapshot', 'relatedRows', { orderId }),
  moduleOverview: module => ipcRenderer.invoke('nizamia-local-snapshot', 'moduleOverview', { module }),
  summary: () => ipcRenderer.invoke('nizamia-local-snapshot', 'summary', {}),
  tables: () => ipcRenderer.invoke('nizamia-local-snapshot', 'tables', {}),
  rows: (table, offset) => ipcRenderer.invoke('nizamia-local-snapshot', 'rows', { table, offset })
}))
