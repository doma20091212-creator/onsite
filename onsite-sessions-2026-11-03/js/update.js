// Shows a "new version" bar when version.json changes while the site is open.
(function () {
  const current = window.ONSITE_VERSION;
  if (!current) return;
  let shown = false, last = 0;

  async function check() {
    if (shown || Date.now() - last < 60000) return; // at most once a minute
    last = Date.now();
    try {
      const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.version && j.version !== current) show();
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
})();
