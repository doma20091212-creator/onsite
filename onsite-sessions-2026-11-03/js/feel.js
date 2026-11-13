// ON-site Sessions: premium feel.
//  • Magnetic elements: buttons, chips and cards lean toward the cursor, hang on a moment as
//    it leaves ("sticky"), then let go with a springy snap and a small splash.
//  • A soft light that follows the cursor: on the border of the card under it, and far in
//    the background.
//  • Shared-element page morphs: a subject card grows into its page, a session thumbnail
//    grows into the player (browsers with View Transitions; others keep the slide).
//  • Sections below the fold rise in as you scroll; big headings come in word by word.
//  • Touch: cards press in and spring back.
// All of it is off in Calm mode / reduced motion, and the cursor effects only run with a mouse.
const FEEL = (() => {
  const calm = () => FX.calm();
  const lite = () => FX.lite();     // slow device: keep the feel, drop the expensive extras
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const BLUE = "#8DB8FF";

  // ------------------------------------------------------------ splash
  function layer() {
    let l = document.querySelector(".fx-splash");
    if (!l) { l = document.createElement("div"); l.className = "fx-splash"; l.setAttribute("aria-hidden", "true"); document.body.append(l); }
    return l;
  }
  let lastSplash = 0;
  // a ring plus a few droplets thrown in the direction the cursor left
  function splash(x, y, dx = 0, dy = -1, { color = BLUE, drops = 5, size = 1 } = {}) {
    const now = performance.now();
    if (calm() || now - lastSplash < 150 || document.hidden) return;
    lastSplash = now;
    const L = layer();
    const ring = document.createElement("i");
    ring.className = "fx-ring"; ring.style.cssText = `left:${x}px;top:${y}px;--c:${color};--s:${size}`;
    L.append(ring); setTimeout(() => ring.remove(), 700);
    const base = Math.atan2(dy, dx);
    if (lite()) drops = 0;
    for (let i = 0; i < drops; i++) {
      const a = base + (Math.random() - 0.5) * 1.5, d = (12 + Math.random() * 20) * size, s = 3 + Math.random() * 3;
      const dr = document.createElement("i");
      dr.className = "fx-drop";
      dr.style.cssText = `left:${x}px;top:${y}px;--c:${color};--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;animation-delay:${(Math.random() * 50) | 0}ms`;
      L.append(dr); setTimeout(() => dr.remove(), 760);
    }
  }

  // ------------------------------------------------------------ magnetic + sticky elements
  const MAG = ".btn, .pill-btn, .icon-btn, .chip, .tabs button, .mainnav a, .avatar, .brand, .ts-chip, .srch-sub, .seg button, .ann-x";
  const CARD = ".tilt, .srow, .pl, .mini";
  const items = new Map();          // element -> spring state
  let px = 0, py = 0, raf = 0, lastT = 0, moved = null;

  function pick(t) {
    if (!t || !t.closest) return null;
    const b = t.closest(MAG);
    if (b) return b.disabled || b.matches(".mainnav a.on, .rv") || b.closest(".op, .present") ? null : b;
    const c = t.closest(CARD);
    return c && !c.matches(".rv") ? c : null;
  }
  function add(el) {
    const btn = el.matches(MAG);
    items.set(el, { el, btn, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, held: true, t0: performance.now(), margin: btn ? 18 : 12, k: 0 });
    el.classList.add("is-mag");
  }
  function update(it) {
    if (!it.held) return;
    const el = it.el;
    if (!el.isConnected) { items.delete(el); return; }
    const r = el.getBoundingClientRect();
    const hw = r.width / 2, hh = r.height / 2, cx = r.left - it.x + hw, cy = r.top - it.y + hh;
    const dx = px - cx, dy = py - cy;
    const out = Math.hypot(Math.max(0, Math.abs(dx) - hw), Math.max(0, Math.abs(dy) - hh));
    if (out > it.margin) return release(it, cx, cy, hw, hh);
    // inside: lean toward the cursor; in the margin just past the edge: stretch after it
    const k = (it.k = out / it.margin), pull = 1 + 0.3 * k;
    const maxX = it.btn ? Math.min(9, hw * 0.28) : 3.5, maxY = it.btn ? Math.min(6, hh * 0.3) : 3.5;
    it.tx = clamp(dx / hw, -1, 1) * maxX * pull;
    it.ty = clamp(dy / hh, -1, 1) * maxY * pull;
    it.ex = dx; it.ey = dy;
    if (it.btn) {                       // the glow inside primary buttons follows the cursor
      el.style.setProperty("--bx", clamp(((px - (cx - hw)) / r.width) * 100, 0, 100).toFixed(1) + "%");
      el.style.setProperty("--by", clamp(((py - (cy - hh)) / r.height) * 100, 0, 100).toFixed(1) + "%");
    }
  }
  function release(it, cx, cy, hw, hh, quiet) {
    it.held = false; it.tx = it.ty = 0; it.k = 0;
    const el = it.el;
    el.classList.remove("is-mag");
    el.style.removeProperty("--bx"); el.style.removeProperty("--by");
    if (quiet || performance.now() - it.t0 < 170 || !el.isConnected) return;
    // splash where the cursor crossed the edge
    const ex = clamp(px, cx - hw, cx + hw) + it.x, ey = clamp(py, cy - hh, cy + hh) + it.y;
    const c = getComputedStyle(el).getPropertyValue("--c").trim();
    if (it.btn) splash(ex, ey, it.ex || 0, it.ey || -1, { color: el.matches(".primary, .on, [aria-pressed='true']") ? BLUE : "#C9D6F2", drops: 4, size: 0.9 });
    else splash(ex, ey, it.ex || 0, it.ey || -1, { color: c || BLUE, drops: 3, size: 1.25 });
  }
  function releaseAll() { items.forEach((it) => { if (it.held) release(it, 0, 0, 0, 0, true); }); if (items.size) kick(); }

  function frame(now) {
    const dt = Math.min(0.034, (now - lastT) / 1000 || 0.016); lastT = now;
    let alive = false;
    if (moved) pointerStep();
    items.forEach((it) => {
      const el = it.el;
      if (!el.isConnected) { items.delete(el); return; }
      // held: quick and well damped. released: looser, so it overshoots once and settles.
      const K = it.held ? 300 : 210, C = it.held ? 30 : 11.5;
      it.vx += (K * (it.tx - it.x) - C * it.vx) * dt; it.x += it.vx * dt;
      it.vy += (K * (it.ty - it.y) - C * it.vy) * dt; it.y += it.vy * dt;
      const sp = Math.hypot(it.vx, it.vy);
      const rest = Math.abs(it.tx - it.x) < 0.04 && Math.abs(it.ty - it.y) < 0.04 && sp < 1.5;
      if (rest && !it.held) { el.style.translate = ""; el.style.scale = ""; items.delete(el); return; }
      el.style.translate = `${it.x.toFixed(2)}px ${it.y.toFixed(2)}px`;
      if (it.btn) {                     // squash & stretch: a little along the direction of travel
        const s = Math.min(0.05, sp / 3400) + it.k * 0.03, hor = Math.abs(it.held ? it.ex : it.vx) >= Math.abs(it.held ? it.ey : it.vy);
        el.style.scale = s < 0.004 ? "" : hor ? `${(1 + s).toFixed(3)} ${(1 - s * 0.55).toFixed(3)}` : `${(1 - s * 0.55).toFixed(3)} ${(1 + s).toFixed(3)}`;
      }
      if (!rest) alive = true;
    });
    alive = lightStep() || alive;
    raf = alive ? requestAnimationFrame(frame) : 0;
  }
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }

  // ------------------------------------------------------------ light that follows the cursor
  let light = null, lx = 0, ly = 0, lightOn = false;
  function lightStep() {
    if (!lightOn || lite()) return false;
    if (!light || !light.isConnected) {
      const bg = document.querySelector(".fx-bg"); if (!bg) return false;
      light = document.createElement("span"); light.className = "fx-cursor"; bg.append(light); lx = px; ly = py;
    }
    lx += (px - lx) * 0.07; ly += (py - ly) * 0.07;
    light.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
    return Math.abs(px - lx) + Math.abs(py - ly) > 0.6;
  }
  // one shared overlay draws a glowing border on whichever flat card is under the cursor
  const EDGE = ".card, .srow, .kpi, .acc-item, .mrow, .stats li, .lb-list li, .new-card, .ann, .live-card";
  let edge = null, edgeFor = null, edgeW = 0, edgeH = 0;
  function edgeMove(t) {
    if (lite()) return;
    const el = t && t.closest ? t.closest(EDGE) : null;
    if (!el || el.closest("dialog, .tilt, .srch") || el.matches(".rv")) return edgeHide();
    const app = document.getElementById("app");
    if (!edge || !edge.isConnected) { edge = document.createElement("span"); edge.className = "fx-edge"; edge.setAttribute("aria-hidden", "true"); app.append(edge); edgeFor = null; }
    const r = el.getBoundingClientRect();
    if (edgeFor !== el) { edgeFor = el; edge.style.borderRadius = getComputedStyle(el).borderRadius; edgeW = edgeH = 0; }
    if (Math.abs(r.width - edgeW) > 0.5 || Math.abs(r.height - edgeH) > 0.5) { edgeW = r.width; edgeH = r.height; edge.style.width = r.width + "px"; edge.style.height = r.height + "px"; }
    edge.style.transform = `translate3d(${r.left.toFixed(1)}px, ${r.top.toFixed(1)}px, 0)`;
    edge.style.setProperty("--ex", (px - r.left).toFixed(0) + "px"); edge.style.setProperty("--ey", (py - r.top).toFixed(0) + "px");
    edge.classList.add("on");
  }
  function edgeHide() { if (edge) edge.classList.remove("on"); edgeFor = null; }

  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || calm()) return;
    px = e.clientX; py = e.clientY; lightOn = true; moved = e.target;
    kick();
  }, { passive: true });
  // at most once per frame, however fast the mouse reports
  function pointerStep() {
    const t = moved; moved = null;
    if (!t || calm()) return;
    const c = pick(t);
    if (c && !items.has(c)) add(c);
    else if (c) { const it = items.get(c); if (!it.held) { it.held = true; it.t0 = performance.now(); c.classList.add("is-mag"); } }
    items.forEach(update);
    edgeMove(t);
  }
  document.addEventListener("pointerdown", (e) => {            // a click lets go at once (no splash): the press itself is the feedback
    if (e.pointerType !== "mouse") return;
    items.forEach((it) => { if (it.held && it.btn) { it.tx *= 0.3; it.ty *= 0.3; } });
  }, { passive: true });
  window.addEventListener("scroll", () => { if (items.size) releaseAll(); if (edgeFor) edgeHide(); onScroll(); }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { releaseAll(); edgeHide(); lightOn = false; });
  window.addEventListener("blur", releaseAll);

  // ------------------------------------------------------------ touch: press in, spring back
  const PRESS = ".sticker, .srow, .new-card, .continue, .pl, .mini, .prize, .badge, .inv-promo, .lvl-card";
  let pressed = null, pressAnim = null, downAt = null;
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || calm()) return;
    const el = e.target.closest && e.target.closest(PRESS);
    downAt = { x: e.clientX, y: e.clientY, el };
    if (!el || !el.animate) return;
    pressed = el;
    pressAnim = el.animate([{ scale: "1" }, { scale: "0.972" }], { duration: 130, easing: "ease-out", fill: "forwards" });
  }, { passive: true });
  const unpress = (e) => {
    if (!pressed) return;
    const el = pressed; pressed = null;
    try { pressAnim && pressAnim.cancel(); } catch {}
    if (el.isConnected && el.animate) el.animate([{ scale: "0.972" }, { scale: "1.012" }, { scale: "1" }], { duration: 420, easing: "cubic-bezier(.2,.9,.25,1)" });
    // a tap (not a scroll) leaves a small ring where the finger was
    if (e && e.type === "pointerup" && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 10) {
      const c = getComputedStyle(el).getPropertyValue("--c").trim();
      splash(e.clientX, e.clientY, 0, -1, { color: c || BLUE, drops: 0, size: 1.5 });
    }
  };
  document.addEventListener("pointerup", unpress, { passive: true });
  document.addEventListener("pointercancel", unpress, { passive: true });

  // ------------------------------------------------------------ topbar: condensed when scrolled + reading progress
  // Only two tiny elements are touched while scrolling (the bar and its progress line), and
  // only when their value really changes, so scrolling never re-styles the page.
  let scrollRaf = 0, bar = null, prog = null, wasScrolled = null, lastSp = "", maxScroll = 0, maxAt = 0;
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (!bar || !bar.isConnected) { bar = document.querySelector(".topbar"); prog = null; wasScrolled = null; lastSp = ""; }
      if (!bar) return;
      if (!prog || !prog.isConnected) { prog = document.createElement("i"); prog.className = "fx-prog"; prog.setAttribute("aria-hidden", "true"); bar.append(prog); }
      const y = scrollY, on = y > 8, now = performance.now();
      if (on !== wasScrolled) { wasScrolled = on; bar.classList.toggle("is-scrolled", on); }
      if (now - maxAt > 400) { maxAt = now; maxScroll = document.documentElement.scrollHeight - innerHeight; }   // page height: re-read now and then, not every frame
      const sp = maxScroll > 240 ? clamp(y / maxScroll, 0, 1).toFixed(3) : "0";
      if (sp !== lastSp) { lastSp = sp; prog.style.transform = `scaleX(${sp})`; }
    });
  }

  // ------------------------------------------------------------ headings arrive word by word
  function splitWords(root) {
    root.querySelectorAll(".hello h1, .page-title, .subject-head h1").forEach((h) => {
      if (h.classList.contains("fx-split")) return;
      let i = 0;
      const walk = (node) => [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          if (!n.textContent.trim()) return;
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) return frag.append(" ");
            const w = document.createElement("span"), inner = document.createElement("span");
            w.className = "w"; inner.textContent = part; inner.style.setProperty("--wi", i++); w.append(inner); frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && !n.matches("svg, img, button, a, .status, .srow-meta, .tab-badge")) walk(n);
      });
      walk(h); h.classList.add("fx-split");
    });
  }

  // ------------------------------------------------------------ sections rise in as you scroll to them
  let io = null;
  function reveal(root) {
    if (io) { io.disconnect(); io = null; }
    if (calm() || lite() || !("IntersectionObserver" in window)) return;
    const vh = innerHeight, list = [];
    root.querySelectorAll(".page .fx-st, .page .card, .page .block > h2, .page .new-row").forEach((el) => {
      if (el.parentElement && el.parentElement.matches(".new-row")) return;                         // a sideways row appears as one piece
      if (el.matches(".card") && (el.querySelector(".fx-st") || el.closest(".fx-st"))) return;     // its parts handle themselves
      if (el.closest("dialog") || (el.parentElement && el.parentElement.closest(".rv"))) return;
      if (el.getBoundingClientRect().top < vh * 0.96) return;                                       // already on screen
      el.classList.remove("fx-st"); el.classList.add("rv"); list.push(el);
    });
    if (!list.length) return;
    io = new IntersectionObserver((entries) => {
      entries.filter((en) => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
        .forEach((en, i) => {
          const el = en.target; io.unobserve(el);
          el.style.setProperty("--rd", Math.min(i, 6) * 55 + "ms");
          el.classList.add("rv-in", "fx-grow");
          if (el.querySelector("[data-count]")) FX.countUp(el);
          setTimeout(() => { el.classList.remove("rv", "rv-in"); el.style.removeProperty("--rd"); }, 1000 + Math.min(i, 6) * 55);
        });
    }, { rootMargin: "0px 0px -5% 0px", threshold: 0.05 });
    list.forEach((el) => io.observe(el));
  }

  // ------------------------------------------------------------ shared-element page morphs
  let lastLink = null, lastLinkAt = 0, pending = null, named = [];
  // Morphs cost the most of anything here. Each one is timed; if two in a row stutter on this
  // device, they are switched off (for a week) and pages change with the quick slide instead.
  let morphOff = false, morphSlow = 0;
  try { const v = localStorage.getItem("onsite.nomorph"); morphOff = !!v && Date.now() - +v < 7 * 864e5; } catch {}
  function timeMorph(vt) {
    const gaps = []; let last = 0, on = true;
    const tick = (now) => { if (!on) return; if (last) gaps.push(now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const end = () => {
      on = false;
      if (gaps.length < 4 || document.hidden) return;
      gaps.sort((a, b) => a - b);
      const slow = gaps[gaps.length >> 1] > 30 || gaps[gaps.length - 1] > 140;      // choppy overall, or one long freeze
      morphSlow = slow ? morphSlow + 1 : 0;
      if (morphSlow >= 2) { morphOff = true; try { localStorage.setItem("onsite.nomorph", String(Date.now())); } catch {} }
    };
    vt.finished.then(end, end);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (a) { lastLink = a; lastLinkAt = performance.now(); }
  }, true);
  const seg = (key) => String(key || "/").split("#")[0].split("/").filter(Boolean);
  const name = (el, n) => { if (el) { el.style.viewTransitionName = n; named.push(el); } return !!el; };
  const clearNames = () => { named.forEach((el) => (el.style.viewTransitionName = "")); named = []; };
  const onScreen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; };
  const KINDS = ["", "subject", "watch"];

  // Called before the new page is drawn. Returns true when this navigation will morph
  // (the old page then skips its slide-away).
  function planMorph(from, to) {
    pending = null; clearNames();
    if (calm() || lite() || morphOff || !document.startViewTransition || from === null || from === to) return false;
    const a = seg(from), b = seg(to), ka = a[0] || "", kb = b[0] || "";
    if (!KINDS.includes(ka) || !KINDS.includes(kb) || a.length > 2 || b.length > 2) return false;
    const link = lastLink && lastLink.isConnected && performance.now() - lastLinkAt < 1500 ? lastLink : null;
    const p = { to, ka, kb, a, b, card: false, video: false };
    if (kb === "subject" && ka === "" && link && link.matches(".sticker")) {
      p.card = name(link, "m-card"); name(link.querySelector(".sticker-glyph"), "m-glyph");
    } else if (kb === "watch" && ka !== "watch" && link) {
      p.video = name(link.querySelector(".srow-thumb, .continue-thumb, .new-thumb"), "m-video");
    } else if (ka === "subject" && kb === "") {
      p.card = name(document.querySelector(".subject-head"), "m-card"); name(document.querySelector(".subject-glyph"), "m-glyph");
    } else if (ka === "watch" && kb !== "watch") {
      p.video = name(document.getElementById("player"), "m-video");
    }
    if (!p.card && !p.video) { clearNames(); return false; }      // nothing to morph: the normal quick slide is lighter
    pending = p;
    return true;
  }
  function tagNew(p) {
    const q = (s) => document.querySelector(s), esc2 = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    if (p.card && p.kb === "subject") { name(q(".subject-head"), "m-card"); name(q(".subject-glyph"), "m-glyph"); }
    else if (p.card && p.kb === "") {
      const card = q(`a.sticker[href="#/subject/${esc2(p.a[1] || "")}"]`);
      if (onScreen(card)) { name(card, "m-card"); name(card.querySelector(".sticker-glyph"), "m-glyph"); }
    } else if (p.video && p.kb === "watch") name(q("#player"), "m-video");
    else if (p.video) {
      const th = q(`a[href="#/watch/${esc2(p.a[1] || "")}"] :is(.srow-thumb, .continue-thumb, .new-thumb)`);
      if (onScreen(th)) name(th, "m-video");
    }
  }
  // Draws the new page (fn), morphing from the old one when planMorph said so.
  function commit(key, fn) {
    const p = pending; pending = null;
    if (!p || p.to !== key || calm() || !document.startViewTransition) { clearNames(); return fn(); }
    const app = document.getElementById("app");
    try {
      const old = named.slice();
      const vt = document.startViewTransition(() => {
        old.forEach((el) => (el.style.viewTransitionName = "")); named = [];
        app.classList.add("fx-morph");
        fn(); tagNew(p);
      });
      timeMorph(vt);
      const done = () => { clearNames(); setTimeout(() => app.classList.remove("fx-morph"), 1200); };
      vt.finished.then(done, done);
      return vt.updateCallbackDone.catch(() => {});
    } catch { clearNames(); return fn(); }
  }

  // ------------------------------------------------------------ hooks called by FX
  function afterRender(root, changed) {
    splitWords(root);
    if (changed) reveal(root);
    edgeHide(); maxAt = 0; onScroll();
  }

  return { planMorph, commit, afterRender, splash, releaseAll };
})();
