// ON-site Sessions — pages and routing
const $app = document.getElementById("app");
const S = { user: null, profile: null, subjects: [], sessions: [], progress: {}, attendance: [], player: null, cleanups: [] };

// ---------------------------------------------------------------- helpers
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const go = (path) => { if (location.hash !== "#" + path) location.hash = path; else route(); };
const subjectById = (id) => S.subjects.find((s) => s.id === id);
const subjectBySlug = (slug) => S.subjects.find((s) => s.slug === slug);
const isStaff = () => ["teacher", "admin"].includes(S.profile?.role);
const isAdmin = () => S.profile?.role === "admin";
const thumb = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
const visibleSessions = () => S.sessions.filter((s) => s.published);
const sessionsOf = (sid) => visibleSessions().filter((s) => s.subject_id === sid).sort((a, b) => a.position - b.position);
const durOf = (s) => s.duration_seconds || S.progress[s.id]?.duration_seconds || 0;
const fmtMin = (sec) => sec ? `${Math.max(1, Math.round(sec / 60))} ${t("min")}` : "";
const num = (n) => new Intl.NumberFormat(I18N.lang === "ar" ? "ar-EG" : "en").format(n);

function pctOf(s) {
  const p = S.progress[s.id];
  if (!p) return 0;
  if (p.completed) return 100;
  const d = durOf(s);
  return d ? Math.min(99, Math.round((p.max_seconds / d) * 100)) : 0;
}
function statusOf(s) {
  const pct = pctOf(s);
  if (pct === 100) return { key: "done", label: t("done"), pct };
  if (pct > 0 || S.progress[s.id]) return { key: "prog", label: t("inProgress", { p: num(pct) }), pct };
  return { key: "new", label: t("notStarted"), pct: 0 };
}
function subjectStats(sid) {
  const list = sessionsOf(sid);
  const done = list.filter((s) => pctOf(s) === 100).length;
  const pct = list.length ? Math.round(list.reduce((a, s) => a + pctOf(s), 0) / list.length) : 0;
  return { total: list.length, done, pct };
}
function overallStats() {
  const list = visibleSessions();
  const done = list.filter((s) => pctOf(s) === 100).length;
  const secs = Object.values(S.progress).reduce((a, p) => a + Math.min(p.max_seconds || 0, p.duration_seconds || Infinity), 0);
  const days = new Set(Object.values(S.progress).map((p) => new Date(p.updated_at).toDateString()));
  let streak = 0; const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  return { total: list.length, done, hours: Math.round((secs / 3600) * 10) / 10, streak };
}

function ring(pct, size = 44, stroke = 5) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" style="--circ:${c}"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}
// Neon subject colours for the dark theme; biology + math are the Life vs. Logic collab (green)
const TONES = { math: "#B6FF5C", biology: "#4BE38A", physics: "#8DB8FF", chemistry: "#FF7AD9", geology: "#FFC94D", mechanics: "#FF9A4D", arabic: "#B79BFF", english: "#5CE1FF" };
const tone = (sub) => TONES[sub?.slug] || sub?.color || "#8DB8FF";
const COLLAB = new Set(["math", "biology"]);
const isCollab = (sub) => COLLAB.has(sub?.slug);
const collabMark = (label = "") => `<span class="collab">${label ? `<span class="collab-label">${label}</span>` : ""}<span class="collab-logo"><img src="img/life-vs-logic.png" alt="Life vs. Logic" width="32" height="28"></span>${label ? "" : '<span class="collab-x" aria-hidden="true">×</span>'}<span class="script green">Life vs. Logic</span></span>`;
// Subjects offered on the sign-up form (sign-up happens before the subject list can be loaded)
const SIGNUP_SUBJECTS = [["math", "Math", "الرياضيات"], ["physics", "Physics", "الفيزياء"], ["chemistry", "Chemistry", "الكيمياء"], ["biology", "Biology", "الأحياء"],
  ["geology", "Geology", "الجيولوجيا"], ["mechanics", "Mechanics", "الميكانيكا"], ["arabic", "Arabic", "اللغة العربية"], ["english", "English", "اللغة الإنجليزية"]];
// Teacher requests need the teacher-requests.sql update; until it's run, profiles have no requested_role column
const requestsReady = (p) => !!p && "requested_role" in p;
const hasRequest = (p) => p?.requested_role === "teacher" && p.role === "student";
const requestBanner = () => hasRequest(S.profile)
  ? `<p class="req-banner" role="status"><span class="req-dot" aria-hidden="true"></span>${esc(t("requestPending", { s: S.profile.requested_subject ? I18N.subjectName(subjectById(S.profile.requested_subject)) : t("teacher") }))}</p>` : "";
// ---- phone numbers (for asking students how a session went)
// Accepts Arabic-Indic digits, spaces and dashes; keeps an optional leading +
function normalizePhone(v) {
  const s = String(v || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/^00/, "+").replace(/[^\d+]/g, "");
  const out = (s.startsWith("+") ? "+" : "") + s.replace(/\+/g, "");
  return /^\+?\d{8,15}$/.test(out) ? out : null;
}
// WhatsApp needs the international form: Egyptian 01xxxxxxxxx → 201xxxxxxxxx
const waNumber = (ph) => { const d = String(ph || "").replace(/\D/g, ""); return /^01\d{9}$/.test(d) ? "2" + d : d; };
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5Z"/><path d="M9 9.5c.3 1.8 1.7 3.4 3.6 4.1l.9-.9 1.6.7-.3 1.3c-2.9.1-5.9-2.8-6-5.7l1.3-.3.7 1.6-.9.9"/></svg>';
const waLink = (ph, name, text) => ph ? `<a class="icon-btn wa-btn" href="https://wa.me/${waNumber(ph)}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" aria-label="${esc(t("waTo", { n: name }))}" title="${esc(t("waTo", { n: name }))}">${WA_ICON}</a>` : "";
const phoneText = (ph) => ph ? `<a class="ph-num" href="tel:${esc(ph)}" dir="ltr">${esc(ph)}</a>` : "";

// Members must have a school and a phone number before they can see sessions.
// (Only once the database updates are in place, and never for admins.)
const infoMissing = () => S.infoReady && !isAdmin() && (!S.myPhone || !String(S.profile?.school || "").trim());
function viewInfoGate() {
  $app.innerHTML = authLayout(`
    <form class="card form" id="gf" novalidate>
      <h1>${t("gateTitle")}</h1>
      <p class="ph-why">${t("gateText")}</p>
      ${schoolField(S.profile.school || "")}
      <label>${t("phone")}<input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="01xxxxxxxxx" required value="${esc(S.myPhone || "")}"><small>${t("phoneWhyShort")}</small></label>
      <p class="err" role="alert"></p>
      <button class="btn primary wide">${t("saveContinue")}</button>
      <button type="button" class="link-btn small-link" id="gout">${t("signOut")}</button>
    </form>`);
  const f = document.getElementById("gf"), err = f.querySelector(".err");
  bindSchool(f);
  (S.profile.school ? f.phone : f.schoolSel).focus();
  document.getElementById("gout").onclick = () => API.signOut();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const school = f.school.value.trim(), phone = normalizePhone(f.phone.value);
    if (!school) { err.textContent = t("schoolNeeded"); return f.school.focus(); }
    if (!phone) { err.textContent = t("phoneBad"); return f.phone.focus(); }
    const b = f.querySelector(".primary"); b.disabled = true;
    try {
      if (school !== S.profile.school) { await API.updateProfile({ school }); S.profile.school = school; }
      if (phone !== S.myPhone) { await API.saveMyPhone(phone); S.myPhone = phone; }
      toast(t("saved")); route();      // carries on to the page they were opening
    } catch (ex) { err.textContent = phoneErrText(ex); b.disabled = false; if (isPhoneTaken(ex)) f.phone.focus(); }
  };
}

// ---- collab partners on sessions
const collabById = (id) => (S.collabs || []).find((c) => c.id === id) || null;
const sessionCollab = (s) => (s?.collab_id ? collabById(s.collab_id) : null);
// only allow images we made (data:image), files shipped with the site (img/…) or https links
const safeLogo = (src) => (typeof src === "string" && /^(data:image\/(png|jpeg|webp|gif);base64,|img\/|https:\/\/)/.test(src) ? src : "");
const cbLogo = (c, cls = "") => `<span class="cb-logo ${cls}" aria-hidden="true">${safeLogo(c.logo) ? `<img src="${esc(safeLogo(c.logo))}" alt="">` : `<b>${esc((c.name || "?").trim()[0] || "?")}</b>`}</span>`;
// small "logo × Name" chip used in lists
const collabChip = (s) => { const c = sessionCollab(s); return c ? `<span class="cb-chip" title="${esc(t("inCollabWith"))} ${esc(c.name)}">${cbLogo(c)}<bdi>${esc(c.name)}</bdi></span>` : ""; };
// the bigger "In collab with [logo] Name" line on the watch page
const collabLine = (s) => { const c = sessionCollab(s); return c ? `<p class="collab watch-collab"><span class="collab-label">${t("inCollabWith")}</span>${cbLogo(c, "collab-logo")}<span class="script green"><bdi>${esc(c.name)}</bdi></span></p>` : ""; };
const ghostRail = () => `<p class="ghost-rail" aria-hidden="true">ON-SITE ON-SITE ON-SITE</p>`;
const sticker = (sub, cls = "") => `<span class="sticker-icon ${cls}" style="--c:${esc(tone(sub))}">${esc(sub?.icon)}</span>`;

function toast(msg, kind = "") {
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); document.body.append(box); }
  const el = document.createElement("div"); el.className = "toast " + kind; el.textContent = msg; box.append(el);
  setTimeout(() => el.classList.add("out"), 2600); setTimeout(() => el.remove(), 3000);
}
const fail = (e) => { console.error(e); toast(t("errorGeneric", { m: e.message || e }), "bad"); };

function theme(set) {
  let v = set; try { if (set) localStorage.setItem("onsite.theme", set); else v = localStorage.getItem("onsite.theme"); } catch {}
  if (v) document.documentElement.dataset.theme = v;
}
theme();

// ---------------------------------------------------------------- data
async function loadAll() {
  // everything is asked for at once: on slow Wi-Fi the wait is one round trip, not eight
  const soft = (p) => p.then((v) => ({ ok: true, v }), () => ({ ok: false }));
  const [profile, subjects, sessions, progress, att, collabs, phone, ratings] = await Promise.all([
    API.getProfile(), API.listSubjects(), API.listSessions(), API.listMyProgress(),
    soft(API.myAttendance()), soft(API.listCollabs()), soft(API.getMyPhone()), soft(API.listMyRatings()),
  ]);
  // Dorm-session history; empty if that part of the database isn't set up yet
  S.attendance = att.ok ? att.v : [];
  Object.assign(S, { profile, subjects, sessions, progress: Object.fromEntries(progress.map((p) => [p.session_id, p])) });
  S.collabs = collabs.ok ? collabs.v : null;
  S.myPhone = phone.ok ? phone.v : null; S.phoneReady = phone.ok;
  // the required-info step only switches on once both database updates (phones.sql, school.sql) are in
  S.infoReady = S.phoneReady && !!S.profile && "school" in S.profile;
  // session ratings switch on once ratings.sql is in
  S.ratings = ratings.ok ? Object.fromEntries(ratings.v.map((r) => [r.session_id, r])) : {}; S.ratingsReady = ratings.ok;
  await Promise.all([PLUS.loadExtras(), loadContest()]);
}

// ---------------------------------------------------------------- ratings
const RATE_AT = 0.3;                                   // share of a session to watch before rating it
const canRate = () => S.ratingsReady && S.profile?.role === "student";
// staff get a preview of the box (nothing is saved), or a note when ratings.sql hasn't been run yet
const ratePreview = () => S.ratingsReady && isStaff();
const rateOffNote = () => !S.ratingsReady && isStaff();
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 5.95 6.55.8-4.83 4.5 1.24 6.5L12 17.15l-5.81 3.2 1.24-6.5L2.6 9.35l6.55-.8z"/></svg>';
const starsShow = (n, cls = "") => `<span class="stars ${cls}" role="img" aria-label="${esc(t("rateStars", { n: num(n) }))}">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? "on" : ""}">${STAR}</span>`).join("")}</span>`;
const fmtAvg = (x) => new Intl.NumberFormat(I18N.lang === "ar" ? "ar-EG" : "en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x);
function rateReady(s) {
  const p = S.progress[s.id];
  if (p?.completed) return true;
  const d = durOf(s), live = S.player && S.player.duration ? S.player.max / S.player.duration : 0;
  return Math.max(live, d ? (+p?.max_seconds || 0) / d : 0) >= RATE_AT;
}
function rateCard(s) {
  const mine = S.ratings[s.id], preview = ratePreview();
  if (!preview && !rateReady(s)) return `<h2 class="rate-h" id="rateH">${t("rateTitle")}</h2><p class="rate-lock">🔒 ${t("rateLocked", { p: num(Math.round(RATE_AT * 100)) })}</p>`;
  const v = mine?.stars || 0;
  return `<h2 class="rate-h" id="rateH">${t("rateTitle")}${mine ? `<small class="rate-mine">${t("rateYours", { n: num(mine.stars) })}</small>` : ""}</h2>
    ${preview ? `<p class="rate-preview">${t("ratePreview", { p: num(Math.round(RATE_AT * 100)) })}</p>` : ""}
    <form class="rate-form" id="rateForm" novalidate>
      <fieldset class="rate-stars">
        <legend>${t("rateAsk")}</legend>
        <div class="rate-row">${[1, 2, 3, 4, 5].map((i) => `<input type="radio" name="stars" id="st${i}" value="${i}" ${i === v ? "checked" : ""}><label for="st${i}" data-i="${i}" class="${i <= v ? "on" : ""}" title="${esc(t("rate" + i))}">${STAR}<span class="sr">${esc(t("rateStars", { n: num(i) }))} · ${esc(t("rate" + i))}</span></label>`).join("")}
          <span class="rate-word" aria-hidden="true">${v ? esc(t("rate" + v)) : ""}</span></div>
      </fieldset>
      <label class="sr" for="rateComment">${t("rateComment")}</label>
      <textarea id="rateComment" rows="2" maxlength="500" placeholder="${esc(t("rateComment"))}">${esc(mine?.comment || "")}</textarea>
      <div class="rate-foot"><span class="rate-state" aria-live="polite"></span><button class="btn primary sm" type="submit">${mine ? t("rateUpdate") : t("rateSend")}</button></div>
    </form>`;
}
function bindRate(s) {
  const box = document.getElementById("rate"); if (!box) return;
  const form = document.getElementById("rateForm"); if (!form) return;
  const labels = [...form.querySelectorAll(".rate-row label")], word = form.querySelector(".rate-word");
  const paint = (n) => labels.forEach((l) => l.classList.toggle("on", +l.dataset.i <= n));
  const chosen = () => +(form.querySelector('input[name="stars"]:checked')?.value || 0);
  labels.forEach((l) => {
    l.onmouseenter = () => { paint(+l.dataset.i); word.textContent = t("rate" + l.dataset.i); };
  });
  form.querySelector(".rate-row").onmouseleave = () => { const n = chosen(); paint(n); word.textContent = n ? t("rate" + n) : ""; };
  form.querySelectorAll('input[name="stars"]').forEach((r) => (r.onchange = () => { paint(+r.value); word.textContent = t("rate" + r.value); }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const stars = chosen(), state = form.querySelector(".rate-state"), btn = form.querySelector("button[type=submit]");
    if (!stars) { state.textContent = t("rateNeedStars"); return; }
    const comment = form.querySelector("#rateComment").value.trim().slice(0, 500);
    if (ratePreview()) { state.textContent = t("ratePreviewSaved"); return; }   // staff: try it, nothing saved
    btn.disabled = true;
    try {
      await API.saveRating(s.id, stars, comment);
      S.ratings[s.id] = { session_id: s.id, stars, comment, updated_at: new Date().toISOString() };
      box.classList.remove("nudge");
      box.innerHTML = rateCard(s); bindRate(s);
      box.querySelector(".rate-state").textContent = "✓ " + t("rateThanks");
      PLUS.checkBadges(true);
    } catch (err) { btn.disabled = false; fail(err); }
  };
}

// ---------------------------------------------------------------- shell
function shell(content, active) {
  const nav = [["/", "home", "home"], ["/checkin", "navCheckin", "checkin"], ["/progress", "progress", "progress"], ["/invite", "invite", "invite"]];
  if (isStaff()) nav.push(["/manage", "manage", "manage"]);
  const initials = (S.profile?.full_name || S.user?.email || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return `
    ${API.demo ? `<div class="demo-banner"><span>${t("demoBanner")}</span><button class="link-btn" data-act="reset-demo">${t("resetDemo")}</button></div>` : ""}
    <header class="topbar">
      <a class="wordmark" href="#/" aria-label="${esc(CFG.CLUB_NAME)}"><img src="img/onsite-logo-192.png" alt="${esc(CFG.CLUB_NAME)}" width="52" height="52"></a>
      <nav class="mainnav" aria-label="Main">
        ${nav.map(([href, key, icon]) => `<a href="#${href}" class="${active === key ? "on" : ""}" ${active === key ? 'aria-current="page"' : ""}>${navIcon(icon)}<span>${t(key)}</span></a>`).join("")}
      </nav>
      <div class="top-actions">
        ${PLUS.netPill()}
        ${PLUS.searchBtn()}
        <button class="pill-btn" data-act="lang" aria-label="${t("language")}">${I18N.lang === "ar" ? "EN" : "ع"}</button>
        <a class="avatar" href="#/account" title="${t("account")}" aria-label="${t("account")}">${esc(initials)}${PLUS.avatarLevel()}</a>
      </div>
    </header>
    ${ghostRail()}
    <main class="page" id="main" tabindex="-1">${content}</main>`;
}
function navIcon(k) {
  const p = {
    home: '<path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    checkin: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M14 14h2.5v2.5M20 14v.01M14 20h.01M17 20h3v-3"/>',
    progress: '<path d="M5 20V12M10 20V7M15 20v-5M20 20V4"/>',
    manage: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    invite: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v7.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V12M12 8v12.5M12 8S10.5 3.5 8 4.2C6 4.8 6.8 8 12 8Zm0 0s1.5-4.5 4-3.8c2 .6 1.2 3.8-4 3.8Z"/>',
  }[k];
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

document.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-act]"); if (!a) return;
  const act = a.dataset.act;
  if (act === "lang") FX.swap(() => { I18N.set(I18N.lang === "ar" ? "en" : "ar"); return route(); });
  if (act === "reset-demo") API.reset();
});

// ---------------------------------------------------------------- auth pages
function authLayout(inner) {
  const stickers = [
    ["➗", TONES.math], ["⚛️", TONES.physics], ["🧬", TONES.biology], ["⚗️", TONES.chemistry],
    ["Aa", TONES.english], ["⚙️", TONES.mechanics], ["ض", TONES.arabic], ["🪨", TONES.geology],
  ];
  return `
    ${API.demo ? `<div class="demo-banner"><span>${t("demoBanner")}</span></div>` : ""}
    <div class="auth">
      <section class="auth-brand">
        <button class="pill-btn auth-lang" data-act="lang">${I18N.lang === "ar" ? "EN" : "ع"}</button>
        ${ghostRail()}
        <img class="auth-logo" src="img/onsite-logo.png" alt="ON-site" width="300" height="300">
        <p class="auth-tag script">${t("tagline")}</p>
        ${collabMark()}
        <div class="sticker-pile" aria-hidden="true">
          ${stickers.map(([i, c], n) => `<span class="pile-st" style="--c:${c};--r:${(n % 2 ? 1 : -1) * (4 + (n * 3) % 9)}deg">${i}</span>`).join("")}
        </div>
      </section>
      <section class="auth-form">${inner}</section>
    </div>`;
}
function viewLogin(msg = "") {
  $app.innerHTML = authLayout(`
    <form class="card form" id="f" novalidate>
      <h1>${t("signIn")}</h1>
      ${msg ? `<p class="note">${esc(msg)}</p>` : ""}
      ${API.demo ? `<p class="note">Demo logins (password <b>demo1234</b>): admin <b>you@onsite.club</b>, teacher <b>teacher@onsite.club</b>, student <b>student@onsite.club</b></p>` : ""}
      <label>${t("email")}<input name="email" type="email" autocomplete="email" required></label>
      <label>${t("password")}<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="err" role="alert"></p>
      <button class="btn primary wide">${t("signIn")}</button>
      <a class="small-link" href="#/forgot">${t("forgot")}</a>
      <p class="switch">${t("noAccount")} <a href="#/signup">${t("signUp")}</a></p>
    </form>`);
  const f = document.getElementById("f");
  if (API.demo) { f.email.value = "you@onsite.club"; f.password.value = "demo1234"; }
  f.onsubmit = async (e) => {
    e.preventDefault(); const b = f.querySelector("button"); b.disabled = true;
    try { await API.signIn(f.email.value.trim(), f.password.value); await afterSignIn(); }
    catch (err) { f.querySelector(".err").textContent = err.message; b.disabled = false; }
  };
}
function viewSignup() {
  $app.innerHTML = authLayout(`
    <form class="card form" id="f" novalidate>
      ${pendingRef() ? `<div class="invited" id="invited"><span aria-hidden="true">🎁</span><span>${t("invitedGeneric")}</span></div>` : ""}
      <h1>${t("signUp")}</h1>
      <label>${t("fullName")}<input name="name" autocomplete="name" required></label>
      <label>${t("email")}<input name="email" type="email" autocomplete="email" required></label>
      <label>${t("phone")}<input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="01xxxxxxxxx" required><small>${t("phoneWhyShort")}</small></label>
      ${schoolField("")}
      <label>${t("password")}<input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
      <fieldset class="seg-field join-as"><legend>${t("joinAs")}</legend>
        <label class="radio-pill"><input type="radio" name="as" value="student" checked> ${t("student")}</label>
        <label class="radio-pill"><input type="radio" name="as" value="teacher"> ${t("teacher")}</label>
      </fieldset>
      <div class="teach-box" hidden>
        <label>${t("teachSubject")}<select name="subject"><option value="">—</option>${SIGNUP_SUBJECTS.map(([slug, en, ar]) => `<option value="${slug}">${I18N.lang === "ar" ? ar : en}</option>`).join("")}</select></label>
        <p class="note">${t("teacherNeedsApproval")}</p>
      </div>
      <p class="err" role="alert"></p>
      <button class="btn primary wide">${t("signUp")}</button>
      <p class="switch">${t("haveAccount")} <a href="#/login">${t("signIn")}</a></p>
    </form>`);
  const f = document.getElementById("f");
  bindSchool(f);
  const ref = pendingRef();
  if (ref) API.refInfo(ref).then((n) => { const el = document.getElementById("invited"); if (el && n) el.lastElementChild.textContent = t("invitedBy", { n }); }).catch(() => {});
  const box = f.querySelector(".teach-box");
  f.querySelectorAll('input[name="as"]').forEach((r) => (r.onchange = () => { box.hidden = f.as.value !== "teacher"; }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = f.querySelector(".err");
    if (!f.name.value.trim()) return (err.textContent = t("fullName") + " ✱");
    if (f.password.value.length < 6) return (err.textContent = "Password must be at least 6 characters.");
    const phone = normalizePhone(f.phone.value);
    if (!phone) { err.textContent = t("phoneBad"); return f.phone.focus(); }
    const school = f.school.value.trim();
    if (!school) { err.textContent = t("schoolNeeded"); return f.school.focus(); }
    const asTeacher = f.as.value === "teacher";
    if (asTeacher && !f.subject.value) return (err.textContent = t("pickSubject"));
    const b = f.querySelector("button.primary"); b.disabled = true;
    try {
      // one account per phone number (only once referrals.sql is in; before that this check is skipped)
      const free = await API.phoneAvailable(phone).catch(() => true);
      if (free === false) { err.textContent = t("phoneTaken"); b.disabled = false; return f.phone.focus(); }
      const r = await API.signUp(f.name.value.trim(), f.email.value.trim(), f.password.value, asTeacher ? f.subject.value : null, phone, school, pendingRef());
      clearPendingRef();
      if (r.needsConfirm) { location.hash = "/login"; viewLogin(t("checkEmail")); } else await afterSignIn();
    } catch (ex) { err.textContent = phoneErrText(ex); b.disabled = false; }
  };
}
function viewForgot() {
  $app.innerHTML = authLayout(`
    <form class="card form" id="f" novalidate>
      <h1>${t("forgot")}</h1>
      <label>${t("email")}<input name="email" type="email" autocomplete="email" required></label>
      <p class="err" role="alert"></p>
      <button class="btn primary wide">${t("sendReset")}</button>
      <a class="small-link" href="#/login">${t("backToSignIn")}</a>
    </form>`);
  const f = document.getElementById("f");
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await API.resetPassword(f.email.value.trim()); f.innerHTML = `<h1>${t("forgot")}</h1><p class="note">${t("resetSent")}</p><a class="small-link" href="#/login">${t("backToSignIn")}</a>`; }
    catch (ex) { f.querySelector(".err").textContent = ex.message; }
  };
}
function viewReset() {
  $app.innerHTML = authLayout(`
    <form class="card form" id="f" novalidate>
      <h1>${t("newPassword")}</h1>
      <label>${t("newPassword")}<input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
      <p class="err" role="alert"></p>
      <button class="btn primary wide">${t("savePassword")}</button>
    </form>`);
  const f = document.getElementById("f");
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await API.updatePassword(f.password.value); toast(t("passwordUpdated")); go("/"); }
    catch (ex) { f.querySelector(".err").textContent = ex.message; }
  };
}

// ---------------------------------------------------------------- home
function greeting() {
  const h = new Date().getHours();
  return t(h < 12 ? "morning" : h < 18 ? "afternoon" : "evening");
}
function viewHome() {
  const st = overallStats();
  const started = Object.values(S.progress)
    .filter((p) => !p.completed && (p.max_seconds > 0 || p.position_seconds > 0))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((p) => S.sessions.find((s) => s.id === p.session_id && s.published)).filter(Boolean);
  const [main, ...rest] = started;
  const firstName = (S.profile.full_name || "").split(" ")[0];

  const cont = main ? (() => {
    const sub = subjectById(main.subject_id), status = statusOf(main);
    return `
      <a class="continue" href="#/watch/${esc(main.id)}">
        <span class="continue-thumb" style="background-image:url(${thumb(main.youtube_id)})"><span class="play-dot">${ICONS.play}</span></span>
        <span class="continue-body">
          <span class="continue-sub">${sticker(sub, "sm")} ${esc(I18N.subjectName(sub))} ${collabChip(main)}</span>
          <span class="continue-title">${esc(main.title)}</span>
          <span class="bar"><span style="width:${status.pct}%"></span></span>
          <span class="continue-meta">${status.label}</span>
        </span>
        <span class="btn primary continue-btn">${t("resume")}</span>
      </a>
      ${rest.length ? `<div class="mini-list">${rest.slice(0, 3).map((s) => `
        <a class="mini" href="#/watch/${esc(s.id)}"><img src="${thumb(s.youtube_id)}" alt="" loading="lazy">
          <span><b>${esc(s.title)}</b><span class="bar thin"><span style="width:${pctOf(s)}%"></span></span></span></a>`).join("")}</div>` : ""}`;
  })() : `<p class="empty">${t("nothingStarted")}</p>`;

  const dec = st.hours % 1 ? 1 : 0;
  return shell(`
    ${requestBanner()}
    ${PLUS.annStack("home")}
    ${PLUS.installChip()}
    <section class="hello">
      <span class="hello-ghost" aria-hidden="true">ON-SITE</span>
      <p class="script">${t("tagline")}</p>
      <h1>${greeting()}${firstName ? (I18N.lang === "ar" ? "، " : ", ") + esc(firstName) : ""}</h1>
      <ul class="stats">
        <li><b data-count="${st.done}">${num(st.done)}</b> ${t("statDone")}</li>
        <li><b data-count="${st.hours}" data-dec="${dec}">${num(st.hours)}</b> ${t("statHours")}</li>
        <li class="${st.streak ? "has-streak" : ""}"><b data-count="${st.streak}">${num(st.streak)}</b> ${t("statStreak")}${st.streak ? ' <span class="flame" aria-hidden="true">🔥</span>' : ""}</li>
      </ul>
    </section>
    <section class="block">
      <h2>${t("continueWatching")}</h2>
      ${cont}
    </section>
    ${homePromo()}
    ${PLUS.homeRows()}
    <section class="block">
      <h2>${t("subjects")}</h2>
      <div class="sticker-grid">
        ${S.subjects.map((sub, i) => {
          const ss = subjectStats(sub.id), fresh = PLUS.newCount(sub.id);
          return `<a class="sticker" href="#/subject/${esc(sub.slug)}" style="--c:${esc(tone(sub))}">
            ${fresh ? `<span class="new-dot" title="${esc(t("newTag"))}">${num(fresh)} ${t("newTag")}</span>` : ""}
            <span class="sticker-top"><span class="sticker-glyph">${esc(sub.icon)}</span>${ss.total ? ring(ss.pct, 40, 5) : ""}</span>
            <span class="sticker-name">${esc(I18N.subjectName(sub))}</span>
            <span class="sticker-meta">${ss.total ? (ss.total === 1 ? t("oneSession") : t("sessionsCount", { n: num(ss.total) })) + " · " + t("completedOf", { a: num(ss.done), b: num(ss.total) }) : t("noSessionsYet")}</span>
            ${isCollab(sub) ? collabMark() : ""}
          </a>`;
        }).join("")}
      </div>
    </section>`, "home");
}

// ---------------------------------------------------------------- subject
function viewSubject(slug) {
  const sub = subjectBySlug(slug);
  if (!sub) return shell(`<p class="empty">${t("notFound")}</p>`);
  const list = sessionsOf(sub.id), ss = subjectStats(sub.id);
  const rows = (items) => items.map((s, i) => {
    const st = statusOf(s);
    return `<li><a class="srow" href="#/watch/${esc(s.id)}" data-title="${esc(s.title.toLowerCase())}">
      <span class="srow-n">${num(i + 1)}</span>
      <span class="srow-thumb" style="background-image:url(${thumb(s.youtube_id)})">${sessionCollab(s) ? cbLogo(sessionCollab(s), "thumb-badge") : ""}${st.key === "done" ? '<span class="tick" aria-hidden="true">✓</span>' : ""}${st.key === "prog" ? `<span class="srow-bar" style="width:${st.pct}%"></span>` : ""}</span>
      <span class="srow-body"><b>${esc(s.title)}</b><span class="srow-meta">${fmtMin(durOf(s))}${s.attachment_url ? " · 📎" : ""} ${collabChip(s)}</span></span>
      <span class="status s-${st.key}">${st.label}</span>
    </a></li>`;
  }).join("");
  return shell(`
    <section class="subject-head" style="--c:${esc(tone(sub))}">
      <span class="subject-ghost" aria-hidden="true">${esc(I18N.subjectName(sub))}</span>
      <span class="subject-glyph">${esc(sub.icon)}</span>
      <div>
        <h1>${esc(I18N.subjectName(sub))}</h1>
        <p>${ss.total ? t("completedOf", { a: num(ss.done), b: num(ss.total) }) : t("noSessionsYet")}</p>
        ${ss.total ? `<span class="bar"><span style="width:${ss.pct}%"></span></span>` : ""}
        ${isCollab(sub) ? collabMark(t("collabWith")) : ""}
      </div>
    </section>
    ${PLUS.annStack("subject", sub.id)}
    ${list.length > 5 ? `<input class="search" type="search" placeholder="${t("searchSessions")}" aria-label="${t("searchSessions")}" id="q">` : ""}
    <ol class="slist">${rows(list)}</ol>`, "home");
}
function bindSubject() {
  const q = document.getElementById("q");
  if (q) q.oninput = () => {
    const v = q.value.trim().toLowerCase();
    document.querySelectorAll(".srow").forEach((a) => (a.parentElement.hidden = v && !a.dataset.title.includes(v)));
  };
}

// ---------------------------------------------------------------- watch
function viewWatch(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s || (!s.published && !isStaff())) return shell(`<p class="empty">${t("notFound")}</p>`);
  const sub = subjectById(s.subject_id);
  const list = S.sessions.filter((x) => x.subject_id === s.subject_id && (x.published || x.id === s.id)).sort((a, b) => a.position - b.position);
  const p = S.progress[s.id];
  const done = !!p?.completed;
  return shell(`
    <div class="watch">
      <div class="watch-main">
        <div id="player"></div>
        <div class="watch-info">
          <a class="crumb" href="#/subject/${esc(sub.slug)}">${sticker(sub, "sm")} ${esc(I18N.subjectName(sub))}</a>
          <h1>${esc(s.title)} ${s.published ? "" : `<span class="status s-draft">${t("draft")}</span>`}</h1>
          ${collabLine(s)}
          <div class="watch-actions">
            <p class="finish-state ${done ? "is-done" : ""}" id="markDone" aria-live="polite">${done ? "✓ " + t("markedComplete") : t("finishAt", { p: num(pctOf(s)), t: num(Math.round((CFG.COMPLETE_AT || 0.9) * 100)) })}</p>
            ${s.attachment_url ? `<a class="btn" href="${esc(s.attachment_url)}" target="_blank" rel="noopener">📎 ${t("attachment")}</a>` : ""}
          </div>
          ${canRate() || ratePreview() ? `<section class="rate" id="rate" aria-labelledby="rateH">${rateCard(s)}</section>` : ""}
          ${rateOffNote() ? `<p class="rate-off">⚠ ${t("ratingsOff")}</p>` : ""}
          ${s.description ? `<p class="desc">${esc(s.description).replace(/\n/g, "<br>")}</p>` : ""}
          <details class="notes" ${p?.notes ? "open" : ""}>
            <summary>${t("myNotes")} <span class="notes-state" aria-live="polite"></span></summary>
            <textarea id="notes" rows="6" placeholder="${t("notesPlaceholder")}">${esc(p?.notes || "")}</textarea>
            ${PLUS.notesTools()}
          </details>
          <p class="kbd-hint">${t("shortcuts")}</p>
        </div>
      </div>
      <aside class="playlist">
        <h2>${t("playlist", { s: esc(I18N.subjectName(sub)) })}</h2>
        <ol>${list.map((x, i) => {
          const st = statusOf(x);
          return `<li><a href="#/watch/${esc(x.id)}" class="pl ${x.id === s.id ? "on" : ""}" ${x.id === s.id ? 'aria-current="true"' : ""} data-id="${esc(x.id)}">
            <span class="pl-n">${st.key === "done" ? "✓" : num(i + 1)}</span>
            <span class="pl-body"><b>${esc(x.title)}</b><span class="srow-meta">${fmtMin(durOf(x))} ${collabChip(x)}</span>
            ${st.key === "prog" ? `<span class="bar thin"><span style="width:${st.pct}%"></span></span>` : ""}</span></a></li>`;
        }).join("")}</ol>
      </aside>
    </div>`, "home");
}
function bindWatch(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s || !document.getElementById("player")) return;
  const p = S.progress[s.id];
  const dur = durOf(s);
  const startAt = p && !p.completed && p.position_seconds > 5 && (!dur || p.position_seconds < dur - 15) ? p.position_seconds : 0;
  const list = S.sessions.filter((x) => x.subject_id === s.subject_id && x.published).sort((a, b) => a.position - b.position);
  const next = list[list.indexOf(s) + 1];

  const save = async (fields) => {
    const prev = S.progress[s.id] || { session_id: s.id, position_seconds: 0, max_seconds: 0, completed: false, notes: "" };
    const row = { ...prev, ...fields, session_id: s.id, updated_at: new Date().toISOString() };
    const justDone = row.completed && !prev.completed;
    S.progress[s.id] = row;
    try {
      await API.saveProgress({ session_id: s.id, ...fields });
    } catch (e) { console.warn("progress not saved", e); }
    if (justDone) {
      markDoneUI();
      PLUS.onComplete(s);
      const box = document.getElementById("rate");
      if (box && !S.ratings[s.id]) { toast("✓ " + t("ratePrompt")); box.classList.add("nudge"); if (box.querySelector(".rate-lock")) { box.innerHTML = rateCard(s); bindRate(s); } }
      else toast("✓ " + t("markedComplete"));
    }
  };
  const markDoneUI = () => {
    const b = document.getElementById("markDone");
    if (b) { b.classList.add("is-done"); b.textContent = "✓ " + t("markedComplete"); }
    const pl = document.querySelector(`.pl[data-id="${CSS.escape(s.id)}"] .pl-n`);
    if (pl) pl.textContent = "✓";
  };

  S.player = new OnsitePlayer(document.getElementById("player"), {
    videoId: s.youtube_id, startAt, watched: p?.max_seconds || 0,
    onProgress: ({ position, duration, max }) => {
      const prev = S.progress[s.id];
      const completed = !!prev?.completed || (duration > 0 && max / duration >= (CFG.COMPLETE_AT || 0.9));
      const nearEnd = duration && position > duration - 5;
      save({ position_seconds: nearEnd ? 0 : Math.round(position), duration_seconds: Math.round(duration) || null, max_seconds: Math.round(Math.max(max, prev?.max_seconds || 0)), completed });
    },
    onEnded: () => {
      if (!next) return;
      let n = 6;
      const paint = () => S.player.showOverlay(`
        <div class="upnext">
          <span class="upnext-k">${t("nextIn", { n: num(n) })}</span>
          <b>${esc(next.title)}</b>
          <div><button class="op-chip op-chip-main" data-u="go">${t("playNow")}</button><button class="op-chip" data-u="stop">${t("cancel")}</button></div>
        </div>`);
      paint();
      const timer = setInterval(() => { n--; if (n <= 0) { clearInterval(timer); go("/watch/" + next.id); } else paint(); }, 1000);
      S.player.$overlay.onclick = (e) => {
        const u = e.target.dataset.u; if (!u) return;
        clearInterval(timer);
        if (u === "go") go("/watch/" + next.id); else S.player.showOverlay("");
      };
      S.player._upnextTimer = timer;
    },
  });
  document.getElementById("player").focus({ preventScroll: true });

  // live "watched x% · finishes at 90%" line (the session finishes by itself at 90% really watched)
  const finishTimer = setInterval(() => {
    const box = document.getElementById("rate");
    if (box?.querySelector(".rate-lock") && rateReady(s)) { box.innerHTML = rateCard(s); bindRate(s); }
    const el = document.getElementById("markDone"), pl = S.player;
    if (!el || !pl || S.progress[s.id]?.completed || !pl.duration) return;
    el.textContent = t("finishAt", { p: num(Math.min(99, Math.floor((pl.max / pl.duration) * 100))), t: num(Math.round((CFG.COMPLETE_AT || 0.9) * 100)) });
  }, 1000);
  S.cleanups.push(() => clearInterval(finishTimer));
  bindRate(s);
  const notes = document.getElementById("notes"), state = document.querySelector(".notes-state");
  let tm;
  notes.oninput = () => {
    clearTimeout(tm); state.textContent = "…";
    tm = setTimeout(async () => { await save({ notes: notes.value }); state.textContent = t("notesSaved"); }, 800);
  };
  document.querySelector(".pl.on")?.scrollIntoView({ block: "nearest" });
  PLUS.bindNotes();
}

// ---------------------------------------------------------------- progress
function viewProgress() {
  const st = overallStats();
  const pct = st.total ? Math.round(visibleSessions().reduce((a, s) => a + pctOf(s), 0) / st.total) : 0;

  // heatmap: last 8 weeks, columns = weeks
  const counts = {};
  Object.values(S.progress).forEach((p) => { const k = new Date(p.updated_at).toDateString(); counts[k] = (counts[k] || 0) + 1; });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDay = new Date(today); startDay.setDate(today.getDate() - today.getDay() - 7 * 7);
  let cells = "";
  for (let w = 0; w < 8; w++) {
    cells += `<div class="hm-col">`;
    for (let d = 0; d < 7; d++) {
      const day = new Date(startDay); day.setDate(startDay.getDate() + w * 7 + d);
      const c = day > today ? -1 : counts[day.toDateString()] || 0;
      const lv = c < 0 ? "x" : Math.min(c, 4);
      cells += `<span class="hm hm-${lv}" title="${day.toLocaleDateString(I18N.lang === "ar" ? "ar-EG" : "en-GB")}${c > 0 ? ": " + c : ""}"></span>`;
    }
    cells += `</div>`;
  }
  const recent = Object.values(S.progress).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((p) => ({ p, s: S.sessions.find((x) => x.id === p.session_id && x.published) })).filter((x) => x.s).slice(0, 8);
  const when = (iso) => new Date(iso).toLocaleDateString(I18N.lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" });

  return shell(`
    <h1 class="page-title">${t("progress")}</h1>
    <section class="prog-top">
      <div class="big-ring">${ring(pct, 148, 14)}<span><b data-count="${pct}" data-suffix="%">${num(pct)}%</b><small>${t("overall")}</small></span></div>
      <ul class="prog-stats">
        <li><b data-count="${st.done}">${num(st.done)}</b><span>/ ${num(st.total)} ${t("statDone")}</span></li>
        <li><b data-count="${st.hours}" data-dec="${st.hours % 1 ? 1 : 0}">${num(st.hours)}</b><span>${t("statHours")}</span></li>
        <li><b data-count="${st.streak}">${num(st.streak)}</b><span>${t("statStreak")}</span></li>
        <li><b data-count="${S.attendance.length}">${num(S.attendance.length)}</b><span>${t("statDorm")}</span></li>
      </ul>
    </section>
    ${PLUS.levelCard()}
    <div class="prog-grid">
      <section class="card pad">
        <h2>${t("bySubject")}</h2>
        <ul class="subj-bars">
          ${S.subjects.map((sub) => { const ss = subjectStats(sub.id); return `
            <li><a href="#/subject/${esc(sub.slug)}">${sticker(sub, "sm")}<span class="sb-name">${esc(I18N.subjectName(sub))}</span>
              <span class="bar" style="--c:${esc(tone(sub))}"><span style="width:${ss.pct}%"></span></span>
              <span class="sb-n">${num(ss.done)}/${num(ss.total)}</span></a></li>`; }).join("")}
        </ul>
      </section>
      <section class="card pad">
        <h2>${t("activity")}</h2>
        <div class="heatmap" dir="ltr">${cells}</div>
        <div class="hm-legend"><span>${t("less")}</span><span class="hm hm-0"></span><span class="hm hm-1"></span><span class="hm hm-2"></span><span class="hm hm-3"></span><span class="hm hm-4"></span><span>${t("more")}</span></div>
        <h2 class="mt">${t("recentActivity")}</h2>
        ${recent.length ? `<ul class="recent">${recent.map(({ p, s }) => {
          const sub = subjectById(s.subject_id), stt = statusOf(s);
          return `<li><a href="#/watch/${esc(s.id)}">${sticker(sub, "sm")}<span><b>${esc(s.title)}</b><small>${when(p.updated_at)} · ${stt.label}</small></span></a></li>`;
        }).join("")}</ul>` : `<p class="empty">${t("noActivity")}</p>`}
      </section>
    </div>
    <section class="card pad mt-card">
      <h2>${t("myDormSessions")}</h2>
      ${dormHistoryHtml(S.attendance.slice(0, 10))}
    </section>
    ${PLUS.progressExtras()}`, "progress");
}

// ---------------------------------------------------------------- manage
const M = { tab: "sessions", subject: null, openSub: null, profiles: null, allProgress: null };
function parseYouTube(url) {
  url = (url || "").trim();
  if (/^[\w-]{11}$/.test(url)) return url;
  const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}
async function viewManage() {
  if (!isStaff()) return shell(`<p class="empty">${t("notAllowed")}</p>`);
  if (!isAdmin()) { M.subject = S.profile.subject_id; if (M.tab === "people") M.tab = "sessions"; }
  try {
    [M.allProgress, M.profiles] = await Promise.all([API.listAllProgress(), API.listProfiles()]);
    M.phones = isAdmin() ? await API.listPhones().catch(() => null) : null;
    M.ratings = await API.listRatings().catch(() => null);          // null until ratings.sql is in
    M.referrals = isAdmin() ? await API.listReferrals().catch(() => null) : null;   // null until referrals.sql is in
  } catch (e) { M.allProgress = []; M.profiles = []; console.warn(e); }
  const nReq = M.profiles.filter(hasRequest).length;
  const tabList = [["sessions", t("videos")], ["live", t("dormSessions")], ["insights", t("insights")], ["ann", t("announcements")]].concat(isAdmin() ? [["people", t("people"), nReq], ["invites", t("invitesTab")]] : []);
  const tabs = `<div class="tabs" role="tablist">${tabList.map(([k, lab, n]) =>
    `<button role="tab" aria-selected="${M.tab === k}" data-tab="${k}">${lab}${n ? ` <span class="tab-badge" aria-label="${t("teacherRequests")}: ${num(n)}">${num(n)}</span>` : ""}</button>`).join("")}</div>`;
  let body;
  if (M.tab === "live") { try { body = await liveTab(); } catch (e) { fail(e); body = ""; } }
  else if (M.tab === "insights") { try { body = await PLUS.insightsTab(); } catch (e) { fail(e); body = ""; } }
  else if (M.tab === "ann") body = PLUS.annTab();
  else if (M.tab === "invites") { try { body = await invitesTab(); } catch (e) { fail(e); body = ""; } }
  else body = M.tab === "people" ? peopleTab() : sessionsTab();
  return shell(`<h1 class="page-title">${t("manage")}</h1>${tabs}<div id="mbody">${body}</div>`, "manage");
}
// Videos: one fold-out section per subject; only one section is open at a time
function sessionsTab() {
  const subs = isAdmin() ? S.subjects : S.subjects.filter((s) => s.id === S.profile.subject_id);
  if (!subs.length) return `<p class="empty">${t("notAllowed")}</p>`;
  if (subs.length === 1) M.openSub = subs[0].id;                       // a teacher's one subject is always open
  if (M.openSub && !subs.some((x) => x.id === M.openSub)) M.openSub = null;
  const total = S.sessions.filter((s) => subs.some((x) => x.id === s.subject_id)).length;
  const row = (s, j, n) => `<li class="mrow">
        <img src="${thumb(s.youtube_id)}" alt="" loading="lazy">
        <div class="mrow-body">
          <b>${esc(s.title)}</b>
          <span class="srow-meta">${fmtMin(s.duration_seconds) || "—"} · ${collabChip(s) ? collabChip(s) + " · " : ""}<span class="status ${s.published ? "s-done" : "s-draft"}">${s.published ? t("published") : t("draft")}</span></span>
          ${viewsButton(s)}
        </div>
        <div class="mrow-act">
          <button class="icon-btn" data-up="${esc(s.id)}" ${j === 0 ? "disabled" : ""} aria-label="${t("moveUp")}">↑</button>
          <button class="icon-btn" data-down="${esc(s.id)}" ${j === n - 1 ? "disabled" : ""} aria-label="${t("moveDown")}">↓</button>
          <button class="btn sm" data-edit="${esc(s.id)}">${t("edit")}</button>
        </div>
      </li>`;
  return `${M.ratings === null && isAdmin() ? `<p class="rate-off">⚠ ${t("ratingsOff")}</p>` : ""}
    <div class="mtools">
      <span class="srow-meta">${t("sessionsInSubjects", { n: num(total), m: num(subs.length) })}</span>
      <button class="btn primary" id="addS">+ ${t("addSession")}</button>
    </div>
    <div class="acc">${subs.map((sub) => {
      const list = S.sessions.filter((s) => s.subject_id === sub.id).sort((a, b) => a.position - b.position);
      const drafts = list.filter((s) => !s.published).length;
      const open = M.openSub === sub.id;
      return `<details class="acc-item" data-sub="${sub.id}" style="--c:${esc(tone(sub))}" ${open ? "open" : ""}>
        <summary class="acc-head">
          <span class="sticker-icon">${esc(sub.icon)}</span>
          <span class="acc-title"><b>${esc(I18N.subjectName(sub))}</b>
            <small>${list.length === 1 ? t("oneSession") : t("sessionsCount", { n: num(list.length) })}${drafts ? ` · ${t("draftsCount", { n: num(drafts) })}` : ""}</small></span>
          <span class="acc-n" aria-hidden="true">${num(list.length)}</span>
          <svg class="acc-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </summary>
        <div class="acc-body">
          ${list.length ? `<ul class="mlist">${list.map((s, j) => row(s, j, list.length)).join("")}</ul>` : `<p class="empty">${t("noSessionsYet")}</p>`}
          <button type="button" class="btn sm acc-add" data-add-sub="${sub.id}">+ ${t("addSessionTo", { s: I18N.subjectName(sub) })}</button>
        </div>
      </details>`;
    }).join("")}</div>`;
}
// ---- who watched a session
// A "watch" = a student who played some of it (one per student, however many times they rewatch).
// Admins and the subject's own teacher are left out so test plays don't count.
function viewersOf(s) {
  const prof = Object.fromEntries((M.profiles || []).map((p) => [p.id, p]));
  return (M.allProgress || [])
    .filter((p) => p.session_id === s.id && (p.completed || +p.max_seconds > 0))
    .map((p) => {
      const pr = prof[p.user_id];
      const dur = +p.duration_seconds || +s.duration_seconds || 0;
      // the share they actually played (skipping ahead doesn't count), shown even when it's marked finished
      const pct = dur ? Math.min(100, Math.round((+p.max_seconds / dur) * 100)) : p.completed ? 100 : 0;
      return { ...p, role: pr?.role, teaches: pr?.subject_id, name: pr?.full_name || t("unknownStudent"), school: pr?.school || "", pct, phone: M.phones?.[p.user_id] || "" };
    })
    .filter((v) => !(v.role === "admin" || (v.role === "teacher" && v.teaches === s.subject_id)))
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}
// ratings of one session, keyed by student
function ratingsOf(s) {
  return Object.fromEntries((M.ratings || []).filter((r) => r.session_id === s.id).map((r) => [r.user_id, r]));
}
const avgOf = (list) => list.length ? list.reduce((a, r) => a + r.stars, 0) / list.length : 0;
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
function rateBit(s) {
  if (!M.ratings) return "";
  const list = Object.values(ratingsOf(s));
  if (!list.length) return "";
  return `<span class="views-sep" aria-hidden="true"></span><span class="views-rate"><span class="star-i">${STAR}</span><b>${fmtAvg(avgOf(list))}</b> <small>(${list.length === 1 ? t("oneRating") : t("ratingsCount", { n: num(list.length) })})</small></span>`;
}
function viewsButton(s) {
  const v = viewersOf(s), done = v.filter((x) => x.completed).length;
  return `<button type="button" class="views-btn" data-views="${esc(s.id)}" aria-label="${t("openViewers")}: ${t("viewsCount", { n: num(v.length) })}, ${t("finishedCount", { n: num(done) })}">
    ${EYE}<span><b>${num(v.length)}</b> ${t("viewsCount", { n: "" }).trim()}</span><span class="views-sep" aria-hidden="true"></span><span class="views-done">✓ <b>${num(done)}</b> ${t("finishedCount", { n: "" }).trim()}</span>${rateBit(s)}
  </button>`;
}
const fmtDay = (iso) => {
  if (!iso) return "";
  const d = new Date(iso), thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(I18N.lang === "ar" ? "ar-EG" : "en-GB", thisYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
};
function viewersDialog(s) {
  const sub = subjectById(s.subject_id), rmap = ratingsOf(s);
  const all = viewersOf(s).map((v) => ({ ...v, rating: rmap[v.user_id] || null }));
  const done = all.filter((v) => v.completed), open = all.filter((v) => !v.completed);
  const rated = all.filter((v) => v.rating), hasRatings = !!M.ratings;
  const rAvg = avgOf(Object.values(rmap));
  const avg = all.length ? Math.round(all.reduce((a, v) => a + v.pct, 0) / all.length) : 0;
  let filter = "all";
  const dlg = document.createElement("dialog");
  dlg.className = "modal vw-modal";
  const rows = () => {
    const list = filter === "done" ? done : filter === "open" ? open : filter === "rated" ? rated : all;
    if (!list.length) return `<p class="empty">${t("noViewers")}</p>`;
    return `<ol class="vw-list">${list.map((v) => {
      const ini = v.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
      return `<li>
        <span class="att-av" aria-hidden="true">${esc(ini)}</span>
        <span class="vw-main"><b><bdi>${esc(v.name)}</bdi></b>${v.school ? `<small class="vw-school"><bdi>${esc(v.school)}</bdi></small>` : ""}<span class="bar thin" style="--c:${esc(v.completed ? "#8FE85A" : "#5C93FF")}"><span style="width:${v.pct}%"></span></span>
          ${hasRatings ? (v.rating ? `<span class="vw-rate">${starsShow(v.rating.stars, "sm")}${v.rating.comment ? `<q class="vw-comment"><bdi>${esc(v.rating.comment)}</bdi></q>` : ""}</span>` : `<small class="vw-norate">${t("notRated")}</small>`) : ""}</span>
        <span class="vw-side">${v.completed ? `<span class="status s-done">${t("doneWatched", { p: num(v.pct) })}</span>` : `<span class="status">${t("inProgress", { p: num(v.pct) })}</span>`}<small>${esc(t("lastWatchedOn", { d: fmtDay(v.updated_at) }))}</small>
          ${M.phones ? `<span class="vw-contact">${v.phone ? phoneText(v.phone) + waLink(v.phone, v.name, t("feedbackMsg", { n: v.name.split(" ")[0], s: s.title })) : `<small class="no-ph">${t("noPhone")}</small>`}</span>` : ""}</span>
      </li>`;
    }).join("")}</ol>`;
  };
  const chips = () => [["all", t("allOpt"), all.length], ["done", t("markedComplete"), done.length], ["open", t("stillWatching"), open.length]].concat(hasRatings ? [["rated", t("ratingsTitle"), rated.length]] : [])
    .map(([k, lab, n]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${filter === k}">${lab} · ${num(n)}</button>`).join("");
  dlg.innerHTML = `
    <div class="form vw">
      <div class="modal-head"><h2>${t("whoWatched")}</h2><button type="button" class="icon-btn" data-close aria-label="${t("cancel")}">✕</button></div>
      <p class="vw-title">${sticker(sub, "sm")} <span><bdi>${esc(s.title)}</bdi></span></p>
      <ul class="vw-sum ${hasRatings ? "four" : ""}">
        <li><b>${num(all.length)}</b><span>${t("viewsCount", { n: "" }).trim()}</span></li>
        <li><b>${num(done.length)}</b><span>${t("finishedCount", { n: "" }).trim()}</span></li>
        <li><b>${num(avg)}%</b><span>${t("avgWatched")}</span></li>
        ${hasRatings ? `<li class="vw-sum-rate"><b>${rated.length ? `<span class="star-i">${STAR}</span>${fmtAvg(rAvg)}` : "—"}</b><span>${rated.length ? `${t("avgRating")} · ${rated.length === 1 ? t("oneRating") : t("ratingsCount", { n: num(rated.length) })}` : t("noRatings")}</span></li>` : ""}
      </ul>
      ${PLUS.viewerDrop(s, all)}
      ${all.length ? `<div class="chips" role="group">${chips()}</div>` : ""}
      <div class="vw-body">${rows()}</div>
      <div class="modal-foot"><span></span>${all.length ? `<button type="button" class="btn sm" data-csv>${t("downloadCsv")}</button>` : ""}</div>
    </div>`;
  document.body.append(dlg);
  dlg.showModal();
  requestAnimationFrame(() => PLUS.drawViewerDrop(s, all));
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) return close();               // click on the dimmed backdrop
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-close")) close();
    if (b.dataset.f) { filter = b.dataset.f; dlg.querySelector(".chips").innerHTML = chips(); dlg.querySelector(".vw-body").innerHTML = rows(); }
    if (b.hasAttribute("data-csv")) {
      const withPh = !!M.phones;
      const lines = [[t("fullName"), t("school"), t("completion"), "%", t("lastSeen")].concat(withPh ? [t("phone")] : [], hasRatings ? [t("ratingCol"), t("commentCol")] : [])]
        .concat(all.map((v) => [v.name, v.school, v.completed ? t("done") : t("stillWatching"), v.pct, (v.updated_at || "").slice(0, 10)]
          .concat(withPh ? [v.phone ? `="${v.phone}"` : ""] : [], hasRatings ? [v.rating?.stars || "", v.rating?.comment || ""] : [])));
      const csv = "\ufeff" + lines.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `viewers-${(sub?.slug || "session")}-${s.title.replace(/[^\w\u0600-\u06FF]+/g, "-").slice(0, 40)}.csv`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  });
}

const ROLE_ORDER = { admin: 0, teacher: 1, student: 2 };
const hasSchools = () => !!M.profiles?.length && "school" in M.profiles[0];
function peopleTab() {
  const total = visibleSessions().length;
  const last = {};
  M.allProgress.forEach((p) => { if (!last[p.user_id] || p.updated_at > last[p.user_id]) last[p.user_id] = p.updated_at; });
  const ready = requestsReady(M.profiles[0]);
  const pending = M.profiles.filter(hasRequest).sort((a, b) => String(a.requested_at || "").localeCompare(String(b.requested_at || "")));
  const count = (r) => M.profiles.filter((p) => p.role === r).length;
  const f = M.pfilter || "all", q = (M.pq || "").trim().toLowerCase();
  // invites (referrals.sql): how many people each member brought, and who brought them
  const refs = M.referrals || [], invites = {}, invitedBy = {};
  refs.forEach((r) => { if (r.status === "ok" && M.phones?.[r.referred_id]) invites[r.referrer_id] = (invites[r.referrer_id] || 0) + 1; invitedBy[r.referred_id] = r; });
  const shared = sharedNumbers();
  const doneOf = {}; M.allProgress.forEach((x) => { if (x.completed) doneOf[x.user_id] = (doneOf[x.user_id] || 0) + 1; });
  const byName = (a, b) => (a.full_name || "").localeCompare(b.full_name || "");
  const SORTS = {
    role: (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b),
    newest: (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")),
    oldest: (a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")),
    name: byName,
    school: (a, b) => schoolLabel(a.school || "~").localeCompare(schoolLabel(b.school || "~")) || byName(a, b),
    invites: (a, b) => (invites[b.id] || 0) - (invites[a.id] || 0) || byName(a, b),
    finished: (a, b) => (doneOf[b.id] || 0) - (doneOf[a.id] || 0) || byName(a, b),
    active: (a, b) => String(last[b.id] || "").localeCompare(String(last[a.id] || "")) || byName(a, b),
  };
  const sortKey = SORTS[M.psort] ? M.psort : "role";
  const list = M.profiles
    .filter((p) => (f === "all" || p.role === f) && (!q || (p.full_name || "").toLowerCase().includes(q) || (p.school || "").toLowerCase().includes(q) || (M.phones?.[p.id] || "").includes(q)))
    .sort(SORTS[sortKey]);
  const sortOpts = ["role", "newest", "oldest", "name", "school"].concat(M.referrals ? ["invites"] : [], ["finished", "active"]);
  const day = (iso) => iso ? new Date(iso).toLocaleDateString(I18N.lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" }) : "";
  const ini = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const requests = pending.length ? `
    <section class="card pad req-card">
      <h2>${t("teacherRequests")} <span class="tab-badge">${num(pending.length)}</span></h2>
      <ul class="req-list">${pending.map((p) => `
        <li data-req="${esc(p.id)}">
          <span class="att-av" aria-hidden="true">${esc(ini(p.full_name))}</span>
          <span class="req-who"><b><bdi>${esc(p.full_name || "—")}</bdi></b><small>${esc(t("requestedOn", { d: day(p.requested_at || p.created_at) }))}</small></span>
          <label class="req-subj"><span>${t("teachSubject")}</span><select data-req-subj>${S.subjects.map((x) => `<option value="${x.id}" ${x.id === p.requested_subject ? "selected" : ""}>${esc(I18N.subjectName(x))}</option>`).join("")}</select></label>
          <span class="req-act">
            <button type="button" class="btn sm danger" data-decline="${esc(p.id)}">${t("decline")}</button>
            <button type="button" class="btn sm primary" data-approve="${esc(p.id)}">${t("approve")}</button>
          </span>
        </li>`).join("")}</ul>
    </section>` : "";

  const chips = [["all", t("allOpt"), M.profiles.length], ["admin", t("admins"), count("admin")], ["teacher", t("teachers"), count("teacher")], ["student", t("students"), count("student")]]
    .map(([k, lab, n]) => `<button type="button" class="chip" data-pf="${k}" aria-pressed="${f === k}">${lab} · ${num(n)}</button>`).join("");

  return `
    ${ready ? "" : `<p class="note mt-0">${t("requestsSetup")}</p>`}
    ${requests}
    <div class="people-tools">
      <div class="chips" role="group" aria-label="${t("role")}">${chips}</div>
      <input class="search" type="search" id="pq" value="${esc(M.pq || "")}" placeholder="${t("searchPeople")}" aria-label="${t("searchPeople")}">
      <label class="sort-pick"><span>${t("sortBy")}</span><select id="psort">${sortOpts.map((k) => `<option value="${k}" ${k === sortKey ? "selected" : ""}>${t("sort_" + k)}</option>`).join("")}</select></label>
      <span class="srow-meta people-n">${t("peopleShown", { n: num(list.length) })}</span>
      ${EXTRA.backupBtn()}
    </div>
    <div class="table-wrap"><table class="ptable">
    <thead><tr><th>${t("fullName")}</th><th>${t("joined")}</th>${hasSchools() ? `<th>${t("school")}</th>` : ""}${M.phones ? `<th>${t("phone")}</th>` : ""}${M.referrals ? `<th>${t("invitesCol")}</th>` : ""}<th>${t("role")}</th><th>${t("teachesSubject")}</th><th>${t("completion")}</th><th>${t("lastSeen")}</th></tr></thead>
    <tbody>${list.length ? list.map((p) => {
      const done = M.allProgress.filter((x) => x.user_id === p.id && x.completed).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const self = p.id === S.profile.id;
      return `<tr data-uid="${esc(p.id)}" class="r-${esc(p.role)}">
        <td><span class="p-name"><span class="role-dot" aria-hidden="true"></span><b><bdi>${esc(p.full_name || "—")}</bdi></b>${hasRequest(p) ? `<span class="status s-req">${t("pendingTag")}</span>` : ""}</span>
          ${invitedBy[p.id] ? `<small class="p-by">🎁 ${t("invitedByShort", { n: esc(M.profiles.find((x) => x.id === invitedBy[p.id].referrer_id)?.full_name || "—") })}${invitedBy[p.id].status === "rejected" ? ` · ${t("stRejectedAdmin")}` : ""}</small>` : ""}</td>
        <td class="joined-cell" title="${esc(fmtJoined(p.created_at))}"><span>${esc(fmtJoined(p.created_at))}</span><small>${esc(agoText(p.created_at))}</small></td>
        ${hasSchools() ? `<td class="school-cell"><bdi>${esc(schoolLabel(p.school) || "—")}</bdi></td>` : ""}
        ${M.phones ? `<td><span class="ph-cell">${M.phones[p.id] ? phoneText(M.phones[p.id]) + waLink(M.phones[p.id], p.full_name || "", t("helloMsg", { n: (p.full_name || "").split(" ")[0] })) : `<small class="no-ph">—</small>`}</span>${shared.has(p.id) ? `<small class="shared-ph" title="${esc(t("sharedNumberHelp"))}">⚠ ${t("sharedNumber")}</small>` : ""}</td>` : ""}
        ${M.referrals ? `<td class="inv-cell">${invites[p.id] ? `<b>${num(invites[p.id])}</b> <small>· ${num(invites[p.id] * (S.contest?.points_per_invite || 10))} ${t("pts")}</small>` : `<small class="no-ph">0</small>`}</td>` : ""}
        <td><select data-role ${self ? "disabled" : ""} aria-label="${t("role")}">${["student", "teacher", "admin"].map((r) => `<option value="${r}" ${p.role === r ? "selected" : ""}>${t(r)}</option>`).join("")}</select></td>
        <td><select data-subj ${p.role !== "teacher" ? "disabled" : ""} aria-label="${t("teachesSubject")}"><option value="">—</option>${S.subjects.map((s) => `<option value="${s.id}" ${p.subject_id === s.id ? "selected" : ""}>${esc(I18N.subjectName(s))}</option>`).join("")}</select></td>
        <td><span class="bar thin"><span style="width:${pct}%"></span></span> ${num(done)}/${num(total)}</td>
        <td>${last[p.id] ? new Date(last[p.id]).toLocaleDateString(I18N.lang === "ar" ? "ar-EG" : "en-GB") : t("never")}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="10" class="empty">${t("noPeople")}</td></tr>`}</tbody></table></div>`;
}
function rerenderPeople() { const body = document.getElementById("mbody"); body.innerHTML = peopleTab(); bindManage(); }
// Clear a teacher request at the same time as a role change (only once the database has the column)
const clearReq = (p) => requestsReady(p) ? { requested_role: null, requested_subject: null, requested_at: null } : {};

function bindManage() {
  const body = document.getElementById("mbody"); if (!body) return;
  document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { M.tab = b.dataset.tab; route(); }));
  if (M.tab === "live") return bindLiveTab();
  if (M.tab === "insights") return PLUS.bindInsights();
  if (M.tab === "ann") return PLUS.bindAnn();
  if (M.tab === "invites") return bindInvites();
  const msub = document.getElementById("msub");
  if (msub) msub.onchange = () => { M.subject = msub.value ? +msub.value : null; body.innerHTML = sessionsTab(); bindManage(); };
  body.querySelectorAll(".acc-item").forEach((d) => d.addEventListener("toggle", () => {
    const id = +d.dataset.sub;
    if (d.open) {
      M.openSub = id; if (isAdmin()) M.subject = id;
      body.querySelectorAll(".acc-item[open]").forEach((o) => { if (o !== d) o.open = false; });   // only one open
      const head = d.querySelector("summary");
      requestAnimationFrame(() => { if (head.getBoundingClientRect().top < 70) head.scrollIntoView({ block: "start", behavior: "smooth" }); });
    } else if (M.openSub === id) M.openSub = null;
  }));
  const add = document.getElementById("addS");
  if (add) add.onclick = () => sessionForm();
  const ps = document.getElementById("psort");
  if (ps) ps.onchange = () => { M.psort = ps.value; rerenderPeople(); document.getElementById("psort")?.focus(); };
  const pq = document.getElementById("pq");
  if (pq) pq.oninput = () => {
    M.pq = pq.value; const pos = pq.selectionStart;
    rerenderPeople();
    const again = document.getElementById("pq"); again.focus(); again.setSelectionRange(pos, pos);
  };
  body.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.pf) { M.pfilter = b.dataset.pf; rerenderPeople(); return; }
    if (b.dataset.approve || b.dataset.decline) {
      const id = b.dataset.approve || b.dataset.decline, p = M.profiles.find((x) => x.id === id);
      const li = b.closest("li"); li.querySelectorAll("button").forEach((x) => (x.disabled = true));
      try {
        if (b.dataset.approve) {
          const subject_id = +li.querySelector("[data-req-subj]").value;
          await API.updatePerson(id, { role: "teacher", subject_id, ...clearReq(p) });
          Object.assign(p, { role: "teacher", subject_id, ...clearReq(p) });
          toast(t("approvedMsg", { n: p.full_name || t("teacher") }));
        } else {
          await API.updatePerson(id, clearReq(p));
          Object.assign(p, clearReq(p));
          toast(t("declinedMsg"));
        }
        route();
      } catch (er) { fail(er); li.querySelectorAll("button").forEach((x) => (x.disabled = false)); }
      return;
    }
    if (b.dataset.addSub) { if (isAdmin()) M.subject = +b.dataset.addSub; sessionForm(); return; }
    if (b.dataset.edit) sessionForm(S.sessions.find((s) => s.id === b.dataset.edit));
    if (b.dataset.views) viewersDialog(S.sessions.find((s) => s.id === b.dataset.views));
    if (b.dataset.up || b.dataset.down) {
      const id = b.dataset.up || b.dataset.down, s = S.sessions.find((x) => x.id === id);
      const sib = S.sessions.filter((x) => x.subject_id === s.subject_id).sort((a, c) => a.position - c.position);
      const i = sib.indexOf(s), j = b.dataset.up ? i - 1 : i + 1;
      [sib[i], sib[j]] = [sib[j], sib[i]];
      sib.forEach((x, k) => (x.position = k));
      body.innerHTML = sessionsTab(); bindManage();
      try { await API.setPositions(sib.map(({ id, position }) => ({ id, position }))); } catch (er) { fail(er); }
    }
  };
  body.onchange = async (e) => {
    const tr = e.target.closest("tr[data-uid]"); if (!tr) return;
    const role = tr.querySelector("[data-role]").value;
    const subjSel = tr.querySelector("[data-subj]");
    subjSel.disabled = role !== "teacher";
    const subject_id = role === "teacher" && subjSel.value ? +subjSel.value : null;
    const p = M.profiles.find((x) => x.id === tr.dataset.uid);
    // making someone a teacher or admin by hand also settles any request they had open
    const fields = { role, subject_id, ...(role !== "student" ? clearReq(p) : {}) };
    try {
      await API.updatePerson(tr.dataset.uid, fields);
      const roleChanged = p.role !== role;
      Object.assign(p, fields);
      toast(t("saved"));
      if (roleChanged) rerenderPeople();
    } catch (er) { fail(er); }
  };
}

function shrinkLogo(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type) || file.size > 8e6) return reject(new Error("bad"));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const max = 160, k = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
      const w = Math.max(1, Math.round((img.naturalWidth || max) * k)), h = Math.max(1, Math.round((img.naturalHeight || max) * k));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let out = c.toDataURL("image/png");
      if (out.length > 120000) out = c.toDataURL("image/webp", 0.9);
      out.length <= 290000 ? resolve(out) : reject(new Error("big"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad")); };
    img.src = url;
  });
}
function sessionForm(s) {
  const editing = !!s;
  s = s || { subject_id: isAdmin() ? M.subject || S.subjects[0].id : S.profile.subject_id, title: "", description: "", youtube_id: "", attachment_url: "", published: true };
  const subs = isAdmin() ? S.subjects : S.subjects.filter((x) => x.id === S.profile.subject_id);
  const dlg = document.createElement("dialog");
  dlg.className = "modal";
  dlg.innerHTML = `
    <form method="dialog" class="form" id="sf">
      <div class="modal-head"><h2>${editing ? t("editSession") : t("addSession")}</h2><button type="button" class="icon-btn" data-close aria-label="${t("cancel")}">✕</button></div>
      <label>${t("youtubeLink")}<input name="yt" required value="${s.youtube_id ? "https://youtu.be/" + esc(s.youtube_id) : ""}" placeholder="https://youtu.be/…"><small>${t("youtubeHelp")}</small></label>
      <div class="yt-preview"><div id="ytprev"></div><span class="yt-dur"></span></div>
      <label>${t("subject")}<select name="subject">${subs.map((x) => `<option value="${x.id}" ${x.id === s.subject_id ? "selected" : ""}>${esc(x.icon)} ${esc(I18N.subjectName(x))}</option>`).join("")}</select></label>
      <label>${t("title")}<input name="title" required maxlength="140" value="${esc(s.title)}"></label>
      <label>${t("description")}<textarea name="description" rows="3">${esc(s.description)}</textarea></label>
      <label>${t("attachmentLink")}<input name="attachment" type="url" value="${esc(s.attachment_url || "")}" placeholder="https://"><small>${t("attachmentHelp")}</small></label>
      ${S.collabs ? `<div class="cb-field">
        <label>${t("collab")}<span class="cb-pick"><span class="cb-prev"></span><select name="collab"></select></span><small>${t("collabHelp")}</small></label>
        <div class="cb-new" hidden>
          <label>${t("collabName")}<input name="cbname" maxlength="60" placeholder="Life vs. Logic"></label>
          <label>${t("collabLogo")}<input name="cblogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><small>${t("collabLogoHelp")}</small></label>
          <div class="cb-new-foot"><span class="cb-new-prev"></span><button type="button" class="btn sm" data-cb-cancel>${t("cancel")}</button><button type="button" class="btn sm primary" data-cb-add>${t("addCollab")}</button></div>
        </div>
      </div>` : ""}
      <label class="check"><input type="checkbox" name="published" ${s.published ? "checked" : ""}> ${t("published")}</label>
      <p class="err" role="alert"></p>
      <div class="modal-foot">
        ${editing ? `<button type="button" class="btn danger" data-del>${t("delete")}</button>` : "<span></span>"}
        <button class="btn primary" type="submit">${t("save")}</button>
      </div>
    </form>`;
  document.body.append(dlg);
  dlg.showModal();
  const f = dlg.querySelector("form"), err = f.querySelector(".err"), durEl = f.querySelector(".yt-dur");
  let duration = s.duration_seconds || null, prev = null, prevId = null;
  const close = () => { try { prev && prev.destroy(); } catch {} dlg.close(); dlg.remove(); };
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  f.querySelector("[data-close]").onclick = close;

  const preview = async () => {
    const id = parseYouTube(f.yt.value);
    if (!id) { if (f.yt.value) err.textContent = t("invalidYoutube"); return; }
    err.textContent = "";
    if (id === prevId) return;
    prevId = id; if (id !== s.youtube_id) duration = null;
    durEl.textContent = duration ? fmtTime(duration) : t("detecting");
    await loadYouTubeApi().catch(() => {});
    if (!window.YT) return;
    try { prev && prev.destroy(); } catch {}
    const host = f.querySelector(".yt-preview"); host.querySelector("#ytprev")?.remove();
    const div = document.createElement("div"); div.id = "ytprev"; host.prepend(div);
    let probed = !!duration;
    prev = new YT.Player(div, {
      videoId: id, host: "https://www.youtube-nocookie.com", playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: (e) => {
          const d = e.target.getDuration();
          if (d) { duration = Math.round(d); durEl.textContent = fmtTime(duration); probed = true; }
          else if (!probed) { e.target.mute(); e.target.playVideo(); }
        },
        onStateChange: (e) => {
          if (!probed && e.data === YT.PlayerState.PLAYING) {
            probed = true; duration = Math.round(e.target.getDuration()) || null;
            e.target.pauseVideo(); e.target.seekTo(0, true); e.target.unMute();
            durEl.textContent = duration ? `${t("duration")}: ${fmtTime(duration)}` : "";
          }
        },
        onError: () => { durEl.textContent = ""; err.textContent = "YouTube can't play this video. Make sure it's Unlisted or Public."; },
      },
    });
  };
  f.yt.addEventListener("change", preview);
  f.yt.addEventListener("paste", () => setTimeout(preview, 0));
  if (s.youtube_id) preview();

  // ---- collab picker
  let collabTouched = editing, newLogo = null;
  const LVL_SUBJECTS = ["math", "biology"];
  const cbSel = f.collab, cbNew = f.querySelector(".cb-new");
  const fillCollabs = (selected) => {
    if (!cbSel) return;
    cbSel.innerHTML = `<option value="">${t("noCollab")}</option>${S.collabs.map((c) => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="new">+ ${t("newCollab")}</option>`;
    showPick();
  };
  const showPick = () => { const c = collabById(+cbSel.value); f.querySelector(".cb-prev").innerHTML = c ? cbLogo(c) : ""; };
  // new Biology / Math sessions start with Life vs. Logic picked (until the teacher changes it)
  const defaultCollab = () => {
    const sub = subjectById(+f.subject.value), lvl = (S.collabs || []).find((c) => c.name.toLowerCase() === "life vs. logic");
    return lvl && LVL_SUBJECTS.includes(sub?.slug) ? lvl.id : null;
  };
  if (cbSel) {
    fillCollabs(editing ? s.collab_id : defaultCollab());
    f.subject.addEventListener("change", () => { if (!collabTouched) fillCollabs(defaultCollab()); });
    cbSel.onchange = () => {
      collabTouched = true;
      if (cbSel.value === "new") { cbNew.hidden = false; f.cbname.focus(); } else { cbNew.hidden = true; }
      showPick();
    };
    f.cblogo.onchange = async () => {
      err.textContent = ""; newLogo = null; f.querySelector(".cb-new-prev").innerHTML = "";
      const file = f.cblogo.files[0]; if (!file) return;
      try { newLogo = await shrinkLogo(file); f.querySelector(".cb-new-prev").innerHTML = cbLogo({ name: "", logo: newLogo }, "lg"); }
      catch { err.textContent = t("collabLogoBad"); f.cblogo.value = ""; }
    };
    f.querySelector("[data-cb-cancel]").onclick = () => { cbNew.hidden = true; fillCollabs(null); };
    f.querySelector("[data-cb-add]").onclick = async (ev) => {
      const name = f.cbname.value.trim();
      if (!name) { err.textContent = t("collabName") + " ✱"; return f.cbname.focus(); }
      if (S.collabs.some((c) => c.name.toLowerCase() === name.toLowerCase())) { err.textContent = t("collabExists"); return; }
      ev.target.disabled = true;
      try {
        const c = await API.addCollab(name, newLogo);
        S.collabs.push(c); cbNew.hidden = true; f.cbname.value = ""; f.cblogo.value = ""; newLogo = null;
        f.querySelector(".cb-new-prev").innerHTML = ""; err.textContent = "";
        fillCollabs(c.id); toast(t("collabAdded"));
      } catch (ex) { err.textContent = ex.message; }
      ev.target.disabled = false;
    };
  }

  f.onsubmit = async (e) => {
    e.preventDefault();
    const youtube_id = parseYouTube(f.yt.value);
    if (!youtube_id) return (err.textContent = t("invalidYoutube"));
    if (!f.title.value.trim()) return (err.textContent = t("title") + " ✱");
    if (cbSel && cbSel.value === "new") return (err.textContent = t("collabFinish"));
    const subject_id = +f.subject.value;
    const row = {
      ...(editing ? { id: s.id } : { position: S.sessions.filter((x) => x.subject_id === subject_id).length }),
      subject_id, youtube_id, title: f.title.value.trim(), description: f.description.value.trim(),
      attachment_url: f.attachment.value.trim() || null, published: f.published.checked, duration_seconds: duration,
      ...(cbSel ? { collab_id: cbSel.value ? +cbSel.value : null } : {}),
    };
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try {
      const saved = await API.saveSession(row);
      const i = S.sessions.findIndex((x) => x.id === saved.id);
      if (i >= 0) S.sessions[i] = saved; else S.sessions.push(saved);
      M.openSub = saved.subject_id; if (isAdmin()) M.subject = saved.subject_id;
      toast(t("saved")); close(); route();
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  };
  const del = f.querySelector("[data-del]");
  if (del) del.onclick = async () => {
    if (!confirm(t("confirmDelete"))) return;
    try { await API.deleteSession(s.id); S.sessions = S.sessions.filter((x) => x.id !== s.id); delete S.progress[s.id]; toast(t("deleted")); close(); route(); }
    catch (ex) { err.textContent = ex.message; }
  };
}

// ---------------------------------------------------------------- account
function accountRequestCard() {
  const p = S.profile;
  if (p.role !== "student" || !requestsReady(p)) return "";
  if (hasRequest(p)) return `<div class="card pad form" id="rq">
      <h2>${t("teacherAccess")}</h2>
      ${requestBanner()}
      <button type="button" class="btn" data-rq="cancel">${t("cancelRequest")}</button>
    </div>`;
  return `<form class="card pad form" id="rq">
      <h2>${t("areYouTeacher")}</h2>
      <p class="srow-meta">${t("teacherNeedsApproval")}</p>
      <label>${t("teachSubject")}<select name="subject" required><option value="">—</option>${S.subjects.map((x) => `<option value="${x.id}">${esc(I18N.subjectName(x))}</option>`).join("")}</select></label>
      <button class="btn primary">${t("requestTeacher")}</button>
    </form>`;
}
function viewAccount() {
  return shell(`
    <h1 class="page-title">${t("account")}</h1>
    <div class="acct">
      <form class="card pad form" id="pf">
        <label>${t("yourName")}<input name="name" value="${esc(S.profile.full_name)}" required></label>
        <label>${t("email")}<input value="${esc(S.user.email || "")}" disabled></label>
        ${"school" in S.profile ? schoolField(S.profile.school || "") : ""}
        <p class="srow-meta">${t("role")}: <b>${t(S.profile.role)}</b>${S.profile.subject_id ? " · " + esc(I18N.subjectName(subjectById(S.profile.subject_id))) : ""}</p>
        <div class="seg"><span>${t("language")}</span>
          <button type="button" data-lang="en" aria-pressed="${I18N.lang === "en"}">English</button>
          <button type="button" data-lang="ar" aria-pressed="${I18N.lang === "ar"}">العربية</button></div>
        <button class="btn primary">${t("saveChanges")}</button>
      </form>
      ${S.phoneReady ? `<form class="card pad form" id="ph" novalidate>
        <label>${t("phone")}<input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="01xxxxxxxxx" value="${esc(S.myPhone || "")}"><small>${t("phoneWhyShort")}</small></label>
        <p class="err" role="alert"></p>
        <button class="btn ${S.myPhone ? "" : "primary"}">${t("savePhone")}</button>
      </form>` : ""}
      ${accountRequestCard()}
      ${PLUS.accountExtras()}
      <form class="card pad form" id="pw">
        <label>${t("newPassword")}<input name="password" type="password" minlength="6" autocomplete="new-password" required></label>
        <button class="btn">${t("savePassword")}</button>
        <hr>
        <button type="button" class="btn danger" id="out">${t("signOut")}</button>
      </form>
    </div>`);
}
function bindAccount() {
  const pf = document.getElementById("pf"); if (!pf) return;
  bindSchool(pf);
  pf.querySelectorAll("[data-lang]").forEach((b) => (b.onclick = () => { I18N.set(b.dataset.lang); route(); }));
  pf.onsubmit = async (e) => {
    e.preventDefault();
    const fields = { full_name: pf.name.value.trim() };
    if (pf.school) {
      fields.school = pf.school.value.trim();
      if (!fields.school && !isAdmin()) return toast(t("schoolNeeded"), "bad");
    }
    try { await API.updateProfile(fields); Object.assign(S.profile, fields); toast(t("saved")); route(); } catch (er) { fail(er); }
  };
  const ph = document.getElementById("ph");
  if (ph) ph.onsubmit = async (e) => {
    e.preventDefault();
    const v = normalizePhone(ph.phone.value);
    if (!v) { ph.querySelector(".err").textContent = t("phoneBad"); return; }
    ph.querySelector(".err").textContent = "";
    try { await API.saveMyPhone(v); S.myPhone = v; ph.phone.value = v; toast(t("phoneSaved")); } catch (er) { ph.querySelector(".err").textContent = phoneErrText(er); }
  };
  const rq = document.getElementById("rq");
  if (rq) {
    rq.onsubmit = async (e) => {
      e.preventDefault();
      if (!rq.subject.value) return;
      const fields = { requested_role: "teacher", requested_subject: +rq.subject.value, requested_at: new Date().toISOString() };
      try { await API.updateProfile(fields); Object.assign(S.profile, fields); toast(t("requestSent")); route(); } catch (er) { fail(er); }
    };
    rq.onclick = async (e) => {
      if (!e.target.closest('[data-rq="cancel"]')) return;
      const fields = { requested_role: null, requested_subject: null, requested_at: null };
      try { await API.updateProfile(fields); Object.assign(S.profile, fields); toast(t("requestCancelled")); route(); } catch (er) { fail(er); }
    };
  }
  const pw = document.getElementById("pw");
  pw.onsubmit = async (e) => {
    e.preventDefault();
    try { await API.updatePassword(pw.password.value); pw.reset(); toast(t("passwordUpdated")); } catch (er) { fail(er); }
  };
  document.getElementById("out").onclick = async () => { await API.signOut(); };
  PLUS.bindAccount();
}

// ---------------------------------------------------------------- router
let routing = 0;
async function route() {
  const my = ++routing;
  if (S.player) { clearInterval(S.player._upnextTimer); S.player.destroy(); S.player = null; }
  S.cleanups.splice(0).forEach((fn) => { try { fn(); } catch {} });
  const path = (location.hash.replace(/^#/, "") || "/").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  // the key the animations use: tabs inside Manage count as their own pages
  const fxKey = S.user ? path + (parts[0] === "manage" && !parts[1] ? "#" + M.tab : "") : "auth/" + (parts[0] || "login");
  await FX.beforeRender(fxKey);
  if (my !== routing) return;
  const toTop = () => window.scrollTo(0, 0);      // after the old page has been captured for the morph

  if (!S.user) {
    toTop();
    if (parts[0] === "signup") viewSignup();
    else if (parts[0] === "forgot") viewForgot();
    else if (parts[0] === "join") { savePendingRef(parts[1]); viewSignup(); }       // came from someone's invite link
    else if (parts[0] === "checkin" && parts[1]) {
      // Came from a session QR code: remember it so check-in finishes after sign-in / sign-up
      try { sessionStorage.setItem("onsite.pendingCode", parts[1]); } catch {}
      viewLogin(t("signinToCheckin"));
    } else viewLogin();
    return FX.afterRender(fxKey);
  }
  if (parts[0] === "reset") { toTop(); viewReset(); return FX.afterRender(fxKey); }
  if (["login", "signup", "forgot"].includes(parts[0])) return go("/");
  if (parts[0] === "join") { clearPendingRef(); toast(t("alreadyMember")); return go("/invite"); }
  if (infoMissing()) { toTop(); viewInfoGate(); return FX.afterRender("gate"); }
  // Manage loads extra data: show a skeleton while it does
  if (parts[0] === "invite" && !document.querySelector(".inv-hero")) { toTop(); $app.innerHTML = shell(FX.skeleton("home"), "invite"); }
  if (parts[0] === "manage") {
    const mb = document.getElementById("mbody");
    toTop();
    if (mb) mb.innerHTML = FX.skeleton("list");
    else $app.innerHTML = shell(FX.skeleton("manage"), "manage");
  }

  let html;
  switch (parts[0]) {
    case undefined: html = viewHome(); break;
    case "subject": html = viewSubject(parts[1]); break;
    case "watch": html = viewWatch(parts[1]); break;
    case "progress": html = viewProgress(); break;
    case "manage":
      if (parts[1] === "live" && parts[2]) html = isStaff() ? await viewLiveDetail(parts[2]) : shell(`<p class="empty">${t("notAllowed")}</p>`);
      else html = await viewManage();
      break;
    case "checkin": html = viewCheckin(); break;
    case "invite": html = await viewInvite(); break;
    case "account": html = viewAccount(); break;
    default: html = viewHome();
  }
  if (my !== routing) return;
  // Draw the new page. FEEL.commit morphs into it when it can (subject card → subject page,
  // thumbnail → player); otherwise this just runs.
  await FEEL.commit(fxKey, () => {
    if (my !== routing) return;
    $app.innerHTML = html;
    toTop();
    document.title = `${CFG.CLUB_NAME} Sessions`;
    if (parts[0] === "subject") bindSubject();
    if (parts[0] === "watch") bindWatch(parts[1]);
    if (parts[0] === "manage") { if (parts[1] === "live" && parts[2]) { if (isStaff()) bindLiveDetail(parts[2]); } else bindManage(); }
    if (parts[0] === "checkin") bindCheckin(parts[1]);
    if (parts[0] === "account") bindAccount();
    if (parts[0] === "progress") PLUS.bindProgress();
    if (parts[0] === "invite") bindInvite();
    FX.afterRender(fxKey);
    if (!parts[0] || parts[0] === "subject") PLUS.cheerAnn($app);
  });
}

async function afterSignIn() {
  S.user = await API.currentUser();
  if (!S.user) return route();
  $app.innerHTML = FX.bootSkeleton();
  try { await loadAll(); PLUS.afterLoad(); inviteAfterLoad(); }
  catch (e) {
    // no internet: open from the copy saved on this device last time
    if (!PLUS.restore()) fail(e); else toast(t("offlineOpened"), "bad");
  }
  let pending = null;
  try { pending = sessionStorage.getItem("onsite.pendingCode"); sessionStorage.removeItem("onsite.pendingCode"); } catch {}
  if (pending && !location.hash.startsWith("#/checkin/")) { location.hash = "/checkin/" + pending; return; } // hashchange will route
  if (["#/login", "#/signup", "#/forgot", "", "#"].includes(location.hash)) {
    if (location.hash !== "#/") { location.hash = "/"; return; } // hashchange will route
  }
  route();
}

(async function init() {
  const h = location.hash;
  const fromEmail = /access_token|type=recovery|error_description/.test(h) || /[?&]code=/.test(location.search);
  if (/error_description/.test(h)) {
    const msg = decodeURIComponent((h.match(/error_description=([^&]+)/) || [])[1] || "").replace(/\+/g, " ");
    history.replaceState(null, "", location.pathname + "#/login");
    S.user = null; return viewLogin(msg);
  }
  API.onAuth(async (event, user) => {
    if (event === "PASSWORD_RECOVERY") { S.user = user; await loadAll().catch(() => {}); location.hash = "/reset"; return route(); }
    if (event === "SIGNED_OUT") { Object.assign(S, { user: null, profile: null, progress: {} }); location.hash = "/login"; return route(); }
    if (event === "SIGNED_IN" && fromEmail && !S.user) { history.replaceState(null, "", location.pathname + "#/"); return afterSignIn(); }
  });
  window.addEventListener("hashchange", () => { if (!/access_token/.test(location.hash)) route(); });
  if (fromEmail && !API.demo) { $app.innerHTML = FX.bootSkeleton(); setTimeout(() => { if (!S.user) afterSignIn(); }, 1500); return; }
  await afterSignIn();
})();
