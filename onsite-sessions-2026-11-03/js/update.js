// Shows a "new version" bar when version.js changes while the site is open.
// (Loaded as a script, not fetch(): InfinityFree's bot check answers fetch() with its own page.)
(function () {
  const current = window.ONSITE_VERSION;
  if (!current) return;
  let shown = false, last = 0;

  async function check() {
    if (shown || Date.now() - last < 60000) return; // at most once a minute
    last = Date.now();
    try {
      const v = await new Promise((resolve) => {
        const s = document.createElement("script");
        window.ONSITE_SET_VERSION = (x) => resolve(x);        // version.js calls this
        s.src = "version.js?t=" + Date.now();
        s.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 8000);
        document.head.appendChild(s);
        s.onload = () => setTimeout(() => s.remove(), 0);
      });
      if (v && v !== current) {
        // remember it, so the next visit starts on the new version at once
        if (v > current) { try { localStorage.setItem("onsite.ver", v); } catch {} }
        show();
      }
    } catch {}
  }

  function show() {
    shown = true;
    const tt = (k, d) => (typeof t === "function" ? t(k) : d);
    const bar = document.createElement("div");
    bar.className = "update-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = `<span>${tt("newVersion", "A new version of the site is ready.")}</span>
      <button type="button" class="update-go">${tt("refreshNow", "Refresh")}</button>
      <button type="button" class="update-x" aria-label="${tt("later", "Later")}">×</button>`;
    bar.querySelector(".update-go").onclick = () => location.reload();
    bar.querySelector(".update-x").onclick = () => bar.remove();
    document.body.appendChild(bar);
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  window.addEventListener("focus", check);
  setInterval(check, 5 * 60 * 1000);
  setTimeout(check, 2500);          // and once shortly after opening
})();
