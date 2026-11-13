'use strict'
// Encrypted local credential container; no enrollment or login UI is enabled.
// Instantiate only in Electron main process after OS encryption is available.
// macOS Electron safeStorage uses the OS Keychain; refuse insecure fallbacks.
const fs = require('node:fs')
const path = require('node:path')
const MAX_BYTES = 64 * 1024
function createCredentialStore({ safeStorage, file }) {
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function' ||
      typeof safeStorage.encryptString !== 'function' ||
      typeof safeStorage.decryptString !== 'function' ||
      typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Invalid secure store configuration')
  function assertEncryption() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption unavailable')
    if (typeof safeStorage.getSelectedStorageBackend === 'function' &&
        safeStorage.getSelectedStorageBackend() === 'basic_text')
      throw new Error('Insecure credential encryption backend refused')
  }
  function load() {
    assertEncryption()
    if (!fs.existsSync(file)) return null
    const info = fs.lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_BYTES)
      throw new Error('Unsafe credential store file')
    const encrypted = fs.readFileSync(file)
    const payload = JSON.parse(safeStorage.decryptString(encrypted))
    if (!payload || payload.version !== 1 || !payload.verifier ||
        !payload.attempts || typeof payload !== 'object')
      throw new Error('Invalid credential store contents')
    return payload
  }
  function save(payload) {
    assertEncryption()
    if (!payload || payload.version !== 1 || !payload.verifier || !payload.attempts)
      throw new Error('Invalid credential payload')
    const directory = path.dirname(file)
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()))
      throw new Error('Unsafe credential store destination')
    const encrypted = safeStorage.encryptString(JSON.stringify(payload))
    if (!Buffer.isBuffer(encrypted) || encrypted.length > MAX_BYTES)
      throw new Error('Encrypted credential payload too large')
    const temporary = file + '.tmp'
    if (fs.existsSync(temporary)) throw new Error('Temporary credential file already exists')
    try {
      fs.writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 })
      fs.renameSync(temporary, file)
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  }
  return { load, save }
}
module.exports = { createCredentialStore }
