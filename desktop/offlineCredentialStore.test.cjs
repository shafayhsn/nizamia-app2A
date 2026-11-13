'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createCredentialStore } = require('./offlineCredentialStore.cjs')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app2a-credentials-'))
const file = path.join(dir, 'credentials.bin')
const storage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'keychain',
  encryptString: value => Buffer.from('mock-encrypted:' + Buffer.from(value).toString('base64')),
  decryptString: value => JSON.parse(JSON.stringify(Buffer.from(value).toString())).startsWith('mock-encrypted:')
    ? Buffer.from(Buffer.from(value).toString().slice(15), 'base64').toString() : (() => { throw Error('Corrupt data') })()
}
try {
  const store = createCredentialStore({ safeStorage: storage, file })
  assert.equal(store.load(), null)
  const payload = { version: 1, verifier: { identity: 'operator_1' }, attempts: { failures: 0, lockedUntil: 0 } }
  store.save(payload)
  assert.deepEqual(store.load(), payload)
  assert.equal(fs.readFileSync(file, 'utf8').includes('operator_1'), false)
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.throws(() => createCredentialStore({ safeStorage: { ...storage, isEncryptionAvailable: () => false }, file }).load(), /unavailable/)
  assert.throws(() => createCredentialStore({ safeStorage: { ...storage, getSelectedStorageBackend: () => 'basic_text' }, file }).load(), /refused/)
  fs.writeFileSync(file + '.tmp', 'stale')
  assert.throws(() => store.save(payload), /already exists/)
  fs.unlinkSync(file + '.tmp')
  fs.writeFileSync(file, 'corrupt')
  assert.throws(() => store.load())
  process.stdout.write('CP-18 OS-encrypted credential container tests passed.\n')
} finally { fs.rmSync(dir, { recursive: true, force: true }) }
