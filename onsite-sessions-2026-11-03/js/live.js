// Dorm sessions: logging in-person lessons, check-in codes / QR, attendance.
// Uses helpers defined in app.js (shell, esc, S, M, toast, ...) at call time.
const L = { dorms: [], staff: [], list: [], filter: { status: "all", dorm: "", subject: "" } };
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I, easy to read off a screen

function newCode() {
  const a = new Uint32Array(6); crypto.getRandomValues(a);
  return Array.from(a, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
}
const checkinUrl = (code) => location.origin + location.pathname + "#/checkin/" + code;
const fmtCode = (c) => (c ? c.slice(0, 3) + " " + c.slice(3) : "");
const locale = () => (I18N.lang === "ar" ? "ar-EG" : "en-GB");
const fmtDT = (iso) => new Date(iso).toLocaleString(locale(), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fmtClock = (iso) => new Date(iso).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const dormById = (id) => L.dorms.find((d) => d.id === id);
const dormLabel = (d) => (d ? (I18N.lang === "ar" && d.name_ar ? d.name_ar : d.name_en) : "");
const metaJoin = (parts) => parts.filter(Boolean).map((x) => `<bdi>${esc(x)}</bdi>`).join(" · ");
const liveTitle = (l) => l.topic || I18N.subjectName(subjectById(l.subject_id));
const isMissingTable = (e) => e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42883" || /does not exist|could not find the (table|function)/i.test(e.message || ""));

function liveState(l) {
  if (l.status === "live") return { key: "live", label: t("stLive") };
  if (l.status === "ended") return { key: "ended", label: t("stEnded") };
  return { key: "scheduled", label: t("stScheduled") };
}
const statusPill = (l) => { const st = liveState(l); return `<span class="status s-${st.key}">${st.key === "live" ? '<span class="live-dot" aria-hidden="true"></span>' : ""}${st.label}</span>`; };

async function loadLiveRefs() {
  const [dorms, profiles] = await Promise.all([API.listDorms(), API.listProfiles().catch(() => [])]);
  L.dorms = dorms;
  L.staff = profiles.filter((p) => p.role === "teacher" || p.role === "admin")
    .sort((a, b) => (a.role === b.role ? (a.full_name || "").localeCompare(b.full_name || "") : a.role === "teacher" ? -1 : 1));
}

// ---------------------------------------------------------------- manage tab
async function liveTab() {
  try { await loadLiveRefs(); L.list = await API.listLive(); }
  catch (e) { if (isMissingTable(e)) return `<p class="note">${t("needUpdate")}</p>`; throw e; }
  const f = L.filter;
  const rows = L.list.filter((l) => (f.status === "all" || l.status === f.status) && (!f.dorm || l.dorm_id === +f.dorm) && (!f.subject || l.subject_id === +f.subject));
  const chips = [["all", t("allOpt")], ["live", t("stLive")], ["scheduled", t("stScheduled")], ["ended", t("stEnded")]];
  const checks = rows.reduce((a, l) => a + (l.checked_in || 0), 0);
  return `
    <div class="mtools">
      <div class="filters">
        <div class="chips" role="group" aria-label="${t("allOpt")}">${chips.map(([k, lab]) => `<button type="button" class="chip" data-st="${k}" aria-pressed="${f.status === k}">${lab}</button>`).join("")}</div>
        <select id="ldorm" aria-label="${t("dorm")}"><option value="">${t("allDorms")}</option>${L.dorms.map((d) => `<option value="${d.id}" ${+f.dorm === d.id ? "selected" : ""}>${esc(dormLabel(d))}</option>`).join("")}</select>
        ${isAdmin() ? `<select id="lsub" aria-label="${t("subject")}"><option value="">${t("allSubjects")}</option>${S.subjects.map((s) => `<option value="${s.id}" ${+f.subject === s.id ? "selected" : ""}>${esc(I18N.subjectName(s))}</option>`).join("")}</select>` : ""}
      </div>
      <div class="mtools-actions">
        <button class="btn" id="logLive">${t("logSession")}</button>
        <button class="btn primary" id="startLive">${t("startNow")}</button>
      </div>
    </div>
    ${L.list.length ? `<p class="srow-meta live-sum">${t("liveSummary", { a: num(rows.length), b: num(checks) })}</p>` : ""}
    ${rows.length ? `<ul class="live-list">${rows.map(liveRow).join("")}</ul>` : `<p class="empty">${L.list.length ? t("noLiveMatch") : t("noLive")}</p>`}`;
}
function liveRow(l) {
  const sub = subjectById(l.subject_id), d = new Date(l.starts_at);
  const counts = [l.checked_in ? "✓ " + t("checkedInN", { n: num(l.checked_in) }) : "", l.attended_count != null ? t("countedN", { n: num(l.attended_count) }) : ""].filter(Boolean).join(" · ");
  return `<li><a class="live-row" href="#/manage/live/${esc(l.id)}">
    <span class="date-block" style="--c:${esc(tone(sub))}"><b>${d.toLocaleDateString(locale(), { day: "numeric" })}</b><small>${d.toLocaleDateString(locale(), { month: "short" })}</small></span>
    <span class="live-body"><b>${sticker(sub, "xs")} ${esc(liveTitle(l))}</b>
      <span class="srow-meta">${metaJoin([I18N.subjectName(sub), dormLabel(dormById(l.dorm_id)), l.teacher_name, fmtClock(l.starts_at)])}</span></span>
    <span class="live-right">${statusPill(l)}${counts ? `<span class="srow-meta">${counts}</span>` : ""}</span>
  </a></li>`;
}
function bindLiveTab() {
  const body = document.getElementById("mbody"); if (!body) return;
  body.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => { L.filter.status = b.dataset.st; route(); }));
  const ld = document.getElementById("ldorm"); if (ld) ld.onchange = () => { L.filter.dorm = ld.value; route(); };
  const ls = document.getElementById("lsub"); if (ls) ls.onchange = () => { L.filter.subject = ls.value; route(); };
  const st = document.getElementById("startLive"); if (st) st.onclick = () => liveDialog("start");
  const lg = document.getElementById("logLive"); if (lg) lg.onclick = () => liveDialog("log");
}

// ---------------------------------------------------------------- the shared form
function liveFields(mode, s) {
  const admin = isAdmin();
  const lockedSub = !admin && S.profile.subject_id;
  const subs = lockedSub ? S.subjects.filter((x) => x.id === S.profile.subject_id) : S.subjects;
  const staff = L.staff;
  const otherSel = !s.teacher_id && (!!s.teacher_name || !staff.length);
  const recs = (sid) => S.sessions.filter((v) => v.subject_id === sid);
  const happened = s.status === "ended";
  return `
    <div class="form-grid">
      <label>${t("dorm")}<select name="dorm" required>
        ${L.dorms.map((d) => `<option value="${d.id}" ${s.dorm_id === d.id ? "selected" : ""}>${esc(dormLabel(d))}</option>`).join("")}
        ${admin ? `<option value="__add">${t("addDorm")}</option>` : ""}</select></label>
      <label>${t("subject")}<select name="subject" ${lockedSub ? "disabled" : ""}>${subs.map((x) => `<option value="${x.id}" ${x.id === s.subject_id ? "selected" : ""}>${esc(x.icon)} ${esc(I18N.subjectName(x))}</option>`).join("")}</select></label>
      <label class="new-dorm" hidden>${t("newDormName")}<input name="newDorm" maxlength="60"></label>
      ${admin ? `<label>${t("teacher")}<select name="teacher">
          ${staff.map((p) => `<option value="${esc(p.id)}" ${s.teacher_id === p.id ? "selected" : ""}>${esc(p.full_name || "—")}${p.subject_id ? " (" + esc(I18N.subjectName(subjectById(p.subject_id))) + ")" : ""}</option>`).join("")}
          <option value="__other" ${otherSel ? "selected" : ""}>${t("otherTeacher")}</option></select></label>
        <label class="other-teacher" ${otherSel ? "" : "hidden"}>${t("teacherName")}<input name="teacherName" maxlength="80" value="${esc(s.teacher_id ? "" : s.teacher_name)}"></label>` : ""}
      <label class="span2">${t("topic")}<input name="topic" maxlength="140" value="${esc(s.topic)}" placeholder="${t("topicPh")}"></label>
      <label class="span2">${t("place")}<input name="location" maxlength="80" value="${esc(s.location)}" placeholder="${t("placePh")}"></label>
      ${mode !== "start" ? `
        <label>${t("startsAt")}<input type="datetime-local" name="startsAt" required value="${toLocalInput(new Date(s.starts_at))}"></label>
        <label>${t("lengthMin")}<input type="number" name="duration" min="5" max="600" step="5" value="${s.duration_min || 60}"></label>` : ""}
    </div>
    ${mode === "log" ? `
      <fieldset class="seg-field"><legend>${t("sessionIs")}</legend>
        <label class="radio-pill"><input type="radio" name="state" value="upcoming" ${happened ? "" : "checked"}> ${t("upcoming")}</label>
        <label class="radio-pill"><input type="radio" name="state" value="happened" ${happened ? "checked" : ""}> ${t("happened")}</label>
      </fieldset>` : ""}
    ${mode !== "start" ? `
      <div class="after-group" ${mode === "log" && !happened ? "hidden" : ""}>
        ${mode === "log" ? `<h3>${t("afterSession")}</h3>
        <label>${t("headcount")}<input type="number" name="headcount" min="0" max="2000" value="${s.attended_count ?? ""}"><small>${t("headcountHelp")}</small></label>` : ""}
        <label>${t("sessionNotes")}<textarea name="notes" rows="3" placeholder="${t("notesPh")}">${esc(s.notes)}</textarea></label>
        <label>${t("recording")}<select name="recording"><option value="">${t("noneOpt")}</option>${recs(s.subject_id).map((v) => `<option value="${esc(v.id)}" ${s.recording_id === v.id ? "selected" : ""}>${esc(v.title)}</option>`).join("")}</select></label>
      </div>` : ""}`;
}
function wireLiveForm(f, s) {
  const dorm = f.dorm, nd = f.querySelector(".new-dorm");
  dorm.onchange = () => { nd.hidden = dorm.value !== "__add"; if (!nd.hidden) f.newDorm.focus(); };
  if (dorm.value === "__add") nd.hidden = false;
  const refreshRecs = () => {
    if (!f.recording) return;
    const sid = +f.subject.value, cur = f.recording.value;
    f.recording.innerHTML = `<option value="">${t("noneOpt")}</option>` + S.sessions.filter((v) => v.subject_id === sid).map((v) => `<option value="${esc(v.id)}">${esc(v.title)}</option>`).join("");
    f.recording.value = [...f.recording.options].some((o) => o.value === cur) ? cur : "";
  };
  f.subject.onchange = refreshRecs;
  if (f.teacher) f.teacher.onchange = () => {
    const other = f.teacher.value === "__other";
    f.querySelector(".other-teacher").hidden = !other;
    if (other) { f.teacherName.focus(); return; }
    const p = L.staff.find((x) => x.id === f.teacher.value);
    if (p && p.subject_id && !f.subject.disabled) { f.subject.value = p.subject_id; refreshRecs(); }
  };
  f.querySelectorAll('input[name="state"]').forEach((r) => (r.onchange = () => { f.querySelector(".after-group").hidden = f.state.value !== "happened"; }));
}
async function readLiveForm(f, mode) {
  let dorm_id = f.dorm.value;
  if (dorm_id === "__add") {
    const name = f.newDorm.value.trim();
    if (!name) throw new Error(t("newDormName") + " ✱");
    const d = await API.addDorm(name, name); L.dorms.push(d); dorm_id = d.id;
  }
  const row = { dorm_id: +dorm_id || null, subject_id: +f.subject.value, topic: f.topic.value.trim(), location: f.location.value.trim() };
  if (isAdmin()) {
    if (f.teacher.value === "__other") {
      row.teacher_id = null; row.teacher_name = f.teacherName.value.trim();
      if (!row.teacher_name) throw new Error(t("teacherName") + " ✱");
    } else { const p = L.staff.find((x) => x.id === f.teacher.value); row.teacher_id = p.id; row.teacher_name = p.full_name || ""; }
  } else { row.teacher_id = S.profile.id; row.teacher_name = S.profile.full_name || ""; }
  if (mode !== "start") {
    const d = new Date(f.startsAt.value);
    if (isNaN(d)) throw new Error(t("startsAt") + " ✱");
    row.starts_at = d.toISOString();
    row.duration_min = Math.min(600, Math.max(5, +f.duration.value || 60));
    row.notes = f.notes.value.trim();
    row.recording_id = f.recording.value || null;
  }
  if (mode === "log") {
    if (f.state.value === "happened") {
      row.status = "ended"; row.started_at = row.starts_at;
      row.ended_at = new Date(new Date(row.starts_at).getTime() + row.duration_min * 60000).toISOString();
      row.attended_count = f.headcount.value === "" ? null : Math.max(0, +f.headcount.value);
    } else row.status = "scheduled";
    row.checkin_open = false;
  }
  if (mode === "start") {
    const now = new Date().toISOString();
    Object.assign(row, { status: "live", starts_at: now, started_at: now, duration_min: 60, code: newCode(), checkin_open: true });
  }
  return row;
}
// Saves, picking a new code if two open sessions happen to get the same one.
async function saveLiveSafe(row) {
  for (let i = 0; ; i++) {
    try { return await API.saveLive(row); }
    catch (e) { if (e.code === "23505" && row.code && i < 3) { row.code = newCode(); continue; } throw e; }
  }
}
function liveDialog(mode) {
  const s = { subject_id: S.profile.subject_id || S.subjects[0]?.id, dorm_id: L.dorms[0]?.id, teacher_id: isAdmin() ? (L.staff.find((p) => p.role === "teacher")?.id || L.staff[0]?.id) : S.profile.id,
    teacher_name: "", topic: "", location: "", starts_at: new Date().toISOString(), duration_min: 60, status: mode === "log" ? "ended" : "scheduled", notes: "", recording_id: null, attended_count: null };
  if (isAdmin() && s.teacher_id) s.subject_id = L.staff.find((p) => p.id === s.teacher_id)?.subject_id || s.subject_id;
  const dlg = document.createElement("dialog");
  dlg.className = "modal";
  dlg.innerHTML = `<form class="form" novalidate>
      <div class="modal-head"><h2>${mode === "start" ? t("startSession") : t("logSession")}</h2><button type="button" class="icon-btn" data-close aria-label="${t("cancel")}">✕</button></div>
      ${liveFields(mode, s)}
      <p class="err" role="alert"></p>
      <div class="modal-foot"><span></span><button class="btn primary" type="submit">${mode === "start" ? t("startAndShow") : t("save")}</button></div>
    </form>`;
  document.body.append(dlg); dlg.showModal();
  const f = dlg.querySelector("form"), err = f.querySelector(".err");
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  f.querySelector("[data-close]").onclick = close;
  wireLiveForm(f, s);
  f.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = "";
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try {
      const saved = await saveLiveSafe(await readLiveForm(f, mode));
      close(); toast(t("saved"));
      M.tab = "live"; go("/manage/live/" + saved.id);
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- one session
async function viewLiveDetail(id) {
  M.tab = "live";
  let ls, att;
  try { await loadLiveRefs(); [ls, att] = await Promise.all([API.getLive(id), API.listAttendance(id)]); }
  catch (e) { if (isMissingTable(e)) return shell(`<p class="note">${t("needUpdate")}</p>`, "manage"); throw e; }
  if (!ls) return shell(`<a class="crumb" href="#/manage">← ${t("dormSessions")}</a><p class="empty">${t("sessionNotFound")}</p>`, "manage");
  L.cur = { ls, att };
  const sub = subjectById(ls.subject_id);
  const meta = [dormLabel(dormById(ls.dorm_id)), ls.teacher_name && t("withTeacher", { t: ls.teacher_name }), fmtDT(ls.starts_at), t("minShort", { n: num(ls.duration_min) }), ls.location].filter(Boolean);
  return shell(`
    <a class="crumb" href="#/manage">← ${t("dormSessions")}</a>
    <header class="live-head" style="--c:${esc(tone(sub))}">
      <span class="subject-glyph sm">${esc(sub?.icon)}</span>
      <div><p class="srow-meta">${esc(I18N.subjectName(sub))}</p><h1>${esc(liveTitle(ls))}</h1>
      <p class="srow-meta live-meta">${metaJoin(meta)}</p></div>
      <span id="stPill">${statusPill(ls)}</span>
    </header>
    <div class="live-grid">
      <section class="card pad" id="ciCard">${ciCardHtml(ls)}</section>
      <section class="card pad" id="attCard">${attCardHtml(ls, att)}</section>
    </div>
    <section class="card pad det-card">
      <h2>${t("details")}</h2>
      <form class="form" id="detForm" novalidate>${liveFields("edit", ls)}
        <p class="err" role="alert"></p>
        <div class="modal-foot"><button type="button" class="btn danger" id="delLive">${t("delete")}</button><button class="btn primary">${t("saveChanges")}</button></div>
      </form>
    </section>`, "manage");
}
function ciCardHtml(ls) {
  const h = `<h2>${t("checkinCard")}</h2>`;
  if (ls.status === "scheduled") return `${h}<p class="srow-meta">${t("scheduledHint")}</p><button class="btn primary" data-l="start">${t("startAndShow")}</button>`;
  if (ls.status === "ended") return `${h}<p class="srow-meta">${t("endedAt", { t: fmtDT(ls.ended_at || ls.starts_at) })}</p><button class="btn sm" data-l="reopen">${t("reopen")}</button>`;
  if (!ls.checkin_open || !ls.code) return `${h}<p class="note">${t("checkinPaused")}</p>
    <div class="btn-row"><button class="btn primary" data-l="resume">${t("resumeCheckin")}</button><button class="btn danger" data-l="end">${t("endSession")}</button></div>`;
  return `${h}
    <div class="code-box">
      <div class="qr-box">${makeQrSvg(checkinUrl(ls.code), { label: t("checkinTitle") })}</div>
      <div class="code-side">
        <span class="srow-meta">${t("codeLabel")}</span>
        <b class="big-code" dir="ltr">${fmtCode(ls.code)}</b>
        <p class="srow-meta">${t("scanHelp")}</p>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn primary" data-l="present">${t("fullScreen")}</button>
      <button class="btn" data-l="newcode" title="${t("newCodeHelp")}">${t("newCode")}</button>
      <button class="btn" data-l="pause">${t("pauseCheckin")}</button>
      <button class="btn danger" data-l="end">${t("endSession")}</button>
    </div>`;
}
function attListHtml(att) {
  if (!att.length) return `<p class="empty">${t("noAttendees")}</p>`;
  return `<ol class="att-list">${att.map((a) => `<li>
    <span class="att-av" aria-hidden="true">${esc((a.full_name || "?").trim().charAt(0).toUpperCase())}</span>
    <span class="att-name">${esc(a.full_name || "—")}</span>
    <span class="srow-meta">${fmtClock(a.checked_in_at)} · ${a.method === "qr" ? t("viaQr") : t("viaCode")}</span>
    <button class="icon-btn" data-rm="${esc(a.user_id)}" data-name="${esc(a.full_name)}" aria-label="${t("remove")} ${esc(a.full_name)}">✕</button>
  </li>`).join("")}</ol>`;
}
function attCardHtml(ls, att) {
  return `<h2>${t("attendance")}</h2>
    <p class="att-count">${t("checkedInN", { n: `<b id="attN">${num(att.length)}</b>` })}</p>
    <form id="hcForm" class="hc-form" novalidate>
      <label>${t("headcount")}<input type="number" name="hc" min="0" max="2000" value="${ls.attended_count ?? ""}"></label>
      <button class="btn sm">${t("saveHeadcount")}</button>
      <small>${t("headcountHelp")}</small>
    </form>
    <div id="attList">${attListHtml(att)}</div>
    <button class="btn sm" id="csv" ${att.length ? "" : "hidden"}>${t("downloadCsv")}</button>`;
}
function bindLiveDetail(id) {
  if (!L.cur || L.cur.ls.id !== id) return;
  let { ls, att } = L.cur;
  const ci = document.getElementById("ciCard"), ac = document.getElementById("attCard");
  const paintCi = () => { ci.innerHTML = ciCardHtml(ls); document.getElementById("stPill").innerHTML = statusPill(ls); paintPresent(); };
  const paintAtt = (before) => {
    const n = document.getElementById("attN"); if (!n) return;
    n.textContent = num(att.length);
    document.getElementById("attList").innerHTML = attListHtml(att);
    document.getElementById("csv").hidden = !att.length;
    paintPresent();
    // whoever just checked in slides in with a green flash
    if (before) {
      const fresh = att.filter((a) => !before.has(a.user_id));
      if (fresh.length) {
        FX.bump(n); FX.bump(present?.querySelector(".present-n b"));
        fresh.forEach((a) => FX.flash(document.querySelector(`#attList [data-rm="${CSS.escape(a.user_id)}"]`)?.closest("li")));
        if (present) FX.confetti({ count: 40, spread: 50, origin: { x: 0.75, y: 0.6 }, power: 0.7 });
      }
    }
  };
  const update = async (patch) => {
    try { ls = await saveLiveSafe({ id: ls.id, ...patch }); L.cur.ls = ls; paintCi(); }
    catch (e) { fail(e); }
  };
  ci.onclick = async (e) => {
    const b = e.target.closest("[data-l]"); if (!b) return;
    const now = new Date().toISOString();
    switch (b.dataset.l) {
      case "start": return update({ status: "live", started_at: now, starts_at: new Date(ls.starts_at) > new Date() ? now : ls.starts_at, ended_at: null, code: newCode(), checkin_open: true });
      case "newcode": return update({ code: newCode() });
      case "pause": return update({ checkin_open: false });
      case "resume": return update({ checkin_open: true, code: ls.code || newCode() });
      case "reopen": return update({ status: "live", ended_at: null, checkin_open: true, code: newCode() });
      case "end": if (confirm(t("confirmEnd"))) { closePresent(); return update({ status: "ended", ended_at: now, checkin_open: false }); } return;
      case "present": return openPresent();
    }
  };
  ac.onclick = async (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      if (!confirm(t("confirmRemove", { n: rm.dataset.name || "—" }))) return;
      try { await API.removeAttendance(ls.id, rm.dataset.rm); att = att.filter((a) => a.user_id !== rm.dataset.rm); L.cur.att = att; paintAtt(); } catch (er) { fail(er); }
    }
    if (e.target.id === "csv") downloadCsv(ls, att);
  };
  document.getElementById("hcForm").onsubmit = async (e) => {
    e.preventDefault();
    const v = e.target.hc.value;
    try { ls = await API.saveLive({ id: ls.id, attended_count: v === "" ? null : Math.max(0, +v) }); L.cur.ls = ls; toast(t("saved")); } catch (er) { fail(er); }
  };
  const df = document.getElementById("detForm");
  wireLiveForm(df, ls);
  df.onsubmit = async (e) => {
    e.preventDefault(); const err = df.querySelector(".err"); err.textContent = "";
    try { await API.saveLive({ id: ls.id, ...(await readLiveForm(df, "edit")) }); toast(t("saved")); route(); } catch (ex) { err.textContent = ex.message; }
  };
  document.getElementById("delLive").onclick = async () => {
    if (!confirm(t("confirmDeleteLive"))) return;
    try { await API.deleteLive(ls.id); toast(t("deleted")); go("/manage"); } catch (er) { fail(er); }
  };

  // Full-screen code for students to scan
  let present = null;
  function openPresent() {
    closePresent();
    present = document.createElement("div");
    present.className = "present"; present.setAttribute("role", "dialog"); present.setAttribute("aria-modal", "true"); present.setAttribute("aria-label", t("checkinCard"));
    document.body.append(present);
    paintPresent();
    present.onclick = (e) => { if (e.target.closest("[data-x]")) closePresent(); };
    present.requestFullscreen?.().catch(() => {});
    present.querySelector("[data-x]")?.focus();
  }
  function paintPresent() {
    if (!present) return;
    if (ls.status !== "live" || !ls.checkin_open) return closePresent();
    const sub = subjectById(ls.subject_id);
    present.innerHTML = `<button type="button" class="present-x" data-x aria-label="${t("cancel")}">✕</button>
      <div class="present-qr">${makeQrSvg(checkinUrl(ls.code), { label: t("checkinTitle") })}</div>
      <div class="present-side">
        <span class="present-sub">${sticker(sub, "sm")} ${esc(liveTitle(ls))}</span>
        <b class="present-code" dir="ltr">${fmtCode(ls.code)}</b>
        <span class="present-n">${t("checkedInN", { n: `<b>${num(att.length)}</b>` })}</span>
        <span class="present-help">${t("scanHelp")}</span>
      </div>`;
  }
  function closePresent() {
    if (!present) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    present.remove(); present = null;
  }
  const onKey = (e) => { if (e.key === "Escape" && present) closePresent(); };
  document.addEventListener("keydown", onKey);

  // Keep the attendee list fresh while the session is live: instantly through live database
  // updates when they're switched on (plus.sql), with a check every few seconds as a backup.
  let busy = false;
  const refresh = async () => {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const [l2, a2] = await Promise.all([API.getLive(ls.id), API.listAttendance(ls.id)]);
      if (!l2) return;
      const ciChanged = l2.status !== ls.status || l2.code !== ls.code || l2.checkin_open !== ls.checkin_open;
      const attChanged = a2.length !== att.length || a2.some((a, i) => a.user_id !== att[i]?.user_id);
      const before = new Set(att.map((a) => a.user_id));
      ls = l2; att = a2; L.cur = { ls, att };
      if (ciChanged) paintCi();
      if (attChanged) paintAtt(before);
    } catch {} finally { busy = false; }
  };
  const timer = setInterval(() => { if (ls.status === "live") refresh(); }, 4000);
  const unsub = API.subscribe ? API.subscribe("attendance", `live_session_id=eq.${ls.id}`, () => refresh()) : () => {};
  S.cleanups.push(() => { clearInterval(timer); unsub(); document.removeEventListener("keydown", onKey); closePresent(); });
}
function downloadCsv(ls, att) {
  const sub = subjectById(ls.subject_id);
  const lines = [
    [t("subject"), I18N.subjectName(sub)], [t("topic"), ls.topic], [t("dorm"), dormLabel(dormById(ls.dorm_id))],
    [t("teacher"), ls.teacher_name], [t("startsAt"), new Date(ls.starts_at).toLocaleString(locale())],
    [t("headcount"), ls.attended_count ?? ""], [],
    ["#", t("fullName"), t("started"), ""],
    ...att.map((a, i) => [i + 1, a.full_name, new Date(a.checked_in_at).toLocaleString(locale()), a.method === "qr" ? "QR" : "Code"]),
  ];
  const csv = "﻿" + lines.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `attendance-${(sub?.slug || "session")}-${ls.starts_at.slice(0, 10)}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------- student check-in
function dormHistoryHtml(list) {
  if (!list.length) return `<p class="empty">${t("noMyDorm")}</p>`;
  return `<ul class="recent">${list.map((a) => {
    const sub = subjectById(a.subject_id);
    const dorm = I18N.lang === "ar" && a.dorm_ar ? a.dorm_ar : a.dorm;
    return `<li><span class="recent-item">${sticker(sub, "sm")}<span><b>${esc(a.topic || I18N.subjectName(sub))}</b>
      <small>${metaJoin([I18N.subjectName(sub), dorm, a.teacher_name, fmtDT(a.starts_at || a.checked_in_at)])}</small></span></span></li>`;
  }).join("")}</ul>`;
}
function checkinFormHtml() {
  return `<h1>${t("checkinTitle")}</h1>
    <p class="srow-meta">${t("checkinHelp")}</p>
    <form id="ciForm" class="form" novalidate>
      <label>${t("codeLabel")}<input id="ciCode" class="code-input" name="code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr" placeholder="ABC 123" required></label>
      <p class="err" role="alert"></p>
      <button class="btn primary wide">${t("checkinBtn")}</button>
    </form>`;
}
function viewCheckin() {
  return shell(`
    <div class="checkin-wrap">
      <section class="card checkin-card" id="ciBox">${checkinFormHtml()}</section>
      <section class="card pad">
        <h2>${t("myDormSessions")} <span class="srow-meta" id="myDormN">${S.attendance.length ? "(" + num(S.attendance.length) + ")" : ""}</span></h2>
        <div id="myDorm">${dormHistoryHtml(S.attendance)}</div>
      </section>
    </div>`, "navCheckin");
}
function bindCheckin(codeFromUrl) {
  const box = document.getElementById("ciBox"); if (!box) return;
  const wire = () => {
    const f = document.getElementById("ciForm"), inp = document.getElementById("ciCode"), err = f.querySelector(".err");
    inp.oninput = () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); inp.value = v.length > 3 ? v.slice(0, 3) + " " + v.slice(3) : v; };
    f.onsubmit = (e) => { e.preventDefault(); submit(inp.value, "code", err, f); };
    inp.focus({ preventScroll: true });
    return { f, inp, err };
  };
  const submit = async (code, method, err, f) => {
    const clean = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length < 6) { err.textContent = t("badCode"); return; }
    const btn = f?.querySelector("button"); if (btn) btn.disabled = true;
    try {
      const r = await API.checkIn(clean, method);
      if (!r || !r.ok) { err.textContent = t("badCode"); if (btn) btn.disabled = false; return; }
      S.attendance = await API.myAttendance().catch(() => S.attendance);
      const sub = subjectById(r.subject_id);
      const dorm = I18N.lang === "ar" && r.dorm_ar ? r.dorm_ar : r.dorm;
      if (!r.already) FX.celebrate({ title: t("checkedInOk"), sub: esc(r.topic || I18N.subjectName(sub)), tone: "#8FE85A" });
      setTimeout(() => PLUS.checkBadges(true), 2600);
      box.innerHTML = `<div class="ci-ok" role="status">
          <span class="ci-tick" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M18 33.5l9 9 19-21"/></svg></span>
          <h1>${t("checkedInOk")}</h1>
          ${r.already ? `<p class="srow-meta">${t("alreadyIn")}</p>` : ""}
          <p class="ci-what">${sticker(sub, "sm")} <b>${esc(r.topic || I18N.subjectName(sub))}</b></p>
          <p class="srow-meta">${metaJoin([I18N.subjectName(sub), dorm, r.teacher_name && t("withTeacher", { t: r.teacher_name })])}</p>
          <button class="btn sm" id="ciAgain">${t("checkinAnother")}</button>
        </div>`;
      document.getElementById("myDorm").innerHTML = dormHistoryHtml(S.attendance);
      document.getElementById("myDormN").textContent = "(" + num(S.attendance.length) + ")";
      document.getElementById("ciAgain").onclick = () => { box.innerHTML = checkinFormHtml(); wire(); };
    } catch (e) {
      err.textContent = isMissingTable(e) ? t("needUpdate") : t("errorGeneric", { m: e.message });
      if (btn) btn.disabled = false;
    }
  };
  const { f, inp, err } = wire();
  if (codeFromUrl) {
    history.replaceState(null, "", location.pathname + location.search + "#/checkin");
    inp.value = fmtCode(codeFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
    submit(codeFromUrl, "qr", err, f);
  }
}
