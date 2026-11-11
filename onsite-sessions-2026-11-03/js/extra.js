// ON-site Sessions: extras.
//  • Share card: a story-sized picture (1080×1920) with the member's level and stats and a
//    QR code of their own invite link, to post on Instagram / WhatsApp status.
//  • Backup: admins download every table as one file (Manage → People).
// Buttons anywhere with data-act="share-card" / data-act="backup" work; nothing to bind per page.
const EXTRA = (() => {
  const ICON = {
    card: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M9.5 8h5M9.5 11.5h5M10 16.5h4"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  };
  const shareBtn = (cls = "btn sm") => `<button type="button" class="${cls} share-card-btn" data-act="share-card">${ICON.card} ${t("shareCard")}</button>`;
  const backupBtn = () => `<button type="button" class="btn sm" data-act="backup">${ICON.down} ${t("backup")}</button>`;

  // ================================================================ share card
  const W = 1080, H = 1920;
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function fontsReady() {
    try {
      await Promise.all(['900 100px "Archivo"', '700 40px "Archivo"', '400 80px "Yellowtail"', '800 60px "Alexandria"'].map((f) => document.fonts.load(f, "ON-site ادعُ")));
    } catch {}
  }
  const AR = () => I18N.lang === "ar";
  const sans = (w, px, wide) => `${w} ${wide && !AR() ? "expanded " : ""}${px}px ${AR() ? '"Alexandria", "Archivo"' : '"Archivo", "Alexandria"'}, system-ui, sans-serif`;
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function fitText(ctx, text, maxW, w, px, wide) {
    let size = px; ctx.font = sans(w, size, wide);
    while (ctx.measureText(text).width > maxW && size > 24) { size -= 4; ctx.font = sans(w, size, wide); }
    return size;
  }
  function drawQr(ctx, text, x, y, size) {
    const svg = makeQrSvg(text, { quiet: 2 });
    const n = +(/viewBox="0 0 (\d+)/.exec(svg) || [0, 29])[1], cell = size / n;
    ctx.fillStyle = "#fff"; rr(ctx, x - 22, y - 22, size + 44, size + 44, 34); ctx.fill();
    ctx.fillStyle = "#0B0B0B";
    for (const m of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) ctx.fillRect(x + m[1] * cell, y + m[2] * cell, Math.ceil(cell), Math.ceil(cell));
  }
  async function drawCard(url, code) {
    await fontsReady();
    const logo = await loadImg("img/onsite-logo.png");
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const st = PLUS.myStats(), lv = PLUS.level(st), all = overallStats();
    const nBadges = PLUS.badges(st).filter((b) => b.got).length;
    const first = String(S.profile.full_name || "").trim().split(/\s+/).slice(0, 2).join(" ") || "ON-site";
    ctx.direction = AR() ? "rtl" : "ltr";

    // ---- ground: near-black with blue light and a halftone patch
    ctx.fillStyle = "#0B0B0B"; ctx.fillRect(0, 0, W, H);
    const glow = (x, y, r, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(46,107,255,${a})`); g.addColorStop(0.45, `rgba(46,107,255,${a * 0.28})`); g.addColorStop(1, "rgba(46,107,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    glow(120, 160, 900, 0.42); glow(1000, 1500, 900, 0.26);
    for (let y = 0; y < 760; y += 22) for (let x = 520; x < W + 20; x += 22) {
      const d = Math.hypot(x - 900, y - 330) / 430; if (d > 1) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.11 * (1 - d)})`; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
    }
    // ghost wordmark
    ctx.save(); ctx.font = '900 expanded 330px "Archivo", sans-serif'; ctx.textAlign = "left"; ctx.direction = "ltr";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.strokeText("ON-SITE", -30, 1150); ctx.strokeText("ON-SITE", -330, 1440); ctx.restore();

    // ---- top: logo + handle
    if (logo) { ctx.save(); ctx.shadowColor = "rgba(46,107,255,.9)"; ctx.shadowBlur = 44; ctx.drawImage(logo, 80, 96, 150, 150); ctx.restore(); }
    ctx.textAlign = "right"; ctx.direction = "ltr"; ctx.fillStyle = "#B3B3B3"; ctx.font = '700 34px "Archivo", sans-serif'; ctx.fillText("on.site.je", W - 84, 186);
    ctx.direction = AR() ? "rtl" : "ltr";

    // ---- headline
    ctx.textAlign = "center";
    ctx.save(); ctx.translate(W / 2, 400); ctx.rotate(-0.055);
    ctx.font = AR() ? '700 84px "Aref Ruqaa", "Alexandria", serif' : '400 96px "Yellowtail", cursive';
    ctx.shadowColor = "#2E6BFF"; ctx.shadowBlur = 34; ctx.fillStyle = "#A9C9FF"; ctx.fillText(t("cardStudying"), 0, 0); ctx.restore();
    ctx.save(); ctx.direction = "ltr"; ctx.fillStyle = "#fff";
    let big = 196; ctx.font = `900 expanded ${big}px "Archivo", sans-serif`;
    while (ctx.measureText("ON-SITE").width > W - 120 && big > 90) { big -= 4; ctx.font = `900 expanded ${big}px "Archivo", sans-serif`; }
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12; ctx.fillText("ON-SITE", W / 2, 590); ctx.restore();

    // ---- name + level
    ctx.save(); ctx.direction = /[\u0600-\u06FF]/.test(first) ? "rtl" : "ltr";          // a Latin name keeps its own order in Arabic mode
    fitText(ctx, first, 760, 800, 76, false); ctx.fillStyle = "#fff"; ctx.fillText(first, W / 2, 760); ctx.restore();
    const lvText = `${t("levelN", { n: num(lv.n) })} · ${lv.title}`;
    ctx.font = sans(800, 40, false); const lw = ctx.measureText(lvText).width + 72;
    rr(ctx, (W - lw) / 2, 800, lw, 76, 38); ctx.fillStyle = "rgba(46,107,255,.22)"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#5C93FF"; ctx.stroke();
    ctx.fillStyle = "#DCE8FF"; ctx.fillText(lvText, W / 2, 852);

    // ---- three stats
    const tiles = [[num(all.done), t("cardFinished")], [num(all.hours), t("cardHours")], [num(Math.max(all.streak, 0)), t("cardStreak")]];
    const tw = 292, gap = 22, x0 = (W - (tw * 3 + gap * 2)) / 2, ty = 950, th = 250;
    tiles.forEach(([n, label], i) => {
      const x = x0 + i * (tw + gap);
      rr(ctx, x, ty, tw, th, 34); ctx.fillStyle = "rgba(22,22,22,.92)"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = i === 0 ? "#5C93FF" : "#2F2F2F"; ctx.stroke();
      ctx.save(); ctx.direction = AR() ? "rtl" : "ltr"; ctx.fillStyle = "#fff"; fitText(ctx, n, tw - 40, 900, 112, true); ctx.fillText(n, x + tw / 2, ty + 132); ctx.restore();
      ctx.fillStyle = "#B3B3B3"; fitText(ctx, label, tw - 36, 700, 30, false); ctx.fillText(label, x + tw / 2, ty + 198);
    });
    if (nBadges) { ctx.fillStyle = "#A9C9FF"; ctx.font = sans(700, 34, false); ctx.fillText(t("cardBadges", { n: num(nBadges) }), W / 2, ty + th + 70); }

    // ---- QR + call to action
    const qs = 330, qx = (W - qs) / 2, qy = 1360;
    ctx.save(); ctx.shadowColor = "rgba(46,107,255,.75)"; ctx.shadowBlur = 60; drawQr(ctx, url, qx, qy, qs); ctx.restore();
    drawQr(ctx, url, qx, qy, qs);
    ctx.fillStyle = "#fff"; fitText(ctx, t(code ? "cardJoin" : "cardJoinPlain"), 900, 800, 46, false); ctx.fillText(t(code ? "cardJoin" : "cardJoinPlain"), W / 2, 1790);
    if (code) { ctx.save(); ctx.direction = "ltr"; ctx.fillStyle = "#8DB8FF"; ctx.font = '700 32px ui-monospace, "Archivo", monospace'; ctx.fillText(`on.site.je  ·  ${code}`, W / 2, 1846); ctx.restore(); }
    // bottom stripe
    const sg = ctx.createLinearGradient(0, 0, W, 0); sg.addColorStop(0, "#1D4ED8"); sg.addColorStop(0.5, "#2E6BFF"); sg.addColorStop(1, "#A9C9FF");
    ctx.fillStyle = sg; ctx.fillRect(0, H - 16, W, 16);
    return c;
  }

  async function openShare(btn) {
    if (!S.user || !S.profile) return;
    if (btn) btn.disabled = true;
    toast(t("cardMaking"));
    let code = null;
    // their own invite link when invites are switched on; otherwise the plain site address
    if (S.contest) { try { code = await API.getRefCode(); try { localStorage.setItem("onsite.refcode." + S.user.id, code); } catch {} } catch {} }
    const url = code ? inviteUrl(code) : location.origin + location.pathname;
    let canvas, blob;
    try {
      canvas = await drawCard(url, code);
      blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    } catch (e) { if (btn) btn.disabled = false; return fail(e); }
    if (btn) btn.disabled = false;
    if (!blob) return fail(new Error("Could not make the picture."));
    const file = new File([blob], "onsite-card.png", { type: "image/png" });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    const src = URL.createObjectURL(blob);
    const dlg = document.createElement("dialog");
    dlg.className = "modal share-modal";
    dlg.innerHTML = `<div class="form pad-modal">
      <div class="modal-head"><h2>${t("shareCardTitle")}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t("cancel"))}">✕</button></div>
      <p class="srow-meta">${t(code ? "shareCardSub" : "shareCardSubPlain")}</p>
      <div class="share-prev"><img src="${src}" alt="${esc(t("shareCardTitle"))}"></div>
      <div class="modal-foot">
        <a class="btn" href="${src}" download="onsite-card.png" data-dl>${ICON.down} ${t("download")}</a>
        ${canShare ? `<button type="button" class="btn primary" data-share>${ICON.share} ${t("share")}</button>` : ""}
      </div></div>`;
    document.body.append(dlg); dlg.showModal();
    const close = () => { dlg.close(); dlg.remove(); setTimeout(() => URL.revokeObjectURL(src), 4000); };
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    dlg.addEventListener("click", async (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) return close();
      if (e.target.closest("[data-dl]")) return toast("✓ " + t("cardSaved"));
      if (e.target.closest("[data-share]")) {
        try { await navigator.share({ files: [file], title: "ON-site", text: t("shareCardText", { u: url }) }); } catch {}
      }
    });
  }

  // ================================================================ backup (admins)
  async function backup(btn) {
    if (!isAdmin()) return;
    btn.disabled = true; toast(t("backupMaking"));
    try {
      const safe = (p) => p.catch(() => null);
      const [profiles, progress, phones, ratings, referrals, live, dorms, contest, ann] = await Promise.all([
        safe(API.listProfiles()), safe(API.listAllProgress()), safe(API.listPhones()), safe(API.listRatings()), safe(API.listReferrals()),
        safe(API.listLive()), safe(API.listDorms()), safe(API.getContest()), safe(API.listAnnouncements()),
      ]);
      const attendance = {};
      const ids = (live || []).map((l) => l.id);
      for (let i = 0; i < ids.length; i += 5) {                       // five at a time, gentle on the database
        const part = await Promise.all(ids.slice(i, i + 5).map((id) => safe(API.listAttendance(id))));
        part.forEach((rows, j) => { if (rows) attendance[ids[i + j]] = rows; });
      }
      const data = {
        app: "ON-site Sessions", site_version: window.ONSITE_VERSION || null, exported_at: new Date().toISOString(), exported_by: S.profile.full_name,
        note: "Private: contains members' names and phone numbers. Tables that could not be read are null.",
        subjects: S.subjects, sessions: S.sessions, collabs: S.collabs || null,
        profiles, phones, progress, ratings, referrals, invite_contest: contest, announcements: ann,
        dorms, dorm_sessions: live, attendance,
      };
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `onsite-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("✓ " + t("backupDone", { n: num((profiles || []).length) }));
    } catch (e) { fail(e); }
    btn.disabled = false;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "share-card") openShare(b);
    if (b.dataset.act === "backup") backup(b);
  });

  return { shareBtn, backupBtn, openShare };
})();
