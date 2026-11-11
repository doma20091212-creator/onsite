// ON-site Sessions: extra features.
// Search, badges & levels, leaderboard, announcements, insights for staff, timestamped notes,
// "up next / new this week" rows, offline mode (cached data + progress that syncs later) and
// the install-as-app prompt. Uses helpers from app.js (S, M, esc, t, num, …) at call time.
const PLUS = (() => {
  const LS = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const uidKey = (k) => `onsite.${k}.${S.user?.id || "x"}`;
  const day = 864e5;
  const loc = () => (I18N.lang === "ar" ? "ar-EG" : "en-GB");
  const ICON = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
    wifiOff: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 5.2-2.6M16.8 10.6A10 10 0 0 1 19 12.5M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    megaphone: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1ZM17 9a4 4 0 0 1 0 6M7 14l1.5 5h2.5l-1.4-5"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  };

  // ================================================================ offline mode
  // After every successful load, the data is copied to this device. If the next load fails
  // because there's no internet, the site opens from that copy and progress is queued.
  const SNAP_KEYS = ["profile", "subjects", "sessions", "progress", "attendance", "collabs", "myPhone", "phoneReady", "infoReady", "ratings", "ratingsReady", "ann", "annReady"];
  function saveSnap() { const o = { at: Date.now() }; SNAP_KEYS.forEach((k) => (o[k] = S[k])); LS.set(uidKey("snap"), o); }
  function restore() {
    const d = LS.get(uidKey("snap"));
    if (!d || !d.profile) return false;
    SNAP_KEYS.forEach((k) => { if (k in d) S[k] = d[k]; });
    S.fromSnap = d.at; setOffline(true);
    return true;
  }
  const isNetErr = (e) => !navigator.onLine || /fetch|network|load failed|timeout|offline/i.test(String(e?.message || e || ""));

  const rawSave = API.saveProgress.bind(API);
  const queue = () => LS.get(uidKey("queue"), []);
  function enqueue(p) {
    const q = queue(), i = q.findIndex((x) => x.session_id === p.session_id);
    if (i < 0) q.push({ ...p });
    else {
      const o = q[i];
      q[i] = { ...o, ...p, max_seconds: Math.max(+o.max_seconds || 0, +p.max_seconds || 0), completed: !!(o.completed || p.completed) };
    }
    LS.set(uidKey("queue"), q);
  }
  API.saveProgress = async (p) => {
    if (!navigator.onLine) { enqueue(p); setOffline(true); return; }
    try { await rawSave(p); }
    catch (e) { if (isNetErr(e)) { enqueue(p); setOffline(true); return; } throw e; }
  };
  let flushing = false;
  async function flush() {
    if (flushing || !navigator.onLine || !S.user) return;
    const q = queue(); if (!q.length) return;
    flushing = true;
    const sent = new Set();
    for (const p of q) { try { await rawSave(p); sent.add(JSON.stringify(p)); } catch (e) { if (isNetErr(e)) break; } }
    const left = queue().filter((x) => !sent.has(JSON.stringify(x)));   // keeps anything queued while we were sending
    LS.set(uidKey("queue"), left);
    flushing = false;
    if (sent.size && !left.length) toast("✓ " + t("synced"));
  }
  function setOffline(v) {
    S.offline = v;
    document.body.classList.toggle("is-offline", v);
    const pill = document.querySelector(".net-pill"); if (pill) pill.hidden = !v;
  }
  const netPill = () => `<span class="net-pill" role="status" ${S.offline ? "" : "hidden"} title="${esc(t("offlineHelp"))}">${ICON.wifiOff}<span>${t("offline")}</span></span>`;
  window.addEventListener("offline", () => { setOffline(true); toast(t("offlineToast"), "bad"); });
  window.addEventListener("online", async () => {
    await flush();
    if (!S.user) return;
    if (S.offline) toast("✓ " + t("backOnline"));
    setOffline(false);
    if (S.fromSnap) {                                   // data came from the saved copy: fetch the real thing
      try { await loadAll(); S.fromSnap = null; afterLoad(); route(); } catch {}
    }
  });
  setInterval(() => { if (queue().length) flush(); }, 30000);

  // ================================================================ after data loads
  let rtAnn = null;
  async function loadExtras() {
    try { S.ann = await API.listAnnouncements(); S.annReady = true; } catch { S.ann = S.ann || []; S.annReady = false; }
  }
  function afterLoad() {
    saveSnap();
    flush();
    checkBadges(false);
    // new announcements appear live
    if (!rtAnn && S.annReady && API.subscribe) rtAnn = API.subscribe("announcements", null, (p) => {
      if (p.eventType === "INSERT" && p.new && !S.ann.some((a) => a.id === p.new.id)) {
        S.ann.unshift(p.new); saveSnap();
        if (p.new.created_by !== S.user?.id) toast("📣 " + t("annNew"));
        paintAnnStack();
      } else if (p.eventType === "DELETE" && p.old) { S.ann = S.ann.filter((a) => a.id !== p.old.id); paintAnnStack(); }
    });
  }

  // ================================================================ announcements
  const KINDS = { info: { icon: "📣", cls: "k-info" }, important: { icon: "⚠️", cls: "k-imp" }, celebrate: { icon: "🎉", cls: "k-cel" } };
  const annActive = (a) => !a.ends_at || new Date(a.ends_at) > new Date();
  const seenAnn = () => LS.get(uidKey("annSeen"), []);
  function annFor(where, subjectId) {
    const hidden = new Set(seenAnn());
    return (S.ann || []).filter(annActive).filter((a) => !hidden.has(a.id))
      .filter((a) => where === "home" || a.subject_id === subjectId)
      .slice(0, 3);
  }
  function annCard(a) {
    const k = KINDS[a.kind] || KINDS.info, sub = a.subject_id ? subjectById(a.subject_id) : null;
    return `<div class="ann ${k.cls}" data-ann="${esc(a.id)}" role="status">
      <span class="ann-ic" aria-hidden="true">${k.icon}</span>
      <div class="ann-body">${sub ? `<span class="ann-sub">${sticker(sub, "xs")} ${esc(I18N.subjectName(sub))}</span>` : `<span class="ann-sub">${t("annFromClub")}</span>`}
        <p><bdi>${esc(a.body).replace(/\n/g, "<br>")}</bdi></p></div>
      <button type="button" class="ann-x" data-ann-x="${esc(a.id)}" aria-label="${esc(t("dismiss"))}">✕</button></div>`;
  }
  const annStack = (where = "home", sid = null) => `<div class="ann-stack" id="annStack" data-where="${where}" data-sid="${sid || ""}">${annFor(where, sid).map(annCard).join("")}</div>`;
  function paintAnnStack() {
    const box = document.getElementById("annStack"); if (!box) return;
    box.innerHTML = annFor(box.dataset.where, +box.dataset.sid || null).map(annCard).join("");
    cheerAnn(box);
  }
  function cheerAnn(root) {
    const done = new Set(LS.get(uidKey("annCheer"), []));
    const c = [...root.querySelectorAll(".ann.k-cel")].find((el) => !done.has(+el.dataset.ann || el.dataset.ann));
    if (!c) return;
    done.add(+c.dataset.ann || c.dataset.ann); LS.set(uidKey("annCheer"), [...done]);
    setTimeout(() => FX.cheer("small", { x: 0.5, y: 0.25 }), 500);
  }
  document.addEventListener("click", (e) => {
    const x = e.target.closest && e.target.closest("[data-ann-x]"); if (!x) return;
    const id = isNaN(+x.dataset.annX) ? x.dataset.annX : +x.dataset.annX;
    LS.set(uidKey("annSeen"), [...new Set(seenAnn().concat(id))].slice(-200));
    const card = x.closest(".ann"); card.classList.add("ann-out"); setTimeout(() => card.remove(), 320);
  });

  // manage tab
  function annTab() {
    if (!S.annReady) return `<p class="note">${t("plusSetup")}</p>`;
    const subs = isAdmin() ? S.subjects : S.subjects.filter((s) => s.id === S.profile.subject_id);
    const list = (S.ann || []).filter((a) => isAdmin() || a.created_by === S.user.id || a.subject_id === S.profile.subject_id);
    const when = (iso) => new Date(iso).toLocaleString(loc(), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    return `<div class="ann-grid">
      <form class="card pad form" id="annForm" novalidate>
        <h2>${t("annWrite")}</h2>
        <label>${t("annMessage")}<textarea name="body" rows="4" maxlength="500" required placeholder="${esc(t("annPh"))}"></textarea><small class="ann-count">0 / 500</small></label>
        <label>${t("annAudience")}<select name="sid">${isAdmin() ? `<option value="">${t("annEveryone")}</option>` : ""}${subs.map((s) => `<option value="${s.id}">${esc(s.icon)} ${esc(I18N.subjectName(s))}</option>`).join("")}</select></label>
        <fieldset class="seg-field"><legend>${t("annStyle")}</legend>
          ${Object.entries(KINDS).map(([k, v], i) => `<label class="radio-pill"><input type="radio" name="kind" value="${k}" ${i === 0 ? "checked" : ""}> ${v.icon} ${t("annKind_" + k)}</label>`).join("")}
        </fieldset>
        <label>${t("annEnds")}<select name="ends"><option value="1">${t("annEnds1")}</option><option value="3">${t("annEnds3")}</option><option value="7" selected>${t("annEnds7")}</option><option value="30">${t("annEnds30")}</option><option value="">${t("annEndsNever")}</option></select></label>
        <div class="ann-preview" aria-hidden="true"></div>
        <p class="err" role="alert"></p>
        <button class="btn primary">${ICON.megaphone} ${t("annPost")}</button>
      </form>
      <section class="card pad">
        <h2>${t("annPosted")}</h2>
        ${list.length ? `<ul class="ann-list">${list.map((a) => {
          const sub = a.subject_id ? subjectById(a.subject_id) : null, k = KINDS[a.kind] || KINDS.info, on = annActive(a);
          const mine = isAdmin() || a.created_by === S.user.id;
          return `<li class="${on ? "" : "is-off"}"><span class="ann-ic sm" aria-hidden="true">${k.icon}</span>
            <span class="ann-li-body"><bdi>${esc(a.body)}</bdi><small>${sub ? esc(I18N.subjectName(sub)) : t("annEveryone")} · ${when(a.created_at)} · ${on ? (a.ends_at ? t("annUntil", { d: when(a.ends_at) }) : t("annNoEnd")) : t("annEnded")}</small></span>
            ${mine ? `<button type="button" class="icon-btn" data-ann-del="${esc(a.id)}" aria-label="${esc(t("delete"))}">✕</button>` : ""}</li>`;
        }).join("")}</ul>` : `<p class="empty">${t("annNone")}</p>`}
      </section></div>`;
  }
  function bindAnn() {
    const f = document.getElementById("annForm"); if (!f) return;
    const prev = f.querySelector(".ann-preview"), cnt = f.querySelector(".ann-count");
    const paint = () => {
      cnt.textContent = `${num(f.body.value.length)} / ${num(500)}`;
      prev.innerHTML = f.body.value.trim() ? annCard({ id: "pv", body: f.body.value.trim(), kind: f.kind.value, subject_id: f.sid.value ? +f.sid.value : null }).replace(/<button[\s\S]*?<\/button>/, "") : "";
    };
    f.oninput = paint; f.onchange = paint;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = f.body.value.trim(), err = f.querySelector(".err");
      if (!body) { err.textContent = t("annEmpty"); return; }
      const ends = f.ends.value ? new Date(Date.now() + +f.ends.value * day).toISOString() : null;
      const b = f.querySelector("button.primary"); b.disabled = true;
      try {
        const a = await API.saveAnnouncement({ body, subject_id: f.sid.value ? +f.sid.value : null, kind: f.kind.value, ends_at: ends });
        if (!S.ann.some((x) => x.id === a.id)) S.ann.unshift(a);
        saveSnap(); toast("📣 " + t("annSent")); route();
      } catch (ex) { err.textContent = ex.message; b.disabled = false; }
    };
    document.getElementById("mbody").onclick = async (e) => {
      const d = e.target.closest("[data-ann-del]"); if (!d) return;
      if (!confirm(t("annConfirmDel"))) return;
      const id = isNaN(+d.dataset.annDel) ? d.dataset.annDel : +d.dataset.annDel;
      try { await API.deleteAnnouncement(id); S.ann = S.ann.filter((a) => a.id !== id); saveSnap(); toast(t("deleted")); route(); } catch (ex) { fail(ex); }
    };
  }

  // ================================================================ badges & levels
  function myStats() {
    const pub = new Set(visibleSessions().map((s) => s.id));
    const prog = Object.values(S.progress || {}).filter((p) => pub.has(p.session_id));
    const finished = prog.filter((p) => p.completed).length;
    const started = prog.filter((p) => !p.completed && +p.max_seconds > 0).length;
    const days = [...new Set(prog.map((p) => new Date(p.updated_at).toDateString()))].map((d) => new Date(d).getTime()).sort((a, b) => a - b);
    let best = days.length ? 1 : 0, run = 1;
    for (let i = 1; i < days.length; i++) { run = Math.round((days[i] - days[i - 1]) / day) === 1 ? run + 1 : 1; best = Math.max(best, run); }
    const secs = prog.reduce((a, p) => a + Math.min(+p.max_seconds || 0, +p.duration_seconds || Infinity), 0);
    const subjDone = S.subjects.filter((sub) => { const ss = subjectStats(sub.id); return ss.total && ss.done === ss.total; }).length;
    const touched = new Set(prog.map((p) => S.sessions.find((s) => s.id === p.session_id)?.subject_id).filter(Boolean)).size;
    const hours = prog.map((p) => new Date(p.updated_at).getHours());
    return {
      finished, started, best, streak: overallStats().streak, hours: secs / 3600, subjDone, touched,
      dorm: (S.attendance || []).length, rated: Object.keys(S.ratings || {}).length,
      notes: prog.filter((p) => String(p.notes || "").trim().length >= 15).length,
      owl: hours.some((h) => h >= 23 || h < 4) ? 1 : 0, bird: hours.some((h) => h >= 4 && h < 7) ? 1 : 0,
    };
  }
  const BADGES = [
    ["first", "🎬", "finished", 1], ["five", "🔥", "finished", 5], ["ten", "🚀", "finished", 10], ["quarter", "🏆", "finished", 25], ["fifty", "👑", "finished", 50],
    ["streak3", "⚡", "best", 3], ["streak7", "🌟", "best", 7], ["streak14", "💎", "best", 14],
    ["explorer", "🧭", "touched", 4], ["master", "🎓", "subjDone", 1], ["polymath", "🧠", "subjDone", 3],
    ["hours5", "⏱️", "hours", 5], ["hours20", "⌛", "hours", 20],
    ["dorm1", "🏠", "dorm", 1], ["dorm10", "🛋️", "dorm", 10],
    ["critic", "⭐", "rated", 3], ["scribe", "📝", "notes", 5], ["owl", "🦉", "owl", 1], ["bird", "🐦", "bird", 1],
  ];
  function badges(st = myStats()) {
    return BADGES.filter(([id]) => id !== "critic" || S.ratingsReady).map(([id, icon, key, goal]) => ({ id, icon, goal, have: Math.min(goal, Math.floor(st[key] || 0)), got: (st[key] || 0) >= goal }));
  }
  const need = (n) => 75 * n * (n - 1);            // total XP needed to reach level n
  const TITLES = ["lv1", "lv2", "lv3", "lv4", "lv5", "lv6", "lv7", "lv8", "lv9", "lv10"];
  function level(st = myStats()) {
    const xp = st.finished * 100 + st.started * 20 + st.dorm * 60 + st.rated * 15 + st.best * 25 + st.notes * 10;
    let n = 1; while (xp >= need(n + 1)) n++;
    const a = need(n), b = need(n + 1);
    return { n, xp, into: xp - a, span: b - a, pct: Math.round(((xp - a) / (b - a)) * 100), title: t(TITLES[Math.min(n, 10) - 1]) };
  }
  function checkBadges(celebrateNew = true) {
    if (!S.user || !S.profile) return;
    const st = myStats(), got = badges(st).filter((b) => b.got).map((b) => b.id), lv = level(st).n;
    const seen = LS.get(uidKey("badges")), seenLv = LS.get(uidKey("level"));
    LS.set(uidKey("badges"), got); LS.set(uidKey("level"), lv);
    if (seen === null) return;                                  // first visit on this device: nothing to celebrate
    const fresh = got.filter((id) => !seen.includes(id));
    if (!celebrateNew) return;
    const show = (fn, delay) => setTimeout(fn, delay);
    let wait = 0;
    if (fresh.length) {
      const b = BADGES.find((x) => x[0] === fresh[0]);
      show(() => FX.celebrate({ icon: b[1], title: t("badgeUnlocked"), sub: `<b>${esc(t("b_" + b[0]))}</b> · ${esc(t("bd_" + b[0], { n: num(b[3]) }))}`, tone: "#FFC94D" }), wait);
      fresh.slice(1).forEach((id, i) => show(() => toast(`${BADGES.find((x) => x[0] === id)[1]} ${t("badgeUnlocked")}: ${t("b_" + id)}`), 2600 + i * 900));
      wait = 2600 + (fresh.length - 1) * 900;
    }
    if (seenLv && lv > seenLv) show(() => FX.celebrate({ icon: `<b class="lv-glyph">${num(lv)}</b>`, title: t("levelUp", { n: num(lv) }), sub: esc(t(TITLES[Math.min(lv, 10) - 1])), tone: "#5C93FF" }), wait);
  }
  function levelCard() {
    const lv = level();
    return `<section class="lvl-card" aria-label="${esc(t("levelN", { n: num(lv.n) }))}">
      <div class="lvl-ring">${ring(lv.pct, 104, 9)}<span><small>${t("lvl")}</small><b data-count="${lv.n}">${num(lv.n)}</b></span></div>
      <div class="lvl-body">
        <span class="lvl-title">${esc(lv.title)}</span>
        <span class="lvl-xp"><b data-count="${lv.xp}">${num(lv.xp)}</b> XP · ${t("xpToNext", { n: num(lv.span - lv.into), l: num(lv.n + 1) })}</span>
        <span class="bar lvl-bar"><span style="width:${lv.pct}%"></span></span>
        <small class="lvl-how">${t("xpHow")}</small>
        <span class="lvl-actions">${EXTRA.shareBtn()}</span>
      </div></section>`;
  }
  function badgeGrid() {
    const list = badges(), got = list.filter((b) => b.got).length;
    return `<section class="card pad mt-card"><h2>${t("badges")} <span class="srow-meta">${num(got)} / ${num(list.length)}</span></h2>
      <div class="badge-grid">${list.map((b) => `<div class="badge ${b.got ? "got" : ""}" title="${esc(t("bd_" + b.id, { n: num(b.goal) }))}">
        <span class="badge-ic" aria-hidden="true">${b.icon}</span>
        <b>${esc(t("b_" + b.id))}</b>
        <small>${esc(t("bd_" + b.id, { n: num(b.goal) }))}</small>
        ${b.got ? `<span class="badge-ok">✓ ${t("earned")}</span>` : `<span class="bar thin"><span style="width:${Math.round((b.have / b.goal) * 100)}%"></span></span><small class="badge-n">${num(b.have)} / ${num(b.goal)}</small>`}
      </div>`).join("")}</div></section>`;
  }
  const avatarLevel = () => S.profile ? `<span class="av-lvl" aria-hidden="true">${num(level().n)}</span>` : "";

  // ================================================================ leaderboard
  const boardReady = () => !!S.profile && "show_on_board" in S.profile;
  const LB = { days: 7, rows: null, err: false };
  function boardSection() {
    if (!boardReady()) return isAdmin() ? `<section class="card pad mt-card"><h2>🏅 ${t("leaderboard")}</h2><p class="note">${t("plusSetup")}</p></section>` : "";
    const student = S.profile.role === "student";
    return `<section class="card pad mt-card lb" id="lb">
      <div class="lb-head"><h2>🏅 ${t("leaderboard")}</h2>
        <div class="chips" role="group"><button type="button" class="chip" data-lb="7" aria-pressed="${LB.days === 7}">${t("thisWeek")}</button><button type="button" class="chip" data-lb="0" aria-pressed="${!LB.days}">${t("allTime")}</button></div></div>
      ${student ? `<label class="switch-row"><input type="checkbox" id="lbOpt" ${S.profile.show_on_board ? "checked" : ""}><span class="sw" aria-hidden="true"></span><span>${t("showMe")}<small>${t("showMeHelp")}</small></span></label>` : `<p class="srow-meta">${t("lbStaffNote")}</p>`}
      <div id="lbBody">${lbRows()}</div></section>`;
  }
  function lbRows() {
    if (LB.err) return `<p class="empty">${t("lbError")}</p>`;
    if (!LB.rows) return `<div class="sk-rows">${'<span class="sk sk-row sm"></span>'.repeat(4)}</div>`;
    const rows = LB.rows.filter((r) => r.finished > 0 || r.minutes > 0);
    if (!rows.length) return `<p class="empty">${t("lbEmpty")}</p>`;
    const top = Math.max(1, rows[0].finished);
    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    const show = ranked.slice(0, 10), me = ranked.find((r) => r.is_me);
    if (me && me.rank > 10) show.push(me);
    const medal = ["🥇", "🥈", "🥉"];
    return `<ol class="lb-list">${show.map((r) => `<li class="${r.is_me ? "is-me" : ""} ${r.rank <= 3 ? "podium p" + r.rank : ""}">
      <span class="lb-rank">${r.rank <= 3 ? medal[r.rank - 1] : num(r.rank)}</span>
      <span class="lb-name"><bdi>${esc(r.name || "—")}</bdi>${r.is_me ? ` <span class="status">${t("you")}</span>${S.profile.show_on_board ? "" : ` <small class="lb-hidden">${t("onlyYouSee")}</small>`}` : ""}</span>
      <span class="lb-bar"><span class="bar thin"><span style="width:${Math.round((r.finished / top) * 100)}%"></span></span></span>
      <span class="lb-n"><span><b>${num(r.finished)}</b> <small>${t("finishedShort")}</small></span><small class="lb-min">${num(r.minutes)} ${t("min")}</small></span></li>`).join("")}</ol>`;
  }
  async function loadBoard() {
    const body = document.getElementById("lbBody"); if (!body) return;
    LB.rows = null; LB.err = false; body.innerHTML = lbRows();
    try { LB.rows = await API.leaderboard(LB.days || null); } catch (e) { console.warn(e); LB.err = true; }
    const b2 = document.getElementById("lbBody"); if (b2) { b2.innerHTML = lbRows(); FX.stagger(b2); b2.classList.add("fx-rows"); }
  }
  function bindProgress() {
    if (!document.getElementById("lb")) return;
    loadBoard();
    document.getElementById("lb").onclick = (e) => {
      const c = e.target.closest("[data-lb]"); if (!c) return;
      LB.days = +c.dataset.lb; document.querySelectorAll("[data-lb]").forEach((x) => x.setAttribute("aria-pressed", String(+x.dataset.lb === LB.days)));
      loadBoard();
    };
    const opt = document.getElementById("lbOpt");
    if (opt) opt.onchange = async () => {
      try { await API.updateProfile({ show_on_board: opt.checked }); S.profile.show_on_board = opt.checked; saveSnap(); toast(opt.checked ? t("lbOn") : t("lbOff")); loadBoard(); }
      catch (e) { opt.checked = !opt.checked; fail(e); }
    };
  }
  function progressExtras() { return badgeGrid() + boardSection(); }

  // ================================================================ completion moments
  function onComplete(s) {
    FX.buzz(20);
    const ss = subjectStats(s.subject_id), sub = subjectById(s.subject_id);
    if (ss.total > 1 && ss.done === ss.total) {
      setTimeout(() => FX.celebrate({ icon: esc(sub?.icon || "🎓"), title: t("subjectDone"), sub: t("subjectDoneSub", { s: esc(I18N.subjectName(sub)) }), tone: tone(sub) }), 300);
    } else {
      const streak = overallStats().streak, key = uidKey("streakCheer"), today = new Date().toDateString();
      if ([3, 7, 14, 30, 60, 100].includes(streak) && LS.get(key) !== today) {
        LS.set(key, today);
        setTimeout(() => FX.celebrate({ icon: "🔥", title: t("streakTitle", { n: num(streak) }), sub: t("streakSub"), tone: "#FF9A4D" }), 300);
      } else FX.cheer("small", { x: 0.5, y: 0.45 });
    }
    setTimeout(() => checkBadges(true), 2800);
    saveSnap();
  }

  // ================================================================ home rows
  function upNext() {
    const out = [];
    S.subjects.forEach((sub) => {
      const list = sessionsOf(sub.id);
      if (!list.some((s) => S.progress[s.id])) return;                // only subjects you've started
      const n = list.find((s) => !S.progress[s.id]?.completed && !(S.progress[s.id]?.max_seconds > 0));
      if (n) out.push(n);
    });
    return out.slice(0, 8);
  }
  const newOnes = () => visibleSessions().filter((s) => Date.now() - new Date(s.created_at).getTime() < 10 * day)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8);
  function card(s, tag) {
    const sub = subjectById(s.subject_id), st = statusOf(s);
    return `<a class="new-card" href="#/watch/${esc(s.id)}" style="--c:${esc(tone(sub))}">
      <span class="new-thumb" style="background-image:url(${thumb(s.youtube_id)})">${tag ? `<span class="new-tag">${tag}</span>` : ""}${st.key === "prog" ? `<span class="srow-bar" style="width:${st.pct}%"></span>` : ""}<span class="new-dur">${fmtMin(durOf(s))}</span></span>
      <span class="new-sub">${sticker(sub, "xs")} ${esc(I18N.subjectName(sub))}</span>
      <b class="new-title">${esc(s.title)}</b></a>`;
  }
  function homeRows() {
    const nx = upNext(), nw = newOnes();
    return `${nx.length ? `<section class="block"><h2>${t("upNextForYou")}</h2><div class="new-row" tabindex="0" aria-label="${esc(t("upNextForYou"))}">${nx.map((s) => card(s, "")).join("")}</div></section>` : ""}
      ${nw.length ? `<section class="block"><h2>${t("newThisWeek")}</h2><div class="new-row" tabindex="0" aria-label="${esc(t("newThisWeek"))}">${nw.map((s) => card(s, t("newTag"))).join("")}</div></section>` : ""}`;
  }
  const newCount = (sid) => newOnes().filter((s) => s.subject_id === sid && !S.progress[s.id]).length;

  // ================================================================ search
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ًͯ-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  function searchIndex() {
    return visibleSessions().map((s) => {
      const sub = subjectById(s.subject_id), c = sessionCollab(s);
      return { s, sub, title: norm(s.title), subj: norm(`${sub?.name_en} ${sub?.name_ar} ${sub?.slug}`), rest: norm(`${s.description} ${c?.name || ""}`) };
    });
  }
  function runSearch(q) {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    return searchIndex().map((x) => {
      let score = 0;
      for (const tk of toks) {
        const a = x.title.includes(tk) ? (x.title.startsWith(tk) ? 5 : 3) : 0, b = x.subj.includes(tk) ? 2 : 0, c = x.rest.includes(tk) ? 1 : 0;
        if (!a && !b && !c) return null;
        score += a + b + c;
      }
      return { ...x, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
  }
  function hl(text, q) {
    let out = esc(text);
    q.trim().split(/\s+/).filter((w) => w.length > 1).forEach((w) => {
      const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      out = out.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, txt) => tag || txt.replace(re, "<mark>$1</mark>"));
    });
    return out;
  }
  function openSearch() {
    if (!S.user || !S.profile || document.querySelector(".srch")) return;
    const box = document.createElement("div");
    box.className = "srch"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", t("search"));
    box.innerHTML = `<div class="srch-panel">
      <div class="srch-top">${ICON.search}<input type="search" id="srchQ" placeholder="${esc(t("searchAll"))}" autocomplete="off" aria-controls="srchRes"><kbd>Esc</kbd></div>
      <div class="srch-res" id="srchRes" role="listbox"></div></div>`;
    document.body.append(box);
    const q = box.querySelector("#srchQ"), res = box.querySelector("#srchRes");
    let sel = 0, items = [];
    const paint = () => {
      const v = q.value;
      if (!v.trim()) {
        const recent = Object.values(S.progress).filter((p) => !p.completed).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
          .map((p) => S.sessions.find((s) => s.id === p.session_id && s.published)).filter(Boolean).slice(0, 4);
        res.innerHTML = `<p class="srch-k">${t("subjects")}</p><div class="srch-subs">${S.subjects.map((sub) => `<a href="#/subject/${esc(sub.slug)}" class="srch-sub" style="--c:${esc(tone(sub))}">${esc(sub.icon)} ${esc(I18N.subjectName(sub))}</a>`).join("")}</div>
          ${recent.length ? `<p class="srch-k">${t("continueWatching")}</p>${recent.map((s) => row(s, "")).join("")}` : ""}`;
      } else {
        const r = runSearch(v);
        res.innerHTML = r.length ? `<p class="srch-k">${r.length === 1 ? t("resultsOne") : t("resultsN", { n: num(r.length) })}</p>${r.map((x) => row(x.s, v)).join("")}` : `<p class="srch-empty">${t("noResults", { q: esc(v) })}</p>`;
      }
      items = [...res.querySelectorAll(".srch-item")]; sel = 0; mark();
    };
    const row = (s, v) => {
      const sub = subjectById(s.subject_id), st = statusOf(s);
      return `<a class="srch-item" role="option" href="#/watch/${esc(s.id)}"><img src="${thumb(s.youtube_id)}" alt="" loading="lazy">
        <span><b>${hl(s.title, v)}</b><small>${sticker(sub, "xs")} ${esc(I18N.subjectName(sub))} · ${fmtMin(durOf(s))}</small></span><span class="status s-${st.key}">${st.label}</span></a>`;
    };
    const mark = () => items.forEach((el, i) => { el.classList.toggle("is-sel", i === sel); el.setAttribute("aria-selected", String(i === sel)); if (i === sel) el.scrollIntoView({ block: "nearest" }); });
    const close = () => { box.classList.add("out"); setTimeout(() => box.remove(), 200); document.removeEventListener("keydown", key, true); };
    const key = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === "Enter" && items[sel]) { e.preventDefault(); location.hash = items[sel].getAttribute("href").slice(1); close(); }
    };
    document.addEventListener("keydown", key, true);
    let tm; q.oninput = () => { clearTimeout(tm); tm = setTimeout(paint, 90); };
    box.onclick = (e) => { if (e.target === box) close(); else if (e.target.closest("a")) close(); };
    paint();
    requestAnimationFrame(() => { box.classList.add("on"); q.focus(); });
  }
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); openSearch(); }
  });
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest('[data-act="search"]')) openSearch(); });
  const searchBtn = () => `<button class="pill-btn search-btn" data-act="search" aria-label="${esc(t("search"))}" title="${esc(t("search"))} ( / )">${ICON.search}</button>`;

  // ================================================================ timestamped notes
  const TS = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;
  const tsSec = (m) => (m[3] !== undefined ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : (+m[1] * 60 + +m[2]));
  function parseStamps(text) {
    const out = [];
    String(text || "").split("\n").forEach((line) => {
      const rest = line.replace(TS, "").trim().slice(0, 60);
      for (const m of line.matchAll(TS)) out.push({ sec: tsSec(m), label: m[0].slice(1, -1), text: rest });
    });
    return out.sort((a, b) => a.sec - b.sec);
  }
  const notesTools = () => `<div class="nt-bar"><button type="button" class="btn sm" id="tsAdd">${ICON.clock} ${t("addStamp")}</button><small>${t("stampHelp")}</small></div><div class="ts-list" id="tsList"></div>`;
  function bindNotes() {
    const ta = document.getElementById("notes"), add = document.getElementById("tsAdd"), list = document.getElementById("tsList");
    if (!ta || !add) return;
    const paint = () => {
      const st = parseStamps(ta.value);
      list.innerHTML = st.map((x) => `<button type="button" class="ts-chip" data-sec="${x.sec}"><b dir="ltr">${esc(x.label)}</b>${x.text ? `<span>${esc(x.text)}</span>` : ""}</button>`).join("");
      markers(st);
    };
    const markers = (st) => {
      const seek = document.querySelector(".op-seek"), d = S.player?.duration;
      if (!seek) return;
      seek.querySelectorAll(".ts-mark").forEach((m) => m.remove());
      if (!d) return;
      st.filter((x) => x.sec <= d).forEach((x) => {
        const m = document.createElement("span"); m.className = "ts-mark"; m.style.left = (x.sec / d) * 100 + "%"; m.title = x.label + (x.text ? " · " + x.text : "");
        seek.append(m);
      });
    };
    add.onclick = () => {
      const p = S.player; const sec = p && p.ready ? Math.floor(p.yt.getCurrentTime() || 0) : 0;
      const stamp = `[${fmtTime(sec)}] `;
      const pos = ta.selectionStart ?? ta.value.length, before = ta.value.slice(0, pos), after = ta.value.slice(pos);
      const lead = before && !before.endsWith("\n") ? "\n" : "";
      ta.value = before + lead + stamp + after;
      const at = (before + lead + stamp).length;
      ta.closest("details").open = true;
      ta.focus(); ta.setSelectionRange(at, at);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      FX.bump(add);
    };
    list.onclick = (e) => {
      const c = e.target.closest("[data-sec]"); if (!c || !S.player) return;
      S.player.seek(+c.dataset.sec); S.player.play();
      document.getElementById("player")?.scrollIntoView({ behavior: FX.calm() ? "auto" : "smooth", block: "center" });
    };
    ta.addEventListener("input", paint);
    paint();
    let tries = 0; const wait = setInterval(() => { if (S.player?.duration || ++tries > 40) { clearInterval(wait); paint(); } }, 500);
    S.cleanups.push(() => clearInterval(wait));
  }

  // ================================================================ charts (insights)
  let gid = 0;
  const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; };
  const fmtN = (v) => num(Math.round(v));
  function lineChart(el, pts, { fmt = fmtN, color = "#5C93FF", h = 210, yMax, xEvery } = {}) {
    const W = Math.max(260, el.clientWidth || 300), H = h, L = 38, R = 14, T = 16, B = 28;
    const max = niceMax(yMax ?? Math.max(1, ...pts.map((p) => p.y)));
    const step = pts.length > 1 ? (W - L - R) / (pts.length - 1) : 0;
    const X = (i) => (pts.length > 1 ? L + i * step : (L + W - R) / 2), Y = (v) => T + (H - T - B) * (1 - v / max);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
    const area = `${line}L${X(pts.length - 1).toFixed(1)},${Y(0)}L${X(0).toFixed(1)},${Y(0)}Z`;
    const id = "lg" + ++gid, every = xEvery || Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor((W - L - R) / 64))));
    const ticks = [0, max / 2, max];
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(el.dataset.label || "")}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((v) => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ch-ax" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join("")}
      ${pts.map((p, i) => (i % every === 0 || i === pts.length - 1) ? `<text class="ch-ax" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>` : "").join("")}
      <path class="ch-area" d="${area}" fill="url(#${id})"/>
      <path class="ch-line" d="${line}" stroke="${color}" pathLength="1"/>
      <line class="ch-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <circle class="ch-dot" r="5" fill="${color}" visibility="hidden"/>
      <rect class="ch-hit" x="${L - 10}" y="${T}" width="${W - L - R + 20}" height="${H - T - B}" fill="transparent"/></svg>`;
    const svg = el.querySelector("svg"), cross = svg.querySelector(".ch-cross"), dot = svg.querySelector(".ch-dot");
    const move = (e) => {
      const r = svg.getBoundingClientRect(), px = e.clientX - r.left;
      const i = pts.length > 1 ? Math.max(0, Math.min(pts.length - 1, Math.round((px - L) / step))) : 0;
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(pts[i].y)); dot.setAttribute("visibility", "visible");
      tip.show(`<b>${esc(pts[i].tip || pts[i].label)}</b><span>${pts[i].tipVal || fmt(pts[i].y)}</span>`, r.left + X(i), r.top + Y(pts[i].y));
    };
    const out = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hide(); };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move); svg.addEventListener("pointerleave", out);
  }
  function stackChart(el, cols, series, { h = 220 } = {}) {
    const W = Math.max(260, el.clientWidth || 300), H = h, L = 34, R = 10, T = 12, B = 28;
    const max = niceMax(Math.max(1, ...cols.map((c) => series.reduce((a, s) => a + (c.v[s.key] || 0), 0))));
    const slot = (W - L - R) / cols.length, bw = Math.min(38, slot * 0.62), Y = (v) => T + (H - T - B) * (1 - v / max);
    const every = Math.max(1, Math.ceil(cols.length / Math.floor((W - L - R) / 56)));
    let bars = "";
    cols.forEach((c, i) => {
      let base = 0; const x = L + i * slot + (slot - bw) / 2;
      series.forEach((s) => {
        const v = c.v[s.key] || 0; if (!v) return;
        const y1 = Y(base + v), y0 = Y(base), hh = Math.max(1, y0 - y1 - (base ? 2 : 0));
        bars += `<rect class="ch-bar" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="3" fill="${s.color}" style="--d:${i * 40}ms" data-tip="${esc(`<b>${esc(c.tip)}</b><span>${esc(s.name)}: ${num(v)}</span>`)}"/>`;
        base += v;
      });
      if (i % every === 0) bars += `<text class="ch-ax" x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(c.label)}</text>`;
    });
    el.innerHTML = `<div class="ch-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(el.dataset.label || "")}">
      ${[0, max / 2, max].map((v) => `<line class="ch-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ch-ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmtN(v)}</text>`).join("")}
      ${bars}</svg>`;
  }
  // one floating tooltip for every chart
  const tip = (() => {
    let el = null;
    const ensure = () => { if (!el) { el = document.createElement("div"); el.className = "ch-tip"; el.setAttribute("role", "tooltip"); document.body.append(el); } return el; };
    return {
      show(html, x, y) { const e = ensure(); e.innerHTML = html; e.hidden = false; const w = e.offsetWidth; e.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px"; e.style.top = Math.max(8, y - e.offsetHeight - 14) + "px"; },
      hide() { if (el) el.hidden = true; },
    };
  })();
  document.addEventListener("pointerover", (e) => {
    const m = e.target.closest && e.target.closest("[data-tip]"); if (!m) return;
    const r = m.getBoundingClientRect(); tip.show(m.dataset.tip, r.left + r.width / 2, r.top);
    m.addEventListener("pointerleave", () => tip.hide(), { once: true });
  });

  // ================================================================ insights tab
  function retention(views, dur) {
    return Array.from({ length: 21 }, (_, i) => {
      const p = i * 5, n = views.filter((v) => (v.completed ? 100 : dur ? (+v.max_seconds / dur) * 100 : 0) >= p).length;
      return { label: `${num(p)}%`, y: views.length ? Math.round((n / views.length) * 100) : 0, tip: t("reachedPct", { p: num(p) }), tipVal: `${num(views.length ? Math.round((n / views.length) * 100) : 0)}% · ${num(n)} / ${num(views.length)}` };
    });
  }
  function medianStop(views, dur) {
    const a = views.map((v) => (v.completed ? 100 : dur ? Math.min(100, (+v.max_seconds / dur) * 100) : 0)).sort((x, y) => x - y);
    return a.length ? Math.round(a[Math.floor(a.length / 2)]) : 0;
  }
  async function insightsTab() {
    const scopeSubs = isAdmin() ? S.subjects : S.subjects.filter((s) => s.id === S.profile.subject_id);
    const sids = new Set(scopeSubs.map((s) => s.id));
    const sess = S.sessions.filter((s) => sids.has(s.subject_id));
    const sById = Object.fromEntries(sess.map((s) => [s.id, s]));
    const prof = Object.fromEntries((M.profiles || []).map((p) => [p.id, p]));
    const views = (M.allProgress || []).filter((p) => sById[p.session_id] && (p.completed || +p.max_seconds > 0)).filter((p) => {
      const r = prof[p.user_id]; return !(r?.role === "admin" || (r?.role === "teacher" && r.subject_id === sById[p.session_id].subject_id));
    });
    const now = Date.now();
    const active7 = new Set(views.filter((v) => now - new Date(v.updated_at) < 7 * day).map((v) => v.user_id)).size;
    const done = views.filter((v) => v.completed).length;
    const rates = (M.ratings || []).filter((r) => sById[r.session_id]);
    const avgR = rates.length ? rates.reduce((a, r) => a + r.stars, 0) / rates.length : 0;
    let live = [], dorms = [];
    try { [live, dorms] = await Promise.all([API.listLive(), API.listDorms()]); } catch {}
    live = live.filter((l) => sids.has(l.subject_id));
    const att30 = live.filter((l) => now - new Date(l.starts_at) < 30 * day && new Date(l.starts_at) <= now).reduce((a, l) => a + (l.checked_in || l.attended_count || 0), 0);
    const students = (M.profiles || []).filter((p) => p.role === "student");
    const new30 = students.filter((p) => now - new Date(p.created_at) < 30 * day).length;
    INS.views = views; INS.sess = sess; INS.live = live; INS.dorms = dorms; INS.subs = scopeSubs;

    const kpi = (v, label, extra = "", dec = 0, suf = "") => `<div class="kpi"><b data-count="${v}" data-dec="${dec}" data-suffix="${suf}">${num(v)}${suf}</b><span>${label}</span>${extra ? `<small>${extra}</small>` : ""}</div>`;
    const top = sess.map((s) => {
      const v = views.filter((x) => x.session_id === s.id), r = rates.filter((x) => x.session_id === s.id), d = +s.duration_seconds || 0;
      return { s, n: v.length, fin: v.length ? Math.round((v.filter((x) => x.completed).length / v.length) * 100) : 0, avg: r.length ? r.reduce((a, x) => a + x.stars, 0) / r.length : 0, rn: r.length, stop: medianStop(v, d) };
    }).sort((a, b) => b.n - a.n);
    const withViews = top.filter((x) => x.n >= 2);
    const attention = withViews.filter((x) => x.fin < 50).sort((a, b) => a.fin - b.fin).slice(0, 4);
    INS.top = top;

    const bySub = scopeSubs.map((sub) => {
      const v = views.filter((x) => sById[x.session_id].subject_id === sub.id);
      return { sub, n: v.length, done: v.filter((x) => x.completed).length };
    });
    const maxSub = Math.max(1, ...bySub.map((x) => x.n));

    return `<p class="srow-meta ins-scope">${isAdmin() ? t("insAll") : t("insSubject", { s: esc(I18N.subjectName(scopeSubs[0])) })}</p>
      <div class="kpis">
        ${kpi(active7, t("kpiActive"), t("kpiActiveSub"))}
        ${kpi(views.length, t("kpiViews"), t("kpiViewsSub", { n: num(done) }))}
        ${kpi(views.length ? Math.round((done / views.length) * 100) : 0, t("kpiFinish"), "", 0, "%")}
        ${kpi(Math.round(avgR * 10) / 10, t("kpiRating"), rates.length ? t("ratingsCount", { n: num(rates.length) }) : t("noRatings"), 1)}
        ${kpi(att30, t("kpiDorm"), t("kpiDormSub"))}
        ${isAdmin() ? kpi(students.length, t("kpiStudents"), t("kpiStudentsSub", { n: num(new30) })) : ""}
      </div>
      <div class="ins-grid">
        <section class="card pad ins-wide"><h2>${t("chWeekly")}</h2><p class="srow-meta">${t("chWeeklySub")}</p><div class="chart" data-chart="weekly" data-label="${esc(t("chWeekly"))}"></div></section>
        <section class="card pad"><h2>${t("chSubjects")}</h2><p class="srow-meta">${t("chSubjectsSub")}</p>
          <ul class="hbars">${bySub.map(({ sub, n, done: d }) => `<li style="--c:${esc(tone(sub))}" data-tip="${esc(`<b>${esc(I18N.subjectName(sub))}</b><span>${t("viewsCount", { n: num(n) })} · ${t("finishedCount", { n: num(d) })}</span>`)}">
            <span class="hb-name">${sticker(sub, "xs")} ${esc(I18N.subjectName(sub))}</span>
            <span class="hb-track"><span class="hb-all" style="width:${(n / maxSub) * 100}%"><span class="hb-done" style="width:${n ? (d / n) * 100 : 0}%"></span></span></span>
            <span class="hb-n"><b>${num(n)}</b> <small>· ${num(d)} ✓</small></span></li>`).join("")}</ul>
          <p class="ch-key"><span><i class="k-all"></i>${t("viewsCount", { n: "" }).trim()}</span><span><i class="k-done"></i>${t("finishedCount", { n: "" }).trim()}</span></p></section>
        <section class="card pad"><h2>${t("chDorm")}</h2><p class="srow-meta">${t("chDormSub")}</p><div class="chart" data-chart="dorm" data-label="${esc(t("chDorm"))}">${live.length ? "" : `<p class="empty">${t("chDormEmpty")}</p>`}</div></section>
        <section class="card pad ins-wide"><h2>${t("chDrop")}</h2><p class="srow-meta">${t("chDropSub")}</p>
          ${withViews.length || top.some((x) => x.n) ? `<select id="dropSel" class="ins-select" aria-label="${esc(t("chDrop"))}">${top.filter((x) => x.n).map((x) => `<option value="${esc(x.s.id)}">${esc(I18N.subjectName(subjectById(x.s.subject_id)))} · ${esc(x.s.title)} (${num(x.n)})</option>`).join("")}</select>
          <div class="chart" data-chart="drop" data-label="${esc(t("chDrop"))}"></div><p class="srow-meta" id="dropNote"></p>` : `<p class="empty">${t("noViewers")}</p>`}</section>
        <section class="card pad ins-wide"><h2>${t("chTop")}</h2>
          ${top.some((x) => x.n) ? `<div class="table-wrap flat"><table class="ptable ins-table"><thead><tr><th>${t("title")}</th><th>${t("viewsCount", { n: "" }).trim()}</th><th>${t("kpiFinish")}</th><th>${t("medianStop")}</th><th>${t("avgRating")}</th></tr></thead>
            <tbody>${top.filter((x) => x.n).slice(0, 10).map((x) => `<tr><td><span class="p-name">${sticker(subjectById(x.s.subject_id), "xs")} <bdi>${esc(x.s.title)}</bdi></span></td><td><b>${num(x.n)}</b></td>
              <td><span class="bar thin ins-mini"><span style="width:${x.fin}%"></span></span> ${num(x.fin)}%</td><td>${num(x.stop)}%</td><td>${x.rn ? `★ ${fmtAvg(x.avg)} <small>(${num(x.rn)})</small>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">${t("noViewers")}</p>`}
          ${attention.length ? `<div class="attn"><h3>⚠ ${t("needsAttention")}</h3><ul>${attention.map((x) => `<li><bdi>${esc(x.s.title)}</bdi> <small>${t("attnLine", { f: num(x.fin), s: num(x.stop) })}</small></li>`).join("")}</ul></div>` : ""}
        </section>
      </div>`;
  }
  const INS = {};
  function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x; }   // weeks start Saturday
  function drawInsights() {
    const fmtW = (d) => d.toLocaleDateString(loc(), { day: "numeric", month: "short" });
    const w0 = weekStart(Date.now()); const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(w0); d.setDate(d.getDate() - (7 - i) * 7); return d; });
    const wk = document.querySelector('[data-chart="weekly"]');
    if (wk) {
      const pts = weeks.map((d) => {
        const end = new Date(d); end.setDate(end.getDate() + 7);
        const v = INS.views.filter((x) => { const u = new Date(x.updated_at); return u >= d && u < end; });
        const n = new Set(v.map((x) => x.user_id)).size;
        return { label: fmtW(d), y: n, tip: t("weekOf", { d: fmtW(d) }), tipVal: `${t("studentsN", { n: num(n) })} · ${t("viewsCount", { n: num(v.length) })}` };
      });
      lineChart(wk, pts, { color: "#5C93FF" });
    }
    const dm = document.querySelector('[data-chart="dorm"]');
    if (dm && INS.live.length) {
      const palette = ["#5C93FF", "#8FE85A", "#FF7AD9"];
      const used = INS.dorms.filter((d) => INS.live.some((l) => l.dorm_id === d.id));
      const series = used.slice(0, 3).map((d, i) => ({ key: d.id, name: dormLabel(d), color: palette[i] }));
      if (used.length > 3) series.push({ key: "other", name: t("otherDorms"), color: "#9A9A9A" });
      const cols = weeks.map((d) => {
        const end = new Date(d); end.setDate(end.getDate() + 7); const v = {};
        INS.live.filter((l) => { const s = new Date(l.starts_at); return s >= d && s < end; }).forEach((l) => {
          const k = series.some((s) => s.key === l.dorm_id) ? l.dorm_id : "other";
          v[k] = (v[k] || 0) + (l.checked_in || l.attended_count || 0);
        });
        return { label: fmtW(d), tip: t("weekOf", { d: fmtW(d) }), v };
      });
      stackChart(dm, cols, series);
    }
    const dr = document.querySelector('[data-chart="drop"]'), sel = document.getElementById("dropSel");
    if (dr && sel) {
      const paint = () => {
        const s = INS.sess.find((x) => x.id === sel.value); if (!s) return;
        const v = INS.views.filter((x) => x.session_id === s.id), d = +s.duration_seconds || 0;
        lineChart(dr, retention(v, d), { color: "#8FE85A", yMax: 100, fmt: (x) => num(Math.round(x)) + "%", xEvery: 4 });
        const stop = medianStop(v, d);
        document.getElementById("dropNote").textContent = stop >= 90 ? t("dropNoteEnd") : t("dropNote", { s: num(stop), m: d ? fmtTime(Math.round((stop / 100) * d)) : "—" });
      };
      sel.onchange = paint; paint();
    }
  }
  function bindInsights() {
    drawInsights();
    let tm; const onR = () => { clearTimeout(tm); tm = setTimeout(() => document.querySelector(".kpis") && drawInsights(), 200); };
    window.addEventListener("resize", onR); S.cleanups.push(() => window.removeEventListener("resize", onR));
  }
  // small retention chart inside the "who watched" window
  function viewerDrop(s, views) {
    if (views.length < 2) return "";
    return `<div class="vw-drop"><h3>${t("chDrop")}</h3><div class="chart sm" id="vwDrop" data-label="${esc(t("chDrop"))}"></div></div>`;
  }
  function drawViewerDrop(s, views) {
    const el = document.getElementById("vwDrop"); if (!el) return;
    lineChart(el, retention(views, +s.duration_seconds || 0), { color: "#8FE85A", yMax: 100, fmt: (x) => num(Math.round(x)) + "%", xEvery: 5, h: 150 });
  }

  // ================================================================ install as an app
  let deferred = null;
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; document.querySelectorAll(".inst-slot").forEach((el) => (el.innerHTML = installChipInner())); });
  window.addEventListener("appinstalled", () => { deferred = null; LS.set("onsite.installed", true); document.querySelectorAll(".inst-slot").forEach((el) => (el.innerHTML = "")); toast("✓ " + t("installed")); });
  const canInstall = () => !standalone() && (deferred || isIOS()) && !LS.get("onsite.installed");
  const installChipInner = () => canInstall() && !LS.get("onsite.instHide") ? `<div class="inst">
      <img src="img/icon-192.png" alt="" width="40" height="40"><span><b>${t("installTitle")}</b><small>${t("installSub")}</small></span>
      <button type="button" class="btn primary sm" data-act="install">${ICON.download} ${t("install")}</button><button type="button" class="icon-btn" data-act="inst-hide" aria-label="${esc(t("dismiss"))}">✕</button></div>` : "";
  const installChip = () => `<div class="inst-slot">${installChipInner()}</div>`;
  document.addEventListener("click", async (e) => {
    const a = e.target.closest && e.target.closest("[data-act]"); if (!a) return;
    if (a.dataset.act === "inst-hide") { LS.set("onsite.instHide", true); a.closest(".inst")?.remove(); }
    if (a.dataset.act === "install") {
      if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); if (r?.outcome === "accepted") LS.set("onsite.installed", true); deferred = null; }
      else iosSheet();
    }
  });
  function iosSheet() {
    const d = document.createElement("dialog"); d.className = "modal";
    d.innerHTML = `<div class="form pad-modal"><div class="modal-head"><h2>${t("installTitle")}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t("cancel"))}">✕</button></div>
      <ol class="ios-steps"><li>${t("ios1")}</li><li>${t("ios2")}</li><li>${t("ios3")}</li></ol></div>`;
    document.body.append(d); d.showModal();
    d.onclick = (e) => { if (e.target === d || e.target.closest("[data-close]")) { d.close(); d.remove(); } };
  }
  if ("serviceWorker" in navigator && window.isSecureContext && !API.demo) {
    const reg = () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("sw", e));
    if (document.readyState === "complete") setTimeout(reg, 1500); else window.addEventListener("load", () => setTimeout(reg, 1500));
  }

  // ================================================================ account extras
  function accountExtras() {
    const m = FX.pref();
    return `<div class="card pad form">
      <h2>${t("appSettings")}</h2>
      <div class="seg"><span>${t("motion")}</span>
        <button type="button" data-motion="full" aria-pressed="${m === "full"}">✨ ${t("motionFull")}</button>
        <button type="button" data-motion="calm" aria-pressed="${m === "calm"}">🌙 ${t("motionCalm")}</button></div>
      <small>${t("motionHelp")}</small>
      ${boardReady() && S.profile.role === "student" ? `<label class="switch-row"><input type="checkbox" id="lbOpt2" ${S.profile.show_on_board ? "checked" : ""}><span class="sw" aria-hidden="true"></span><span>${t("showMe")}<small>${t("showMeHelp")}</small></span></label>` : ""}
      ${canInstall() ? `<button type="button" class="btn" data-act="install">${ICON.download} ${t("installTitle")}</button>` : standalone() ? `<p class="srow-meta">✓ ${t("runningAsApp")}</p>` : ""}
    </div>`;
  }
  function bindAccount() {
    document.querySelectorAll("[data-motion]").forEach((b) => (b.onclick = () => {
      FX.setMotion(b.dataset.motion);
      document.querySelectorAll("[data-motion]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (b.dataset.motion === "full") FX.cheer("small", { x: 0.5, y: 0.5 });
    }));
    const o = document.getElementById("lbOpt2");
    if (o) o.onchange = async () => {
      try { await API.updateProfile({ show_on_board: o.checked }); S.profile.show_on_board = o.checked; saveSnap(); toast(o.checked ? t("lbOn") : t("lbOff")); }
      catch (e) { o.checked = !o.checked; fail(e); }
    };
  }

  return {
    restore, saveSnap, afterLoad, loadExtras, netPill, setOffline,
    annStack, paintAnnStack, cheerAnn, annTab, bindAnn,
    levelCard, progressExtras, bindProgress, avatarLevel, checkBadges, onComplete, myStats, level, badges,
    homeRows, newCount, searchBtn, openSearch, notesTools, bindNotes,
    insightsTab, bindInsights, viewerDrop, drawViewerDrop,
    installChip, accountExtras, bindAccount,
  };
})();
