// ON-site Sessions: offline helper (service worker).
// The page and code always come fresh from the server when there is internet ("network first"),
// so new uploads show up straight away. Without internet, the last copy saved here is used,
// which lets the site open on weak dorm Wi-Fi or offline. Database and YouTube requests are
// never touched. Change VERSION when you change this file.
const VERSION = "2026-11-03.1";
const SHELL = `onsite-shell-${VERSION}`;
const ASSETS = `onsite-assets-v1`;
const CORE = [
  "./", "index.html", "version.json", "manifest.webmanifest",
  "css/style.css", "css/fx.css",
  "js/config.js", "js/i18n.js", "js/i18n-plus.js", "js/api.js", "js/player.js", "js/qr.js", "js/fx.js", "js/plus.js", "js/invite.js", "js/live.js", "js/app.js", "js/update.js",
  "img/onsite-logo.png", "img/onsite-logo-192.png", "img/favicon.png", "img/life-vs-logic.png", "img/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // one by one, so a single missing file never breaks the install
    await Promise.all(CORE.map(async (u) => { try { const r = await fetch(u, { cache: "no-store" }); if (good(r, u)) await c.put(u, r); } catch {} }));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("onsite-shell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Some free hosts answer the first visit with an HTML "checking your browser" page;
// never save that in place of a script or stylesheet.
function good(r, url) {
  if (!r || !r.ok || r.type === "opaqueredirect") return false;
  const ct = r.headers.get("content-type") || "";
  if (/\.(js|css|json|webmanifest|png|jpe?g|svg|webp)(\?|$)/.test(url) && ct.includes("text/html")) return false;
  return true;
}
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: keep a copy (they never change)
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(cacheFirst(req, ASSETS));
    return;
  }
  if (url.origin !== location.origin) return;            // Supabase, YouTube, CDNs: straight to the network

  const isPage = req.mode === "navigate";
  const isCode = /\.(js|css|json|webmanifest)$/.test(url.pathname) || isPage;
  if (isCode) e.respondWith(networkFirst(req, isPage));
  else if (/\.(png|jpe?g|svg|webp|gif|ico)$/.test(url.pathname)) e.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req, isPage) {
  const c = await caches.open(SHELL);
  try {
    const r = await Promise.race([fetch(req, { cache: "no-store" }), timeout(isPage ? 6000 : 8000)]);
    if (good(r, req.url)) {
      const key = isPage ? "index.html" : stripV(req.url);
      c.put(key, r.clone());
    }
    return r;
  } catch {
    const hit = (isPage && (await c.match("index.html"))) || (await c.match(stripV(req.url))) || (await caches.match(req, { ignoreSearch: true }));
    return hit || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(ASSETS);
  const hit = await c.match(req, { ignoreSearch: true }) || await caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then((r) => { if (good(r, req.url)) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || new Response("", { status: 504 });
}
async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  try { const r = await fetch(req); if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }
  catch { return new Response("", { status: 504 }); }
}
// "js/app.js?v=2026-…" and "js/app.js" are the same file for the offline copy
function stripV(u) { const x = new URL(u); x.search = ""; return x.pathname.replace(/^.*?\/((css|js|img)\/.*|[^/]+)$/, "$1"); }
