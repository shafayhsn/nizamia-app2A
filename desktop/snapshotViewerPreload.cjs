'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('localSnapshot', Object.freeze({
  workspaceStatus: () => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:status', {}),
  workspaceLogin: passphrase => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:login', { passphrase }),
  workspaceLogout: () => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:logout', {}),
  workspacePreviewDrafts: (table, recordId) => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:previewDrafts', { table, recordId }),
  workspaceExportRecovery: () => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:exportRecovery', {}),
  workspaceDrafts: () => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:drafts', {}),
  workspaceCancelDraft: draftId => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:cancelDraft', { draftId }),
  exportCsv: (table, query, department) => ipcRenderer.invoke('nizamia-local-snapshot', 'exportCsv', { table, query, department }),
  filteredRows: (table, offset, query, department) => ipcRenderer.invoke('nizamia-local-snapshot', 'filteredRows', { table, offset, query, department }),
  relatedRows: orderId => ipcRenderer.invoke('nizamia-local-snapshot', 'relatedRows', { orderId }),
  moduleOverview: module => ipcRenderer.invoke('nizamia-local-snapshot', 'moduleOverview', { module }),
  summary: () => ipcRenderer.invoke('nizamia-local-snapshot', 'summary', {}),
  tables: () => ipcRenderer.invoke('nizamia-local-snapshot', 'tables', {}),
  rows: (table, offset) => ipcRenderer.invoke('nizamia-local-snapshot', 'rows', { table, offset })
}))
