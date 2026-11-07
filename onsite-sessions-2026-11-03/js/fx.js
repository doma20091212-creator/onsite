// ON-site Sessions: motion & feel.
// Page transitions, staggered entrances, count-ups, confetti, tilt cards, the gliding nav
// pill, celebrations and the always-moving background. Everything here switches itself off
// when the phone/computer asks for reduced motion, or when the member picks "Calm" in Account.
const FX = (() => {
  const mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const pref = () => { try { return localStorage.getItem("onsite.motion") || "full"; } catch { return "full"; } };
  const calm = () => mq.matches || pref() === "calm";
  const lowPower = (navigator.hardwareConcurrency || 4) <= 2 || !!(navigator.connection && navigator.connection.saveData);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  let lastPath = null, prevNav = null, enterTimer = 0;

  // ------------------------------------------------------------ ambient background
  // Slow neon light blobs + outlined "ghost" formulas drifting upward. Pure CSS transforms,
  // so it stays smooth on old phones; it pauses when the tab is hidden or a video is open.
  const GLYPHS = ["π", "∑", "Δ", "∫", "λ", "√x", "Aa", "ض", "H₂O", "F=ma", "x²", "∞", "DNA", "%", "≈", "Ω", "ع", "E=mc²"];
  function ambient() {
    document.body.classList.toggle("fx-calm", calm());
    if (document.querySelector(".fx-bg")) return;
    const bg = document.createElement("div");
    bg.className = "fx-bg"; bg.setAttribute("aria-hidden", "true");
    const n = lowPower ? 6 : 12;
    const floats = Array.from({ length: n }, (_, i) => {
      const g = GLYPHS[(i * 7) % GLYPHS.length];
      const x = Math.round(((i + 0.5) / n) * 100 + (Math.random() * 8 - 4));
      const dur = 26 + Math.round(Math.random() * 22), delay = Math.round(Math.random() * dur);
      const size = 22 + Math.round(Math.random() * 46), rot = Math.round(Math.random() * 40 - 20);
      const hue = ["var(--blue-edge)", "var(--green-edge)", "#B79BFF", "#5CE1FF"][i % 4];
      return `<span class="fx-float" style="--x:${x}%;--d:${dur}s;--delay:-${delay}s;--fs:${size}px;--rot:${rot}deg;--c:${hue}">${g}</span>`;
    }).join("");
    bg.innerHTML = `<span class="fx-blob b1"></span><span class="fx-blob b2"></span><span class="fx-blob b3"></span><span class="fx-dots"></span>${floats}`;
    document.body.prepend(bg);
    // gentle parallax with the mouse (desktop only)
    let raf = 0;
    window.addEventListener("pointermove", (e) => {
      if (calm() || !fine() || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        bg.style.setProperty("--px", ((e.clientX / innerWidth) - 0.5).toFixed(3));
        bg.style.setProperty("--py", ((e.clientY / innerHeight) - 0.5).toFixed(3));
      });
    }, { passive: true });
    document.addEventListener("visibilitychange", () => document.body.classList.toggle("fx-hidden", document.hidden));
  }

  // ------------------------------------------------------------ page transitions
  const DEPTH = { "": 0, subject: 1, watch: 2 };
  const depthOf = (p) => { const k = (p || "/").split("/").filter(Boolean)[0] || ""; return k in DEPTH ? DEPTH[k] : -1; };
  function direction(from, to) {
    const a = depthOf(from), b = depthOf(to);
    if (a < 0 || b < 0 || a === b) return "side";
    return b > a ? "fwd" : "back";
  }
  // Called before a new page replaces the old one: the old page slides away first.
  async function beforeRender(path) {
    if (lastPath === null || path === lastPath || calm()) return;
    const page = document.querySelector("#app .page");
    if (!page) return;
    page.classList.add("fx-leave", "fx-leave-" + direction(lastPath, path));
    await sleep(150);
  }
  function afterRender(path) {
    const changed = path !== lastPath, dir = lastPath === null ? "first" : direction(lastPath, path);
    lastPath = path;
    const app = document.getElementById("app");
    document.body.classList.toggle("fx-watching", depthOf(path) === 2);
    navGlide(changed);
    markTilt(app);
    if (!changed || calm()) { countUp(app, true); return; }
    app.classList.remove("fx-enter", "fx-fwd", "fx-back", "fx-side", "fx-first");
    void app.offsetWidth;                                          // restart the animations
    app.classList.add("fx-enter", "fx-" + dir);
    stagger(app);
    countUp(app);
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => app.classList.remove("fx-enter", "fx-fwd", "fx-back", "fx-side", "fx-first"), 1900);
  }

  // things that rise in one after another
  const GROUPS = [".stats > li", ".sticker-grid > *", ".mini-list > *", ".new-row > *", ".slist > li", ".mlist > li", ".acc > .acc-item",
    ".recent > li", ".prog-stats > li", ".subj-bars > li", ".badge-grid > *", ".lb-list > li", ".kpis > *", ".ins-grid > *",
    ".ptable tbody tr", ".acct > *", ".att-list > li", ".prog-grid > *", ".ann-list > li", ".playlist ol > li", ".live-list > *", ".lvl-card", ".ann-stack > *", ".prizes > *", ".inv-stats > li", ".inv-mine > li", ".inv-side > *"];
  function stagger(root) {
    GROUPS.forEach((sel) => root.querySelectorAll(sel).forEach((el, i) => {
      el.classList.add("fx-st"); el.style.setProperty("--i", Math.min(i, 14));
    }));
  }

  // numbers count up from 0: <b data-count="12" data-dec="1" data-suffix="%">
  function countUp(root, instant) {
    root.querySelectorAll("[data-count]").forEach((el) => {
      const to = +el.dataset.count || 0, dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || "";
      const f = new Intl.NumberFormat(I18N.lang === "ar" ? "ar-EG" : "en", { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (instant || calm() || !to) { el.textContent = f.format(to) + suf; return; }
      const t0 = performance.now(), dur = 900 + Math.min(600, to * 15);
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = f.format(Math.round(to * e * Math.pow(10, dec)) / Math.pow(10, dec)) + suf;
        if (k < 1 && el.isConnected) requestAnimationFrame(tick);
      };
      el.textContent = f.format(0) + suf;
      requestAnimationFrame(tick);
    });
  }

  // ------------------------------------------------------------ nav pill that glides between tabs
  function navGlide(changed) {
    const nav = document.querySelector(".mainnav"); if (!nav) return;
    const on = nav.querySelector("a.on");
    if (!on) { prevNav = null; return; }
    const g = document.createElement("span"); g.className = "nav-glide"; g.setAttribute("aria-hidden", "true");
    nav.prepend(g); nav.classList.add("has-glide");
    const r = { l: on.offsetLeft, t: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const put = (x) => { g.style.left = x.l + "px"; g.style.top = x.t + "px"; g.style.width = x.w + "px"; g.style.height = x.h + "px"; };
    if (changed && prevNav && !calm() && (prevNav.l !== r.l || prevNav.t !== r.t)) {
      g.style.transition = "none"; put(prevNav); void g.offsetWidth;
      g.style.transition = ""; requestAnimationFrame(() => put(r));
    } else put(r);
    prevNav = r;
  }

  // ------------------------------------------------------------ tilt cards (desktop)
  function markTilt(root) { root.querySelectorAll(".sticker, .continue, .badge.got, .lvl-card, .new-card, .prize, .inv-promo").forEach((el) => el.classList.add("tilt")); }
  let tiltEl = null;
  document.addEventListener("pointermove", (e) => {
    if (calm() || e.pointerType !== "mouse") return;
    const el = e.target.closest && e.target.closest(".tilt");
    if (tiltEl && tiltEl !== el) untilt(tiltEl);
    tiltEl = el; if (!el) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const max = el.classList.contains("continue") ? 3 : 7;
    el.classList.add("is-tilting");
    el.style.setProperty("--rx", ((0.5 - y) * max).toFixed(2) + "deg");
    el.style.setProperty("--ry", ((x - 0.5) * max).toFixed(2) + "deg");
    el.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    el.style.setProperty("--my", (y * 100).toFixed(1) + "%");
  }, { passive: true });
  function untilt(el) { el.classList.remove("is-tilting"); el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); }
  document.addEventListener("pointerleave", () => tiltEl && untilt(tiltEl), true);

  // ------------------------------------------------------------ ripples, star pops
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest(".btn, .op-chip-main, .chip, .tabs button, .pill-btn");
    if (!b || calm() || b.disabled) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
    const rp = document.createElement("span"); rp.className = "fx-ripple";
    rp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.append(rp); setTimeout(() => rp.remove(), 650);
  });
  document.addEventListener("change", (e) => {
    if (!e.target.matches || !e.target.matches('.rate-row input[name="stars"]') || calm()) return;
    const v = +e.target.value;
    e.target.closest(".rate-row").querySelectorAll("label").forEach((l) => {
      if (+l.dataset.i > v) return;
      l.classList.remove("fx-pop"); void l.offsetWidth; l.style.setProperty("--i", l.dataset.i); l.classList.add("fx-pop");
    });
    if (v === 5) confetti({ count: 50, spread: 50, power: 0.7, origin: originOf(e.target.closest(".rate-row")) });
  });
  const originOf = (el) => { if (!el) return { x: 0.5, y: 0.5 }; const r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }; };

  // ------------------------------------------------------------ confetti
  const COLORS = ["#5C93FF", "#8FE85A", "#FF7AD9", "#FFC94D", "#5CE1FF", "#B79BFF", "#FFFFFF"];
  function confetti({ count = 140, spread = 70, origin = { x: 0.5, y: 0.6 }, power = 1, angle = -90, colors = COLORS } = {}) {
    if (calm()) return;
    const c = document.createElement("canvas"), dpr = Math.min(2, devicePixelRatio || 1);
    c.className = "fx-confetti"; c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    document.body.append(c);
    const ctx = c.getContext("2d");
    const n = lowPower ? Math.round(count * 0.5) : count;
    const ps = Array.from({ length: n }, () => {
      const a = (angle + (Math.random() - 0.5) * spread) * Math.PI / 180, sp = (8 + Math.random() * 10) * power * dpr;
      return { x: origin.x * c.width, y: origin.y * c.height, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4, w: (6 + Math.random() * 6) * dpr, h: (3 + Math.random() * 5) * dpr,
        col: colors[(Math.random() * colors.length) | 0], shape: Math.random() < 0.3 ? 1 : 0, wob: Math.random() * 10 };
    });
    const t0 = performance.now();
    const frame = (now) => {
      ctx.clearRect(0, 0, c.width, c.height);
      let alive = 0;
      for (const p of ps) {
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32 * dpr; p.x += p.vx + Math.sin((now / 160) + p.wob) * 0.6 * dpr; p.y += p.vy; p.r += p.vr;
        if (p.y < c.height + 40) alive++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col;
        ctx.globalAlpha = Math.max(0, 1 - (now - t0) / 4200);
        if (p.shape) { ctx.beginPath(); ctx.arc(0, 0, p.h / 1.4, 0, 7); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
        ctx.restore();
      }
      if (alive && now - t0 < 4200) requestAnimationFrame(frame); else c.remove();
    };
    requestAnimationFrame(frame);
  }
  // presets
  function cheer(size = "small", origin) {
    if (size === "small") return confetti({ count: 90, spread: 60, origin: origin || { x: 0.5, y: 0.7 } });
    confetti({ count: 120, spread: 55, angle: -60, origin: { x: 0, y: 0.75 }, power: 1.2 });
    confetti({ count: 120, spread: 55, angle: -120, origin: { x: 1, y: 0.75 }, power: 1.2 });
    setTimeout(() => confetti({ count: 100, spread: 100, origin: { x: 0.5, y: 0.35 }, power: 0.8 }), 250);
  }
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

  // ------------------------------------------------------------ big celebration overlay
  // icon: "check" | an emoji/text badge glyph
  function celebrate({ title, sub = "", icon = "check", tone = "#8FE85A", size = "big", ms = 2300 } = {}) {
    document.querySelector(".fx-cele")?.remove();
    const el = document.createElement("div");
    el.className = "fx-cele"; el.setAttribute("role", "status"); el.style.setProperty("--tone", tone);
    const art = icon === "check"
      ? `<svg class="fx-check" viewBox="0 0 64 64" aria-hidden="true"><circle class="fx-check-c" cx="32" cy="32" r="28"/><path class="fx-check-p" d="M19 33.5l9 9 18-20"/></svg>`
      : `<span class="fx-cele-badge" aria-hidden="true">${icon}</span>`;
    el.innerHTML = `<div class="fx-cele-card"><span class="fx-cele-rings" aria-hidden="true"><i></i><i></i><i></i></span>${art}
      <h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`;
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add("on"));
    buzz([18, 40, 18]);
    cheer(size);
    const close = () => { el.classList.remove("on"); el.classList.add("off"); setTimeout(() => el.remove(), 380); };
    el.onclick = close;
    const tm = setTimeout(close, calm() ? 1600 : ms);
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { clearTimeout(tm); close(); document.removeEventListener("keydown", k); } });
    return el;
  }

  // ------------------------------------------------------------ skeleton screens
  const sk = (cls, extra = "") => `<span class="sk ${cls}" ${extra}></span>`;
  function skeleton(kind = "home") {
    const cards = (n, cls) => Array.from({ length: n }, () => `<span class="sk ${cls}"></span>`).join("");
    if (kind === "manage") return `<div class="sk-page" aria-busy="true" aria-label="${esc(t("loading"))}">${sk("sk-title")}${sk("sk-tabs")}
      <div class="sk-rows">${cards(5, "sk-row")}</div></div>`;
    if (kind === "list") return `<div class="sk-page" aria-busy="true">${sk("sk-title")}<div class="sk-rows">${cards(6, "sk-row")}</div></div>`;
    return `<div class="sk-page" aria-busy="true" aria-label="${esc(t("loading"))}">
      ${sk("sk-line sk-short")}${sk("sk-hero")}<div class="sk-pills">${cards(3, "sk-pill")}</div>
      ${sk("sk-line sk-label")}${sk("sk-continue")}
      ${sk("sk-line sk-label")}<div class="sk-grid">${cards(8, "sk-card")}</div></div>`;
  }
  function bootSkeleton() {
    return `<header class="topbar sk-top"><span class="sk sk-logo"></span><span class="sk sk-nav"></span><span class="sk sk-av"></span></header>
      <main class="page">${skeleton("home")}</main>`;
  }

  // ------------------------------------------------------------ smooth swaps (language, settings)
  function swap(fn) {
    if (!calm() && document.startViewTransition) {
      try { return document.startViewTransition(async () => { await fn(); }); } catch {}
    }
    const app = document.getElementById("app");
    const r = fn();
    if (!calm()) { app.classList.remove("fx-swap"); void app.offsetWidth; app.classList.add("fx-swap"); setTimeout(() => app.classList.remove("fx-swap"), 400); }
    return r;
  }

  // flash an element (new attendee, new row)
  function flash(el) { if (!el || calm()) return; el.classList.remove("fx-flash"); void el.offsetWidth; el.classList.add("fx-flash"); }
  function bump(el) { if (!el || calm()) return; el.classList.remove("fx-bump"); void el.offsetWidth; el.classList.add("fx-bump"); }

  function setMotion(v) {
    try { localStorage.setItem("onsite.motion", v); } catch {}
    document.body.classList.toggle("fx-calm", calm());
  }

  if (document.body) ambient(); else document.addEventListener("DOMContentLoaded", ambient);
  mq.addEventListener && mq.addEventListener("change", () => document.body.classList.toggle("fx-calm", calm()));

  return { calm, pref, setMotion, beforeRender, afterRender, countUp, confetti, cheer, celebrate, skeleton, bootSkeleton, swap, flash, bump, buzz, stagger };
})();
