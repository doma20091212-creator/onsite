// ON-site Sessions: offline helper (service worker).
// The page itself (and version.js) come fresh from the server when there is internet, so new
// uploads show up straight away. The code files carry their version in the address ("?v=…"):
// a copy already saved for that exact version opens instantly and is quietly re-checked in the
// background, which is what makes the site open fast on weak dorm Wi-Fi. Without internet the
// last saved copy is used. Database and YouTube requests are
// never touched. Change VERSION when you change this file.
const VERSION = "2026-11-13.1";
const SHELL = `onsite-shell-${VERSION}`;
const ASSETS = `onsite-assets-v1`;
const CORE = [
  "./", "index.html", "version.js", "manifest.webmanifest",
  "css/style.css", "css/fx.css",
  "js/config.js", "js/i18n.js", "js/i18n-plus.js", "js/api.js", "js/player.js", "js/qr.js", "js/fx.js", "js/feel.js", "js/plus.js", "js/invite.js", "js/extra.js", "js/live.js", "js/app.js", "js/update.js",
  "img/onsite-logo.png", "img/onsite-logo-192.png", "img/favicon.png", "img/life-vs-logic.png", "img/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // one by one, so a single missing file never breaks the install
    await Promise.all(CORE.map(async (u) => { try { const r = await fetch(u, { cache: "no-store" }); if (await good(r, u)) await c.put(u, r); } catch {} }));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("onsite-shell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

// InfinityFree sometimes answers with its "checking your browser" page (aes.js) or a
// 502 error page. Neither is ever saved, and when one comes back we use the saved copy.
async function good(r, url) {
  if (!r || !r.ok || r.type === "opaqueredirect") return false;
  const ct = r.headers.get("content-type") || "";
  if (/\.(js|css|json|webmanifest|png|jpe?g|svg|webp)(\?|$)/.test(url) && ct.includes("text/html")) return false;
  if (ct.includes("text/html")) {
    try { const t = await r.clone().text(); if (t.length < 4000 && /aes\.js/.test(t) && /toNumbers/.test(t)) return false; } catch {}
  }
  return true;
}
const isChallenge = async (r) => {
  try { if (!(r.headers.get("content-type") || "").includes("text/html")) return false; const t = await r.clone().text(); return t.length < 4000 && /aes\.js/.test(t); } catch { return false; }
};
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
  if (isCode && !isPage && url.searchParams.has("v")) e.respondWith(versioned(e, req));
  else if (isCode) e.respondWith(networkFirst(req, isPage));
  else if (/\.(png|jpe?g|svg|webp|gif|ico)$/.test(url.pathname)) e.respondWith(staleWhileRevalidate(req));
});

// A file asked for as "name?v=VERSION": the saved copy of that exact address is used at once.
// A few seconds later it is fetched again in the background, so a copy saved in the middle of
// an upload repairs itself by the next visit.
async function versioned(e, req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req.url);
  if (!hit) return networkFirst(req, false, c);
  e.waitUntil((async () => {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const r = await fetch(req.url, { cache: "no-cache" });       // "no-cache" = ask the server; unchanged files cost almost nothing
      if (await good(r, req.url)) { await c.put(req.url, r.clone()); await c.put(stripV(req.url), r); }
    } catch {}
  })());
  return hit;
}

async function networkFirst(req, isPage, exact) {
  const c = await caches.open(SHELL);
  const saved = async () => (isPage && (await c.match("index.html"))) || (await c.match(stripV(req.url))) || (await caches.match(req, { ignoreSearch: true }));
  try {
    const r = await Promise.race([fetch(req, { cache: "no-store" }), timeout(isPage ? 5000 : 8000)]);
    if (await good(r, req.url)) {
      c.put(isPage ? "index.html" : stripV(req.url), r.clone());
      if (exact) exact.put(req.url, r.clone());                    // remember this exact version too
      return r;
    }
    // Host is down (502/503…): keep the site working from the saved copy.
    if (r.status >= 500) return (await saved()) || r;
    // Bot-check page: a page load must see it (it sets the cookie and reloads);
    // a script or stylesheet can't use it, so the saved copy is better.
    if (!isPage && (await isChallenge(r))) return (await saved()) || r;
    return r;
  } catch {
    return (await saved()) || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(ASSETS);
  const hit = await c.match(req, { ignoreSearch: true }) || await caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then(async (r) => { if (await good(r, req.url)) c.put(req, r.clone()); return r; }).catch(() => null);
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
