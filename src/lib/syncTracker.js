// Tracks Supabase REST mutations performed by this browser session.
const listeners = new Set()
let pending = 0, failed = false, lastSaved = null
export const syncSnapshot = () => ({pending,failed,lastSaved})
export const subscribeSync = fn => {listeners.add(fn);return ()=>listeners.delete(fn)}
const emit = () => listeners.forEach(fn=>fn(syncSnapshot()))
export function resetSyncError(){failed=false;emit()}
export async function trackedFetch(input,init={}) {
 const method = String(init?.method || 'GET').toUpperCase()
 const isWrite = ['POST','PATCH','PUT','DELETE'].includes(method) && !String(input).includes('/auth/v1/')
 if(isWrite){pending++;emit()}
 try {const response=await fetch(input,init);if(isWrite){if(!response.ok)failed=true;else lastSaved=new Date().toISOString()}return response}
 catch(err){if(isWrite)failed=true;throw err}
 finally{if(isWrite){pending=Math.max(0,pending-1);emit()}}
}
