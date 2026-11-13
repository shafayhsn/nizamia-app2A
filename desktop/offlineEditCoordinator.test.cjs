'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const initSqlJs = require('sql.js')
const { createTrustedDraftGrant, stageTrustedRecordEdit } = require('./offlineEditCoordinator.cjs')
const { listDrafts } = require('./offlineDraftJournal.cjs')
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app2a-edit-'))
  try {
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
    const db = new SQL.Database()
    db.run('CREATE TABLE snapshot_rows (table_name TEXT, row_index INTEGER, row_json TEXT)')
    db.run('CREATE TABLE snapshot_manifest (table_name TEXT, row_count INTEGER)')
    db.run('INSERT INTO snapshot_manifest VALUES (?,?)', ['orders',1])
    db.run('INSERT INTO snapshot_rows VALUES (?,?,?)', ['orders',0,JSON.stringify({id:'o1',notes:'Original',remarks:'Before'})])
    fs.writeFileSync(path.join(directory,'nizamia-app2a.sqlite'),Buffer.from(db.export()))
    db.close()
    const session = { authenticated:true, identity:'owner', verifiedIdentity:'owner', permissions:['offline:draft:orders'] }
    const grantArgs = { directory, table:'orders', identity:'owner', permissions:session.permissions, verifiedAuthorization:true }
    await assert.rejects(createTrustedDraftGrant({ ...grantArgs, verifiedAuthorization:false }),/Independent/)
    const grant = await createTrustedDraftGrant(grantArgs)
    await assert.rejects(stageTrustedRecordEdit({ directory, table:'orders', recordId:'o1', changes:{notes:'New'},session,grant,authenticateEvidence:async()=>false }),/Trusted/)
    const result = await stageTrustedRecordEdit({ directory, table:'orders', recordId:'o1', changes:{notes:'New'},session,grant,authenticateEvidence:async()=>true })
    assert.equal(result.state,'pending')
    const drafts = await listDrafts({directory,session,authenticateSession:async()=>true})
    assert.equal(drafts.length,1)
    assert.equal(drafts[0].recordId,'o1')
    await assert.rejects(stageTrustedRecordEdit({directory,table:'orders',recordId:'o1',changes:{notes:'Duplicate'},session,grant,authenticateEvidence:async()=>true}),/already changes/)
    await assert.rejects(stageTrustedRecordEdit({directory,table:'orders',recordId:'o1',changes:{price:'100'},session,grant,authenticateEvidence:async()=>true}),/approved/)
    const after = new SQL.Database(fs.readFileSync(path.join(directory,'nizamia-app2a.sqlite')))
    assert.equal(JSON.parse(after.exec('SELECT row_json FROM snapshot_rows')[0].values[0][0]).notes,'Original')
    after.close()
    process.stdout.write('Trusted offline editing integration tests passed.\n')
  } finally { fs.rmSync(directory,{recursive:true,force:true}) }
}
main().catch(e=>{console.error(e);process.exitCode=1})
