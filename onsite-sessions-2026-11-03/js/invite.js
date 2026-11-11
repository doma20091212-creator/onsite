// ON-site Sessions: invite links, points and the prizes leaderboard,
// plus the STEM-school picker used on sign-up, the info step and Account.
// Uses helpers from app.js (S, M, esc, t, num, shell, …) at call time.

// ---------------------------------------------------------------- STEM schools
// The 20 STEM schools listed by the Ministry for 2026/27 admissions. The English name is what's saved.
const STEM_SCHOOLS = [
  ["New Cairo STEM School", "مدرسة القاهرة الجديدة المشتركة للمتفوقين (STEM)"],
  ["6th of October STEM School (Boys)", "مدرسة 6 أكتوبر بنين للمتفوقين (STEM)"],
  ["6th of October STEM School, District 11", "مدرسة 6 أكتوبر الحي 11 المشتركة (STEM)"],
  ["Maadi STEM School (Girls)", "مدرسة المعادي بنات للمتفوقين (STEM)"],
  ["Obour STEM School (Qalyubia)", "مدرسة القليوبية (العبور) المشتركة (STEM)"],
  ["Alexandria STEM School", "مدرسة الإسكندرية المشتركة (STEM)"],
  ["Dakahlia STEM School", "مدرسة الدقهلية المشتركة (STEM)"],
  ["Gharbia STEM School", "مدرسة الغربية المشتركة (STEM)"],
  ["Sharqia STEM School", "مدرسة الشرقية المشتركة (STEM)"],
  ["Kafr El Sheikh STEM School", "مدرسة كفر الشيخ المشتركة (STEM)"],
  ["Sers El Layan STEM School (Girls)", "مدرسة سرس الليان بنات (STEM)"],
  ["Sadat City STEM School (Boys)", "مدرسة مدينة السادات بنين (STEM)"],
  ["Ismailia STEM School", "مدرسة الإسماعيلية المشتركة (STEM)"],
  ["Red Sea STEM School", "مدرسة البحر الأحمر المشتركة (STEM)"],
  ["Fayoum STEM School (Boys)", "مدرسة الفيوم بنين (STEM)"],
  ["Beni Suef STEM School", "مدرسة بني سويف المشتركة (STEM)"],
  ["Minya STEM School (Boys)", "مدرسة المنيا بنين (STEM)"],
  ["Assiut STEM School", "مدرسة أسيوط المشتركة (STEM)"],
  ["Qena STEM School", "مدرسة قنا المشتركة (STEM)"],
  ["Luxor STEM School", "مدرسة الأقصر المشتركة (STEM)"],
];
const schoolLabel = (v) => { const s = STEM_SCHOOLS.find(([en]) => en === v); return s ? (I18N.lang === "ar" ? s[1] : s[0]) : (v || ""); };
const isStem = (v) => STEM_SCHOOLS.some(([en]) => en === v);
// A dropdown of the STEM schools + "Other". A hidden input called "school" always holds the answer,
// so forms read it with f.school.value like before.
function schoolField(value = "") {
  const other = !!value && !isStem(value);
  return `<div class="school-field">
    <label>${t("whatSchool")}<select name="schoolSel" required>
      <option value="">${t("chooseSchool")}</option>
      <optgroup label="${esc(t("stemSchools"))}">${STEM_SCHOOLS.map(([en, ar]) => `<option value="${esc(en)}" ${en === value ? "selected" : ""}>${esc(I18N.lang === "ar" ? ar : en)}</option>`).join("")}</optgroup>
      <option value="__other" ${other ? "selected" : ""}>${t("otherSchool")}</option>
    </select></label>
    <label class="school-other" ${other ? "" : "hidden"}>${t("schoolNameLabel")}<input name="schoolOther" maxlength="120" autocomplete="organization" placeholder="${esc(t("schoolPh"))}" value="${other ? esc(value) : ""}"></label>
    <input type="hidden" name="school" value="${esc(value)}">
  </div>`;
}
function bindSchool(f) {
  const sel = f.querySelector('[name="schoolSel"]'); if (!sel) return;
  const box = f.querySelector(".school-other"), other = f.querySelector('[name="schoolOther"]'), hid = f.querySelector('input[name="school"]');
  const sync = () => {
    box.hidden = sel.value !== "__other";
    hid.value = sel.value === "__other" ? other.value.trim() : sel.value;
  };
  sel.onchange = () => { sync(); if (sel.value === "__other") other.focus(); };
  other.oninput = sync;
  sync();
}
// Friendly text for the "one account per phone number" rule
const isPhoneTaken = (e) => /phone_taken|already belongs to another account/i.test(String(e?.message || e || ""));
const phoneErrText = (e) => isPhoneTaken(e) || /database error saving new user/i.test(String(e?.message || "")) ? t("phoneTaken") : (e?.message || String(e));

// ---------------------------------------------------------------- pending invite (from a link)
const REF_KEY = "onsite.ref";
function savePendingRef(code) {
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (c) try { localStorage.setItem(REF_KEY, JSON.stringify({ code: c, at: Date.now() })); } catch {}
}
function pendingRef() {
  try {
    const v = JSON.parse(localStorage.getItem(REF_KEY));
    if (v && v.code && Date.now() - v.at < 30 * 864e5) return v.code;
  } catch {}
  return null;
}
const clearPendingRef = () => { try { localStorage.removeItem(REF_KEY); } catch {} };

// ---------------------------------------------------------------- invite page
const INV = { ready: null, contest: null, board: null, mine: null, code: null };
const GIFT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 8v12.5M12 8S10.5 3.5 8 4.2C6 4.8 6.8 8 12 8Zm0 0s1.5-4.5 4-3.8c2 .6 1.2 3.8-4 3.8Z"/></svg>';
const LINK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/></svg>';
const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
const SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
const codeKey = () => "onsite.refcode." + (S.user?.id || "x");
const inviteUrl = (code) => location.origin + location.pathname + "#/join/" + code;
const ppi = () => +(INV.contest?.points_per_invite || CFG.POINTS_PER_INVITE || 10);
const contestOpen = (c = INV.contest) => !!c && (!c.ends_at || new Date(c.ends_at) > new Date()) && (!c.starts_at || new Date(c.starts_at) <= new Date());
const hasPrizes = (c = INV.contest) => !!c && [c.prize1, c.prize2, c.prize3].some((x) => String(x || "").trim());

async function loadContest() {
  try { INV.contest = await API.getContest(); INV.ready = !!INV.contest; } catch { INV.ready = false; INV.contest = null; }
  S.contest = INV.contest;
}
async function loadInvite() {
  try { INV.code = localStorage.getItem(codeKey()); } catch {}
  const [c, b, m] = await Promise.all([API.getContest().catch(() => null), API.inviteBoard().catch(() => null), API.myReferrals().catch(() => null)]);
  INV.contest = c; INV.board = b; INV.mine = m; INV.ready = !!c && !!b;
}
function countdown(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return t("contestEnded");
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return t("endsIn", { t: d ? t("dh", { d: num(d), h: num(h) }) : t("hm", { h: num(h), m: num(m) }) });
}
function linkBox() {
  if (!INV.code) return `<button type="button" class="btn primary inv-get" id="invGet">${LINK} ${t("getLink")}</button>`;
  const url = inviteUrl(INV.code);
  return `<div class="inv-linkbox">
    <label class="sr" for="invUrl">${t("yourLink")}</label>
    <div class="inv-url"><input id="invUrl" value="${esc(url)}" readonly dir="ltr"><button type="button" class="btn primary" id="invCopy">${COPY} <span>${t("copy")}</span></button></div>
    <div class="inv-share">
      <a class="btn inv-wa" href="https://wa.me/?text=${encodeURIComponent(t("shareMsg", { u: url }))}" target="_blank" rel="noopener">${WA_ICON} WhatsApp</a>
      ${navigator.share ? `<button type="button" class="btn" id="invShare">${SHARE} ${t("share")}</button>` : ""}
      ${EXTRA.shareBtn("btn")}
      <span class="inv-code" title="${esc(t("yourCode"))}">${t("yourCode")}: <b dir="ltr">${esc(INV.code)}</b></span>
    </div></div>`;
}
function prizeCards() {
  const c = INV.contest;
  if (!hasPrizes(c)) return isAdmin() ? `<p class="note">${t("noPrizesAdmin")}</p>` : "";
  const P = [["🥇", c.prize1, "p1"], ["🥈", c.prize2, "p2"], ["🥉", c.prize3, "p3"]];
  return `<section class="block"><h2>${t("prizes")}</h2>
    <div class="prizes">${P.map(([m, txt, cls], i) => String(txt || "").trim() ? `<div class="prize ${cls}"><span class="prize-m" aria-hidden="true">${m}</span><small>${t("placeN", { n: num(i + 1) })}</small><b><bdi>${esc(txt)}</bdi></b></div>` : "").join("")}</div>
    ${c.ends_at ? `<p class="inv-ends ${contestOpen(c) ? "" : "is-over"}" id="invEnds">⏳ ${countdown(c.ends_at)}</p>` : ""}</section>`;
}
function boardHtml() {
  const rows = INV.board || [];
  if (!rows.length) return `<p class="empty">${t("invBoardEmpty")}</p>`;
  const top = Math.max(1, rows[0].invites), me = rows.find((r) => r.is_me);
  const show = rows.slice(0, 20);
  if (me && !show.includes(me)) show.push(me);
  const medal = ["🥇", "🥈", "🥉"];
  return `<ol class="lb-list inv-board">${show.map((r) => `<li class="${r.is_me ? "is-me" : ""} ${r.rank <= 3 ? "podium p" + r.rank : ""}">
      <span class="lb-rank">${r.rank <= 3 ? medal[r.rank - 1] : num(r.rank)}</span>
      <span class="lb-name"><bdi>${esc(r.name || "—")}</bdi>${r.is_me ? ` <span class="status">${t("you")}</span>` : ""}${r.school ? `<small class="lb-school"><bdi>${esc(schoolLabel(r.school))}</bdi></small>` : ""}</span>
      <span class="lb-bar"><span class="bar thin"><span style="width:${Math.round((r.invites / top) * 100)}%"></span></span></span>
      <span class="lb-n"><span><b>${num(r.points)}</b> <small>${t("pts")}</small></span><small class="lb-min">${r.invites === 1 ? t("oneInvite") : t("invitesN", { n: num(r.invites) })}</small></span></li>`).join("")}</ol>`;
}
function mineHtml() {
  const list = INV.mine || [];
  if (!list.length) return `<p class="empty">${t("noInvitesYet")}</p>`;
  const st = { ok: ["s-done", "✓ " + t("stCounted")], no_phone: ["", t("stNoPhone")], rejected: ["s-req", t("stRejected")], outside: ["s-new", t("stOutside")] };
  return `<ul class="recent inv-mine">${list.map((r) => `<li><span class="recent-item"><span class="att-av" aria-hidden="true">${esc((r.name || "?")[0])}</span>
    <span><b><bdi>${esc(r.name || "—")}</bdi></b><small>${t("joinedOn", { d: fmtDay(r.joined_at) })}</small></span>
    <span class="status ${st[r.state]?.[0] || ""}">${st[r.state]?.[1] || r.state}</span></span></li>`).join("")}</ul>`;
}
async function viewInvite() {
  await loadInvite();
  if (!INV.ready) return shell(`<h1 class="page-title">${t("invite")}</h1>${isAdmin() ? `<p class="note">${t("refSetup")}</p>` : `<p class="empty">${t("invSoon")}</p>`}`, "invite");
  const me = (INV.board || []).find((r) => r.is_me);
  const counted = (INV.mine || []).filter((r) => r.state === "ok").length;
  const pts = me ? me.points : counted * ppi();
  const student = S.profile.role === "student";
  return shell(`
    <section class="inv-hero">
      <span class="inv-gift" aria-hidden="true">🎁</span>
      <p class="script">${t("invTag")}</p>
      <h1>${t("invTitle")}</h1>
      <p class="inv-sub">${t("invSub", { p: num(ppi()) })}</p>
      <ul class="inv-stats">
        <li><b data-count="${pts}">${num(pts)}</b><span>${t("points")}</span></li>
        <li><b data-count="${me ? me.invites : counted}">${num(me ? me.invites : counted)}</b><span>${t("friendsJoined")}</span></li>
        <li><b dir="ltr">${me ? "#" + num(me.rank) : "—"}</b><span>${t("yourRank")}</span></li>
      </ul>
      <div id="invLink">${linkBox()}</div>
      ${student ? "" : `<p class="srow-meta">${t("staffNotRanked")}</p>`}
    </section>
    ${prizeCards()}
    <div class="inv-grid">
      <section class="card pad"><h2>🏆 ${t("invBoard")}</h2><p class="srow-meta">${t("invBoardSub")}</p>${boardHtml()}</section>
      <div class="inv-side">
        <section class="card pad"><h2>${t("yourInvites")}</h2>${mineHtml()}</section>
        <section class="card pad inv-how"><h2>${t("howItWorks")}</h2>
          <ol><li>${t("how1")}</li><li>${t("how2")}</li><li>${t("how3", { p: num(ppi()) })}</li></ol>
          <p class="srow-meta">${t("invRules")}</p></section>
      </div>
    </div>`, "invite");
}
function bindInvite() {
  const box = document.getElementById("invLink"); if (!box) return;
  const wire = () => {
    const get = document.getElementById("invGet");
    if (get) get.onclick = async () => {
      get.disabled = true; get.classList.add("is-busy");
      try {
        INV.code = await API.getRefCode();
        try { localStorage.setItem(codeKey(), INV.code); } catch {}
        box.innerHTML = linkBox(); box.classList.add("fx-grow"); wire();
        FX.confetti({ count: 70, spread: 70, origin: originOfEl(box) });
        document.getElementById("invUrl")?.select();
      } catch (e) { get.disabled = false; get.classList.remove("is-busy"); fail(e); }
    };
    const copy = document.getElementById("invCopy");
    if (copy) copy.onclick = async () => {
      const inp = document.getElementById("invUrl");
      let ok = false;
      try { await navigator.clipboard.writeText(inp.value); ok = true; } catch { inp.select(); try { ok = document.execCommand("copy"); } catch {} }
      if (ok) { copy.querySelector("span").textContent = t("copied"); copy.classList.add("is-copied"); FX.bump(copy); toast("✓ " + t("linkCopied")); setTimeout(() => { copy.querySelector("span").textContent = t("copy"); copy.classList.remove("is-copied"); }, 2200); }
      else { inp.select(); toast(t("copyManual")); }
    };
    const sh = document.getElementById("invShare");
    if (sh) sh.onclick = () => navigator.share({ title: "ON-site", text: t("shareMsg", { u: "" }).trim(), url: inviteUrl(INV.code) }).catch(() => {});
    document.getElementById("invUrl")?.addEventListener("focus", (e) => e.target.select());
  };
  wire();
  const ends = document.getElementById("invEnds");
  if (ends && INV.contest?.ends_at) {
    const tm = setInterval(() => { if (!ends.isConnected) return clearInterval(tm); ends.textContent = "⏳ " + countdown(INV.contest.ends_at); }, 30000);
    S.cleanups.push(() => clearInterval(tm));
  }
}
const originOfEl = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }; };

// small card on Home that points to the invite page
function homePromo() {
  if (!INV.ready && !S.contest) return "";
  const c = S.contest; if (!c || !contestOpen(c)) return "";
  return `<a class="inv-promo" href="#/invite"><span class="inv-promo-ic" aria-hidden="true">🎁</span>
    <span><b>${t("promoTitle")}</b><small>${hasPrizes(c) ? t("promoPrize", { p: esc(c.prize1 || c.prize2 || c.prize3) }) : t("promoSub", { p: num(ppi()) })}</small></span>
    <span class="btn primary sm">${t("getLink")}</span></a>`;
}

// "someone just joined with your link"
let rtRef = null;
function inviteAfterLoad() {
  if (rtRef || !API.subscribe || !S.user || !S.contest) return;
  rtRef = API.subscribe("referrals", `referrer_id=eq.${S.user.id}`, (p) => {
    if (p.eventType !== "INSERT") return;
    FX.cheer("small", { x: 0.5, y: 0.3 }); FX.buzz([20, 40, 20]);
    toast("🎉 " + t("someoneJoined", { p: num(ppi()) }));
    if (location.hash.startsWith("#/invite")) route();
  });
}

// ---------------------------------------------------------------- admin: Manage → Invites
const toLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);
function countsFor(ref) {
  const c = INV.contest || {};
  const inDates = (r) => (!c.starts_at || r.created_at >= c.starts_at) && (!c.ends_at || r.created_at <= c.ends_at);
  return ref.status === "ok" && !!M.phones?.[ref.referred_id] && inDates(ref);
}
async function invitesTab() {
  if (!isAdmin()) return `<p class="empty">${t("notAllowed")}</p>`;
  await loadContest();
  try { M.referrals = await API.listReferrals(); } catch { M.referrals = null; }
  if (!INV.ready || !M.referrals) return `<p class="note">${t("refSetup")}</p>`;
  const c = INV.contest, prof = Object.fromEntries(M.profiles.map((p) => [p.id, p]));
  const by = {};
  M.referrals.forEach((r) => { const o = (by[r.referrer_id] = by[r.referrer_id] || { n: 0, all: 0, last: "" }); o.all++; if (countsFor(r)) { o.n++; if (r.created_at > o.last) o.last = r.created_at; } });
  const ranking = Object.entries(by).filter(([id, o]) => o.n && prof[id]?.role === "student").sort((a, b) => b[1].n - a[1].n || a[1].last.localeCompare(b[1].last));
  const f = M.rfilter || "all";
  const log = M.referrals.filter((r) => f === "all" || (f === "ok" ? countsFor(r) : f === "rejected" ? r.status === "rejected" : !countsFor(r) && r.status !== "rejected"));
  const when = (iso) => new Date(iso).toLocaleString(I18N.lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const person = (id) => { const p = prof[id]; return p ? `<bdi>${esc(p.full_name || "—")}</bdi>` : `<i>${t("deletedAccount")}</i>`; };
  const ph = (id) => (M.phones?.[id] ? phoneText(M.phones[id]) : `<small class="no-ph">${t("noPhone")}</small>`);
  return `<div class="ann-grid">
    <form class="card pad form" id="contestForm" novalidate>
      <h2>🎁 ${t("contestSettings")}</h2>
      <label>${t("pointsPerInvite")}<input type="number" name="ppi" min="1" max="10000" value="${c.points_per_invite}"></label>
      <div class="prize-inputs">
        <label>🥇 ${t("placeN", { n: num(1) })}<input name="p1" maxlength="120" value="${esc(c.prize1)}" placeholder="${esc(t("prizePh"))}"></label>
        <label>🥈 ${t("placeN", { n: num(2) })}<input name="p2" maxlength="120" value="${esc(c.prize2)}"></label>
        <label>🥉 ${t("placeN", { n: num(3) })}<input name="p3" maxlength="120" value="${esc(c.prize3)}"></label>
      </div>
      <div class="two">
        <label>${t("contestStarts")}<input type="datetime-local" name="starts" value="${toLocal(c.starts_at)}"><small>${t("contestStartsHelp")}</small></label>
        <label>${t("contestEnds")}<input type="datetime-local" name="ends" value="${toLocal(c.ends_at)}"><small>${t("contestEndsHelp")}</small></label>
      </div>
      <p class="err" role="alert"></p>
      <div class="modal-foot"><button type="button" class="btn sm" id="newRound">${t("newRound")}</button><button class="btn primary">${t("save")}</button></div>
    </form>
    <section class="card pad">
      <h2>🏆 ${t("invBoard")} <span class="srow-meta">${t("adminFullNames")}</span></h2>
      ${ranking.length ? `<ol class="lb-list">${ranking.slice(0, 15).map(([id, o], i) => `<li class="${i < 3 ? "podium p" + (i + 1) : ""}">
        <span class="lb-rank">${i < 3 ? ["🥇", "🥈", "🥉"][i] : num(i + 1)}</span>
        <span class="lb-name">${person(id)}<small class="lb-school">${esc(schoolLabel(prof[id]?.school))}</small></span>
        <span class="lb-ph">${M.phones?.[id] ? phoneText(M.phones[id]) + waLink(M.phones[id], prof[id]?.full_name || "", t("winnerMsg", { n: (prof[id]?.full_name || "").split(" ")[0] })) : ""}</span>
        <span class="lb-n"><span><b>${num(o.n * c.points_per_invite)}</b> <small>${t("pts")}</small></span><small class="lb-min">${t("invitesN", { n: num(o.n) })}${o.all > o.n ? ` · ${t("notCountedN", { n: num(o.all - o.n) })}` : ""}</small></span></li>`).join("")}</ol>` : `<p class="empty">${t("invBoardEmpty")}</p>`}
    </section></div>
    <section class="card pad mt-card">
      <div class="lb-head"><h2>${t("inviteLog")} <span class="srow-meta">${num(M.referrals.length)}</span></h2>
        <div class="chips" role="group">${[["all", t("allOpt")], ["ok", t("stCounted")], ["pending", t("stNotCounted")], ["rejected", t("stRejectedAdmin")]].map(([k, lab]) => `<button type="button" class="chip" data-rf="${k}" aria-pressed="${f === k}">${lab}</button>`).join("")}</div></div>
      <p class="srow-meta">${t("inviteLogHelp")}</p>
      ${log.length ? `<div class="table-wrap flat"><table class="ptable"><thead><tr><th>${t("when")}</th><th>${t("newMember")}</th><th>${t("phone")}</th><th>${t("school")}</th><th>${t("invitedByCol")}</th><th>${t("statusCol")}</th><th></th></tr></thead>
        <tbody>${log.map((r) => `<tr><td>${when(r.created_at)}</td><td><b>${person(r.referred_id)}</b></td><td>${ph(r.referred_id)}</td><td class="school-cell">${esc(schoolLabel(prof[r.referred_id]?.school) || "—")}</td><td>${person(r.referrer_id)}</td>
          <td>${r.status === "rejected" ? `<span class="status s-req">${t("stRejectedAdmin")}</span>` : countsFor(r) ? `<span class="status s-done">✓ ${t("stCounted")}</span>` : `<span class="status s-new">${!M.phones?.[r.referred_id] ? t("stNoPhone") : t("stOutside")}</span>`}</td>
          <td>${r.status === "rejected" ? `<button type="button" class="btn sm" data-rstat="ok" data-rid="${esc(r.referred_id)}">${t("restore")}</button>` : `<button type="button" class="btn sm danger" data-rstat="rejected" data-rid="${esc(r.referred_id)}">${t("reject")}</button>`}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">${t("noInvitesLog")}</p>`}
    </section>`;
}
function bindInvites() {
  const f = document.getElementById("contestForm"); if (!f) return;
  const save = async (fields) => {
    const err = f.querySelector(".err"); err.textContent = "";
    try { INV.contest = await API.saveContest(fields); S.contest = INV.contest; toast(t("saved")); route(); } catch (e) { err.textContent = e.message; }
  };
  f.onsubmit = (e) => {
    e.preventDefault();
    const n = Math.round(+f.ppi.value);
    if (!(n >= 1 && n <= 10000)) { f.querySelector(".err").textContent = t("pointsBad"); return; }
    const starts = fromLocal(f.starts.value), ends = fromLocal(f.ends.value);
    if (starts && ends && ends <= starts) { f.querySelector(".err").textContent = t("datesBad"); return; }
    save({ points_per_invite: n, prize1: f.p1.value.trim(), prize2: f.p2.value.trim(), prize3: f.p3.value.trim(), starts_at: starts, ends_at: ends });
  };
  document.getElementById("newRound").onclick = () => { if (confirm(t("newRoundConfirm"))) save({ starts_at: new Date().toISOString(), ends_at: null }); };
  document.getElementById("mbody").onclick = async (e) => {
    const chip = e.target.closest("[data-rf]");
    if (chip) { M.rfilter = chip.dataset.rf; route(); return; }
    const b = e.target.closest("[data-rstat]"); if (!b) return;
    if (b.dataset.rstat === "rejected" && !confirm(t("rejectConfirm"))) return;
    b.disabled = true;
    try { await API.setReferralStatus(b.dataset.rid, b.dataset.rstat); toast(t("saved")); route(); } catch (er) { b.disabled = false; fail(er); }
  };
}

// ---------------------------------------------------------------- People tab helpers
const normPh = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("0020")) d = "0" + d.slice(4); else if (d.startsWith("20") && d.length === 12) d = "0" + d.slice(2); return d; };
function sharedNumbers() {
  const seen = {}, out = new Set();
  Object.entries(M.phones || {}).forEach(([id, p]) => { const k = normPh(p); if (!k) return; (seen[k] = seen[k] || []).push(id); });
  Object.values(seen).forEach((ids) => { if (ids.length > 1) ids.forEach((id) => out.add(id)); });
  return out;
}
const fmtJoined = (iso) => iso ? new Date(iso).toLocaleString(I18N.lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
function agoText(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso)) / 1000, rtf = new Intl.RelativeTimeFormat(I18N.lang === "ar" ? "ar" : "en", { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (s < 86400 * 45) return rtf.format(-Math.round(s / 86400), "day");
  return rtf.format(-Math.round(s / (86400 * 30)), "month");
}
