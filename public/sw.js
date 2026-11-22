/*
  Vimetry's service worker: the app opens without a connection.

  What it caches is the app itself, never anyone's data:
  - the page (index.html)
  - its fingerprinted scripts and styles
  - the icons

  Supabase, OpenAI and fonts are other origins and pass straight through,
  untouched. Data stays where D16 put it: in the account (online-first), or,
  signed out, in this browser's IndexedDB, which needs no network anyway.

  - Pages: network first, so a deploy reaches people at once; the cached copy
    only when offline.
  - /assets/*: cache first. Vite fingerprints them, so a name only ever means
    one file.

  At build time (vite.config.ts):
  - __BUILD__ becomes the commit, which makes each deploy a new worker, so
    old page copies are retired
  - __ASSETS__ becomes the build's own file list, so screens loaded on demand
    are there offline too, not only the ones visited before going offline
*/
const BUILD = '__BUILD__'
const PRECACHE = '__ASSETS__'
const SHELL = `vimetry-shell-${BUILD}`
const ASSETS = 'vimetry-assets'
/** Old builds' fingerprinted files are kept a while (an open tab may still ask for one), then trimmed. */
const MAX_ASSETS = 150

const OFFLINE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vimetry — offline</title><style>body{margin:0;padding:2rem;font-family:system-ui,sans-serif;background:#f1ece1;color:#2b2721}
p{color:#6f6a60}</style></head><body><h1>You're offline</h1><p>Vimetry needs a connection to open the first time. Connect and try again.</p>
<h1 dir="rtl">אין חיבור לרשת</h1><p dir="rtl">כדי לפתוח את Vimetry בפעם הראשונה צריך חיבור. התחברו ונסו שוב.</p></body></html>`

self.addEventListener('install', (event) => {
  /*
    Saving the app for offline use is best effort, and never a reason not to
    install. It used to be all or nothing: one failed save (Chrome on Android
    answered "Unexpected internal error" from Cache.addAll, 2026-11-22)
    rejected the install, the new worker was thrown away, and the old one,
    with no reminder handling, stayed in charge. A reminder that arrives and
    is never shown is worse than an offline start that is missing a file.

    So each file is saved on its own, and a failure is skipped.
  */
  const keep = async (cacheName, requests) => {
    const cache = await caches.open(cacheName)
    await Promise.allSettled(requests.map((request) => cache.add(request)))
  }
  event.waitUntil(
    (async () => {
      try {
        const page = await fetch('/', { cache: 'no-cache' })
        if (!page.ok) return
        // The scripts and styles this page names, so the first offline start works.
        const html = await page.clone().text()
        const named = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
        // The full list when the build wrote one in; the page's own references otherwise.
        const assets = [...new Set([...named, ...(Array.isArray(PRECACHE) ? PRECACHE : [])])]
        await (await caches.open(SHELL)).put('/', page).catch(() => undefined)
        await keep(SHELL, ['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'])
        await keep(ASSETS, assets)
      } catch {
        // Offline, or storage refusing: the worker still installs.
      }
    })(),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('vimetry-shell-') && name !== SHELL) await caches.delete(name)
      }
      const assets = await caches.open(ASSETS)
      const keys = await assets.keys()
      for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await assets.delete(old)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  // Other origins (Supabase, OpenAI, fonts) and anything but a read: not ours to touch.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          // Every route is the same page (SPA); keep the newest copy for offline.
          if (fresh.ok) (await caches.open(SHELL)).put('/', fresh.clone())
          return fresh
        } catch {
          const cached = await (await caches.open(SHELL)).match('/', { ignoreVary: true })
          return cached ?? new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        }
      })(),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const assets = await caches.open(ASSETS)
        // ignoreVary: the server says Vary: Origin, and a module script is asked
        // for with an Origin header the copy made at install did not have. A
        // fingerprinted file is the same file whoever asks.
        const cached = await assets.match(request, { ignoreVary: true })
        if (cached) return cached
        const fresh = await fetch(request)
        if (fresh.ok) assets.put(request, fresh.clone())
        return fresh
      })(),
    )
    return
  }

  // Icons, the manifest, the favicon: the network, or the copy kept at install.
  event.respondWith(
    (async () => {
      try {
        return await fetch(request)
      } catch {
        return (await caches.match(request, { ignoreVary: true })) ?? Response.error()
      }
    })(),
  )
})

/*
  Reminders (docs/features/reminders.md). The server sends a message,
  encrypted to this browser, saying only what to show and where tapping it
  should lead. Anything malformed falls back to a plain "Vimetry" that opens
  Today, rather than to nothing: browsers punish a push that shows no
  notification.
*/
self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    message = {}
  }
  const text = (value, fallback) => (typeof value === 'string' && value.length < 300 ? value : fallback)
  // Only paths on this site: a message cannot send anyone elsewhere.
  const local = (value, fallback) => {
    const path = text(value, fallback)
    return path.startsWith('/') && !path.startsWith('//') ? path : fallback
  }
  const url = local(message.url, '/today')
  /*
    Buttons (meal-reminders.md): the usual meal, then "Something else".
    As many as this platform shows (Chrome: two; iPhone: none); a tap on
    the notification itself opens the quick sheet either way.
  */
  const limit = typeof Notification !== 'undefined' && Number.isInteger(Notification.maxActions) ? Notification.maxActions : 0
  const actions = (Array.isArray(message.actions) ? message.actions : [])
    .filter((a) => a && typeof a.action === 'string' && typeof a.title === 'string')
    .slice(0, limit)
    .map((a) => ({ action: a.action.slice(0, 20), title: a.title.slice(0, 60) }))
  const actionUrls = {}
  for (const a of actions) actionUrls[a.action] = local(message.actionUrls && message.actionUrls[a.action], url)
  event.waitUntil(
    self.registration.showNotification(text(message.title, 'Vimetry'), {
      body: text(message.body, ''),
      // One per kind: tonight's reminder replaces an unread one from last night.
      tag: text(message.tag, 'vimetry'),
      icon: '/icons/icon-192.png',
      actions,
      data: { url, actionUrls },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  // A button opens its own address (the usual meal, logged once); the notification itself, the sheet.
  const path = (event.action && data.actionUrls && data.actionUrls[event.action]) || data.url || '/today'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    (async () => {
      // An open window of the app is brought forward and taken there; otherwise a new one opens.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        if ('navigate' in client) await client.navigate(target).catch(() => undefined)
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})
