'use strict'
// Main-process-only HTTPS client for server-issued offline authorization.
// No caller-controlled URLs, keys, identities or permissions are trusted.
function createOfflineAuthorizationClient({ endpoint, fetchImpl, maxResponseBytes = 8192 }) {
  const base = new URL(endpoint)
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash ||
      !/^\/api\/offline-authorization\/?$/.test(base.pathname))
    throw new Error('Pinned HTTPS authorization endpoint required')
  if (typeof fetchImpl !== 'function') throw new Error('Trusted network transport required')
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 512 || maxResponseBytes > 65536)
    throw new Error('Invalid response limit')
  async function request(kind, body, token) {
    if (!['enrollment','draft'].includes(kind) ||
        typeof token !== 'string' || token.length < 16 || token.length > 4096 ||
        !body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('Invalid authorization request')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetchImpl(base.toString(), {
        method:'POST', redirect:'error', cache:'no-store', credentials:'omit',
        headers:{ 'content-type':'application/json', 'authorization':'Bearer ' + token },
        body:JSON.stringify({kind, ...body}), signal:controller.signal
      })
      if (response.status !== 200) throw new Error('Server authorization denied')
      const length = Number(response.headers?.get?.('content-length') || 0)
      if (length > maxResponseBytes) throw new Error('Authorization response too large')
      const raw = await response.text()
      if (Buffer.byteLength(raw,'utf8') > maxResponseBytes) throw new Error('Authorization response too large')
      const data = JSON.parse(raw)
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
          !data.proof || typeof data.proof !== 'object' ||
          typeof data.proof.signature !== 'string' || !data.proof.claims)
        throw new Error('Malformed server authorization')
      return data.proof // MUST be signature-verified with the pinned public key by caller
    } finally { clearTimeout(timeout) }
  }
  return Object.freeze({
    enrollment:(nonce,token) => {
      if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) throw new Error('Invalid nonce')
      return request('enrollment',{nonce},token)
    },
    draft:(snapshotHash,permissions,token) => {
      if (typeof snapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(snapshotHash) ||
          !Array.isArray(permissions) || !permissions.length || permissions.length > 2 ||
          permissions.some(p=>!['offline:draft:orders','offline:draft:production_daily_entries'].includes(p)) ||
          new Set(permissions).size !== permissions.length) throw new Error('Invalid requested permissions')
      return request('draft',{snapshotHash,permissions},token)
    }
  })
}
module.exports = {createOfflineAuthorizationClient}
