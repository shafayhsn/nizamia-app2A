'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { backupDatabaseToFile, restoreDatabaseFromFile } = require('./desktopLocalBackup.cjs')

function privateFolder(parent, name) {
  const folder = path.join(parent, name)
  try { fs.mkdirSync(folder, {mode:0o700}) } catch (e) { if (e.code !== 'EEXIST') throw e }
  if (!fs.lstatSync(folder).isDirectory() || fs.realpathSync(folder) !== folder)
    throw Error('Choose a local folder without aliases: ' + folder)
  return folder
}
function timestamp() { return new Date().toISOString().replace(/[:.]/g,'-') }
async function prepareWorkspace(selected, previous, home, initialize) {
  const parent = fs.realpathSync(selected)
  if (parent !== home && !parent.startsWith(home + path.sep)) throw Error('Choose a folder in your home directory.')
  const root = path.basename(parent) === 'NZOS' ? parent : privateFolder(parent,'NZOS')
  const database = privateFolder(root,'Database')
  const backups = privateFolder(root,'Backups')
  for (const name of ['Downloads','App Assets','Source Code']) privateFolder(root,name)
  const file = path.join(database,'nizamia-app2a.sqlite')
  if (previous !== database && fs.existsSync(file)) throw Error('This NZOS folder already contains a database. Choose an empty location.')
  if (previous && previous !== database) {
    const copy = await backupDatabaseToFile({directory:previous,destination:path.join(backups,'Before migration '+timestamp()+'.sqlite')})
    await restoreDatabaseFromFile({directory:database,source:copy.file,separate:true})
  } else await initialize(database)
  return {workspaceRoot:root,databaseDirectory:database}
}
function archivePdf(root, filename, bytes) {
  const downloads = privateFolder(root,'Downloads')
  const name = path.basename(filename).replace(/[^\p{L}\p{N} ._-]/gu,'_').replace(/\.pdf$/i,'').slice(0,90)
  const categories = [['Purchase Orders',/purchase order|\bpo\b/i],['Work Orders',/work order|\bwo\b/i],['Plans',/plan|program/i]]
  const group = categories.find(([,rule])=>rule.test(name))?.[0] || 'Reports'
  const directory = privateFolder(downloads,group)
  const target = path.join(directory,(name||'Report')+' '+timestamp()+' '+crypto.randomUUID()+'.pdf')
  fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600})
  return target
}
module.exports = { prepareWorkspace, archivePdf, timestamp, privateFolder }
