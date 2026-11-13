'use strict'
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('localSnapshot', Object.freeze({
  personalNoteGet: (table, recordId) => ipcRenderer.invoke('nizamia-local-snapshot', 'note:get', { table, recordId }),
  personalNoteSave: (table, recordId, body) => ipcRenderer.invoke('nizamia-local-snapshot', 'note:save', { table, recordId, body }),
  reportPresetGet: table => ipcRenderer.invoke('nizamia-local-snapshot', 'preset:get', { table }),
  reportPresetSave: (table, layout) => ipcRenderer.invoke('nizamia-local-snapshot', 'preset:save', { table, layout }),
  reportPresetRemove: table => ipcRenderer.invoke('nizamia-local-snapshot', 'preset:remove', { table }),
  workspaceStatus: () => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:status', {}),
  workspaceLogin: passphrase => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:login', { passphrase }),
  workspaceLogout: () => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:logout', {}),
  workspacePreviewDrafts: (table, recordId) => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:previewDrafts', { table, recordId }),
  workspaceExportRecovery: () => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:exportRecovery', {}),
  workspaceStageDraft: (table, recordId, changes) => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:stageDraft', { table, recordId, changes }),
  workspaceDrafts: () => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:drafts', {}),
  workspaceCancelDraft: draftId => ipcRenderer.invoke('nizamia-local-snapshot', 'workspace:cancelDraft', { draftId }),
  exportCsv: (table, query, department, layout) => ipcRenderer.invoke('nizamia-local-snapshot', 'exportCsv', { table, query, department, layout }),
  filteredRows: (table, offset, query, department, layout) => ipcRenderer.invoke('nizamia-local-snapshot', 'filteredRows', { table, offset, query, department, layout }),
  relatedRows: orderId => ipcRenderer.invoke('nizamia-local-snapshot', 'relatedRows', { orderId }),
  moduleOverview: module => ipcRenderer.invoke('nizamia-local-snapshot', 'moduleOverview', { module }),
  summary: () => ipcRenderer.invoke('nizamia-local-snapshot', 'summary', {}),
  tables: () => ipcRenderer.invoke('nizamia-local-snapshot', 'tables', {}),
  rows: (table, offset) => ipcRenderer.invoke('nizamia-local-snapshot', 'rows', { table, offset })
}))
