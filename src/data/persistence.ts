/**
 * Whether this browser will keep a signed-out person's data.
 *
 * Signed out, everything lives in IndexedDB, and browsers are allowed to
 * clear that on their own: Safari does after seven days of browser use
 * without a visit (unless the site is on the Home Screen), and others under
 * storage pressure. `navigator.storage.persist()` asks the browser to exempt
 * this site. Chrome and Safari answer from their own heuristics without
 * asking the person; Firefox shows a prompt — which is why this is asked
 * right after a save, when the reason is obvious, and not on page load.
 */
export type Persistence = 'kept' | 'best-effort' | 'unknown'

const ASKED_KEY = 'vimetry.persistAsked'

export async function storagePersistence(): Promise<Persistence> {
  try {
    if (!navigator.storage?.persisted) return 'unknown'
    return (await navigator.storage.persisted()) ? 'kept' : 'best-effort'
  } catch {
    return 'unknown'
  }
}

export async function askToKeep(): Promise<Persistence> {
  try {
    if (!navigator.storage?.persist) return 'unknown'
    return (await navigator.storage.persist()) ? 'kept' : 'best-effort'
  } catch {
    return 'unknown'
  }
}

/** Once per browser, after the first thing worth keeping is saved. */
export async function askToKeepOnce(): Promise<void> {
  try {
    if (localStorage.getItem(ASKED_KEY)) return
    localStorage.setItem(ASKED_KEY, new Date().toISOString())
  } catch {
    // Storage blocked entirely: nothing to protect, and nothing to remember with.
    return
  }
  await askToKeep()
}
