// Data layer: talks to Supabase, or to a local demo store when no keys are set.
const CFG = window.ONSITE_CONFIG;
const DEMO = !CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("YOUR-PROJECT") || !window.supabase;

// ---------------------------------------------------------------- Supabase
function supabaseApi() {
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  let uid = null;

  return {
    demo: false,
    async currentUser() {
      const { data } = await sb.auth.getSession();
      uid = data.session?.user?.id || null;
      return data.session?.user || null;
    },
    onAuth(cb) { sb.auth.onAuthStateChange((event, session) => { uid = session?.user?.id || null; cb(event, session?.user || null); }); },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(full_name, email, password, teachSubject, phone, school, ref) {
      // Choosing "Teacher" only files a request (the database still creates a student until an admin approves)
      const meta = teachSubject ? { full_name, requested_role: "teacher", requested_subject: teachSubject } : { full_name };
      if (phone) meta.phone = phone;
      if (school) meta.school = school;
      if (ref) meta.ref = ref;                     // invite link code (referrals.sql)
      const data = ok(await sb.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: location.origin + location.pathname } }));
      return { needsConfirm: !data.session };
    },
    async signOut() { await sb.auth.signOut(); },
    async resetPassword(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
    async updatePassword(password) { ok(await sb.auth.updateUser({ password })); },

    async getProfile() { return ok(await sb.from("profiles").select("*").eq("id", uid).single()); },
    async updateProfile(fields) { ok(await sb.from("profiles").update(fields).eq("id", uid)); },

    async listSubjects() { return ok(await sb.from("subjects").select("*").order("sort")); },
    async listSessions() { return ok(await sb.from("sessions").select("*").order("subject_id").order("position").order("created_at")); },
    async saveSession(s) {
      const row = { ...s };
      if (!row.id) { delete row.id; row.created_by = uid; return ok(await sb.from("sessions").insert(row).select().single()); }
      const id = row.id; delete row.id;
      return ok(await sb.from("sessions").update(row).eq("id", id).select().single());
    },
    async deleteSession(id) { ok(await sb.from("sessions").delete().eq("id", id)); },
    async setPositions(list) {
      await Promise.all(list.map(({ id, position }) => sb.from("sessions").update({ position }).eq("id", id)));
    },

    async listMyProgress() { return ok(await sb.from("progress").select("*").eq("user_id", uid)); },
    async saveProgress(p) {
      ok(await sb.from("progress").upsert({ ...p, user_id: uid, updated_at: new Date().toISOString() }));
    },

    async listProfiles() { return ok(await sb.from("profiles").select("*").order("created_at")); },
    async listAllProgress() { return ok(await sb.from("progress").select("user_id,session_id,completed,max_seconds,duration_seconds,updated_at")); },
    async setRole(id, role, subject_id) { ok(await sb.from("profiles").update({ role, subject_id }).eq("id", id)); },
    async updatePerson(id, fields) { ok(await sb.from("profiles").update(fields).eq("id", id)); },
    async listCollabs() { return ok(await sb.from("collabs").select("*").order("id")); },
    // phone numbers live in their own table: only the owner and admins can read them
    async getMyPhone() { return ok(await sb.from("profile_phones").select("phone").eq("user_id", uid).maybeSingle())?.phone || null; },
    async saveMyPhone(phone) { ok(await sb.from("profile_phones").upsert({ user_id: uid, phone, updated_at: new Date().toISOString() })); },
    async listPhones() { return Object.fromEntries(ok(await sb.from("profile_phones").select("user_id, phone")).map((r) => [r.user_id, r.phone])); },
    // session ratings (ratings.sql): your own, and (for staff) everyone's they're allowed to see
    async listMyRatings() { return ok(await sb.from("session_ratings").select("session_id, stars, comment, updated_at").eq("user_id", uid)); },
    async saveRating(session_id, stars, comment) {
      ok(await sb.from("session_ratings").upsert({ user_id: uid, session_id, stars, comment: comment || "", updated_at: new Date().toISOString() }));
    },
    async listRatings() { return ok(await sb.from("session_ratings").select("user_id, session_id, stars, comment, updated_at")); },
    async addCollab(name, logo) { return ok(await sb.from("collabs").insert({ name, logo: logo || null, created_by: uid }).select().single()); },

    // ----- dorm sessions -----
    async listDorms() { return ok(await sb.from("dorms").select("*").order("sort").order("id")); },
    async addDorm(name_en, name_ar) { return ok(await sb.from("dorms").insert({ name_en, name_ar: name_ar || name_en, sort: 99 }).select().single()); },
    async listLive() {
      const rows = ok(await sb.from("live_sessions").select("*, attendance(count)").order("starts_at", { ascending: false }));
      return rows.map(({ attendance, ...r }) => ({ ...r, checked_in: attendance?.[0]?.count ?? 0 }));
    },
    async getLive(id) { return ok(await sb.from("live_sessions").select("*").eq("id", id).maybeSingle()); },
    async saveLive(row) {
      const r = pickLive(row);
      if (!row.id) { r.created_by = uid; return ok(await sb.from("live_sessions").insert(r).select().single()); }
      return ok(await sb.from("live_sessions").update(r).eq("id", row.id).select().single());
    },
    async deleteLive(id) { ok(await sb.from("live_sessions").delete().eq("id", id)); },
    async listAttendance(id) {
      const rows = ok(await sb.from("attendance").select("user_id, checked_in_at, method, profiles(full_name)").eq("live_session_id", id).order("checked_in_at"));
      return rows.map((r) => ({ user_id: r.user_id, checked_in_at: r.checked_in_at, method: r.method, full_name: r.profiles?.full_name || "" }));
    },
    async removeAttendance(id, user_id) { ok(await sb.from("attendance").delete().eq("live_session_id", id).eq("user_id", user_id)); },
    async checkIn(code, method) { return ok(await sb.rpc("check_in", { p_code: code, p_method: method })); },
    async myAttendance() { return ok(await sb.rpc("my_attendance")); },

    // ----- extras (plus.sql): announcements, leaderboard, live updates -----
    async listAnnouncements() { return ok(await sb.from("announcements").select("*").order("created_at", { ascending: false }).limit(60)); },
    async saveAnnouncement(a) { return ok(await sb.from("announcements").insert({ ...a, created_by: uid }).select().single()); },
    async deleteAnnouncement(id) { ok(await sb.from("announcements").delete().eq("id", id)); },
    async leaderboard(days) { return ok(await sb.rpc("leaderboard", { p_days: days })); },

    // ----- invites (referrals.sql) -----
    async phoneAvailable(p) { return ok(await sb.rpc("phone_available", { p })); },
    async getRefCode() { return ok(await sb.rpc("my_ref_code")); },
    async refInfo(code) { const r = ok(await sb.rpc("ref_info", { p_code: code })); return r?.[0]?.name || null; },
    async inviteBoard() { return ok(await sb.rpc("invite_board")); },
    async myReferrals() { return ok(await sb.rpc("my_referrals")); },
    async listReferrals() { return ok(await sb.from("referrals").select("*").order("created_at", { ascending: false })); },
    async setReferralStatus(referred_id, status) { ok(await sb.from("referrals").update({ status }).eq("referred_id", referred_id)); },
    async getContest() { return ok(await sb.from("referral_contest").select("*").eq("id", 1).maybeSingle()); },
    async saveContest(f) { return ok(await sb.from("referral_contest").update({ ...f, updated_at: new Date().toISOString() }).eq("id", 1).select().single()); },
    // live database changes; returns a function that stops listening
    subscribe(table, filter, cb) {
      try {
        const ch = sb.channel(`rt-${table}-${Math.random().toString(36).slice(2, 8)}`)
          .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, (p) => { try { cb(p); } catch (e) { console.warn(e); } })
          .subscribe();
        return () => { try { sb.removeChannel(ch); } catch {} };
      } catch { return () => {}; }
    },
  };
}

// Only these columns are written to live_sessions.
const LIVE_COLS = ["subject_id", "dorm_id", "teacher_id", "teacher_name", "topic", "location", "starts_at", "duration_min",
  "status", "started_at", "ended_at", "code", "checkin_open", "attended_count", "notes", "recording_id"];
function pickLive(row) { const r = {}; for (const k of LIVE_COLS) if (k in row) r[k] = row[k]; return r; }

// ---------------------------------------------------------------- Demo
function demoApi() {
  const KEY = "onsite.demo.v6";
  const SUBJECTS = [
    ["math", "Math", "الرياضيات", "➗", "#C6FF3D"], ["physics", "Physics", "الفيزياء", "⚛️", "#38BDF8"],
    ["chemistry", "Chemistry", "الكيمياء", "⚗️", "#F472B6"], ["biology", "Biology", "الأحياء", "🧬", "#34D399"],
    ["geology", "Geology", "الجيولوجيا", "🪨", "#FBBF24"], ["mechanics", "Mechanics", "الميكانيكا", "⚙️", "#FB923C"],
    ["arabic", "Arabic", "اللغة العربية", "ض", "#A78BFA"], ["english", "English", "اللغة الإنجليزية", "Aa", "#60A5FA"],
  ].map(([slug, name_en, name_ar, icon, color], i) => ({ id: i + 1, slug, name_en, name_ar, icon, color, sort: i + 1 }));
  // Placeholder video (Blender's open movie "Big Buck Bunny") for every demo session.
  const VID = "aqz-KE-bpKQ";
  const seedSessions = () => {
    const titles = {
      1: ["Linear equations warm-up", "Quadratics: factoring fast", "Functions and their graphs", "Revision: past paper Q1–Q5"],
      2: ["Motion in one dimension", "Newton's laws in real life", "Work, energy and power"],
      3: ["Atomic structure", "Moles without tears", "Balancing equations"],
      4: ["The cell up close", "DNA and protein synthesis"],
      5: ["Rock cycle explained"],
      6: ["Forces and moments", "Friction problems"],
      7: ["النحو: المبتدأ والخبر", "البلاغة: التشبيه"],
      8: ["Reading for gist", "Essay structure that scores"],
    };
    const out = [];
    for (const [sid, list] of Object.entries(titles)) list.forEach((title, i) => out.push({
      id: `demo-${sid}-${i}`, subject_id: +sid, title,
      description: "Recorded in the dorm common room. Pause and try each example before the answer appears.",
      youtube_id: VID, duration_seconds: 634, position: i, attachment_url: i === 0 ? "https://example.com/notes.pdf" : null, collab_id: [1, 4].includes(+sid) ? 1 : null,
      published: true, created_by: "demo-user", created_at: new Date(Date.now() - (40 - out.length) * 864e5).toISOString(),
    }));
    return out;
  };
  const seed = () => {
    const now = Date.now(), day = 864e5;
    const sessions = seedSessions();
    const progress = [
      [sessions[0].id, 634, true, 0], [sessions[1].id, 380, false, 0], [sessions[4].id, 634, true, 1],
      [sessions[5].id, 634, true, 2], [sessions[7].id, 200, false, 4], [sessions[11].id, 634, true, 9],
    ].map(([session_id, max, completed, ago]) => ({
      user_id: "demo-user", session_id, position_seconds: completed ? 0 : max, duration_seconds: 634,
      max_seconds: max, completed, notes: "", updated_at: new Date(now - ago * day).toISOString(),
    }));
    return {
      user: null,
      users: [{ id: "demo-user", email: "you@onsite.club", password: "demo1234" }],
      profiles: [
        { id: "demo-user", full_name: "Adham", role: "admin", subject_id: null, created_at: new Date(now - 60 * day).toISOString() },
        { id: "demo-2", full_name: "Youssef K.", role: "student", subject_id: null, created_at: new Date(now - 30 * day).toISOString() },
        { id: "demo-3", full_name: "Omar S.", role: "teacher", subject_id: 2, created_at: new Date(now - 20 * day).toISOString() },
        ...["Mariam A.", "Ziad H.", "Nour E.", "Karim M.", "Salma R."].map((full_name, i) => ({ id: `demo-s${i}`, full_name, role: "student", subject_id: null, created_at: new Date(now - (25 - i) * day).toISOString() })),
        { id: "demo-t1", full_name: "Hana F.", role: "student", subject_id: null, created_at: new Date(now - 2 * day).toISOString(), requested_role: "teacher", requested_subject: 3, requested_at: new Date(now - 2 * day).toISOString() },
        { id: "demo-t2", full_name: "Mostafa G.", role: "student", subject_id: null, created_at: new Date(now - day).toISOString(), requested_role: "teacher", requested_subject: 6, requested_at: new Date(now - day).toISOString() },
      ].map((p, i) => ({ requested_role: null, requested_subject: null, requested_at: null, school: p.role === "admin" ? null : ["Al-Nour Language School", "Future STEM School", "Al-Nour Language School", "Horizon School"][i % 4], ...p })),
      collabs: [{ id: 1, name: "Life vs. Logic", logo: "img/life-vs-logic.png" }],
      phones: { "demo-2": "01012345678", "demo-s0": "01198765432", "demo-s2": "+201234567890" },
      sessions, progress: [
        ...progress,
        { user_id: "demo-2", session_id: sessions[0].id, completed: true, max_seconds: 634, duration_seconds: 634, updated_at: new Date(now - day).toISOString() },
        ...[[0, 0, 634, 2], [1, 0, 410, 1], [2, 0, 634, 3], [3, 0, 120, 0], [0, 1, 500, 1], [4, 1, 634, 2], [1, 4, 634, 1], [2, 4, 300, 0], [3, 12, 634, 4]]
          .map(([u, si, max, ago]) => ({ user_id: `demo-s${u}`, session_id: sessions[si].id, completed: max >= 634, max_seconds: max, duration_seconds: 634, position_seconds: max, notes: "", updated_at: new Date(now - ago * day - u * 36e5).toISOString() })),
      ],
    };
  };
  const liveSeed = () => {
    const at = (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const plus = (iso, min) => new Date(new Date(iso).getTime() + min * 60000).toISOString();
    const s1 = at(3, 20), s2 = at(1, 19, 30);
    return {
      dorms: [{ id: 1, name_en: "Boys' dorm", name_ar: "سكن البنين", sort: 1 }, { id: 2, name_en: "Girls' dorm", name_ar: "سكن البنات", sort: 2 }],
      live: [
        { id: "live-1", subject_id: 2, dorm_id: 1, teacher_id: "demo-3", teacher_name: "Omar S.", topic: "Newton's laws, worked problems",
          location: "Common room, 2nd floor", starts_at: s1, duration_min: 60, status: "ended", started_at: s1, ended_at: plus(s1, 60),
          code: "PH7K2M", checkin_open: false, attended_count: 9, notes: "Covered F = ma with five examples. Homework: sheet 3, Q1 to Q6.",
          recording_id: "demo-2-1", created_by: "demo-user", created_at: s1 },
        { id: "live-2", subject_id: 1, dorm_id: 2, teacher_id: null, teacher_name: "Salma R.", topic: "Quadratics revision",
          location: "Study hall", starts_at: s2, duration_min: 75, status: "ended", started_at: s2, ended_at: plus(s2, 75),
          code: null, checkin_open: false, attended_count: 12, notes: "", recording_id: null, created_by: "demo-user", created_at: s2 },
        { id: "live-3", subject_id: 2, dorm_id: 1, teacher_id: "demo-3", teacher_name: "Omar S.", topic: "Work and energy",
          location: "Common room, 2nd floor", starts_at: at(-1, 20), duration_min: 60, status: "scheduled", started_at: null, ended_at: null,
          code: null, checkin_open: false, attended_count: null, notes: "", recording_id: null, created_by: "demo-user", created_at: new Date().toISOString() },
      ],
      attendance: [
        { live_session_id: "live-1", user_id: "demo-2", checked_in_at: plus(s1, 2), method: "qr" },
        { live_session_id: "live-1", user_id: "demo-4", checked_in_at: plus(s1, 3), method: "qr" },
        { live_session_id: "live-1", user_id: "demo-5", checked_in_at: plus(s1, 6), method: "code" },
      ],
    };
  };
  // Older demo data (from before dorm sessions) gets the new accounts and sample sessions added.
  const upgrade = (d) => {
    if (!d.live) Object.assign(d, liveSeed());
    if (!d.ratings) {
      // sample ratings from the demo students who watched
      const by = (u, si, stars, comment) => d.sessions[si] && { user_id: u, session_id: d.sessions[si].id, stars, comment, updated_at: new Date(Date.now() - si * 36e5).toISOString() };
      d.ratings = [by("demo-2", 0, 5, "Very clear, the examples helped a lot."), by("demo-s0", 0, 4, ""), by("demo-s2", 0, 5, "Please do more problems like the last one."),
        by("demo-s1", 0, 3, "A bit fast in the middle."), by("demo-s4", 1, 4, ""), by("demo-s1", 4, 5, "")].filter(Boolean);
    }
    const addUser = (u) => { if (!d.users.some((x) => x.id === u.id)) d.users.push(u); };
    addUser({ id: "demo-3", email: "teacher@onsite.club", password: "demo1234" });
    addUser({ id: "demo-2", email: "student@onsite.club", password: "demo1234" });
    const addProfile = (id, full_name) => { if (!d.profiles.some((x) => x.id === id)) d.profiles.push({ id, full_name, role: "student", subject_id: null, created_at: new Date().toISOString() }); };
    addProfile("demo-4", "Karim A."); addProfile("demo-5", "Mostafa H.");
    // extras: leaderboard opt-in (most demo students are on it) and sample announcements
    d.profiles.forEach((p, i) => { if (!("show_on_board" in p)) p.show_on_board = p.role === "student" && i % 4 !== 3; });
    if (!d.ann) {
      const ago = (h) => new Date(Date.now() - h * 36e5).toISOString(), ahead = (dd) => new Date(Date.now() + dd * 864e5).toISOString();
      d.ann = [
        { id: 2, body: "Physics revision night on Thursday, 8 PM in the boys' common room. Bring your sheet 3 questions!", subject_id: 2, kind: "important", ends_at: ahead(3), created_by: "demo-3", created_at: ago(5) },
        { id: 1, body: "Welcome to the new ON-site app 🎉 You can now install it on your phone, search every session, and earn badges.", subject_id: null, kind: "celebrate", ends_at: ahead(7), created_by: "demo-user", created_at: ago(20) },
      ];
    }
    // invites: phones for the demo students, a few codes and referrals, and a contest with prizes
    d.phones = d.phones || {};
    [["demo-s1", "01022223333"], ["demo-s3", "01144445555"], ["demo-s4", "01266667777"], ["demo-4", "01588889999"], ["demo-5", "01012121212"], ["demo-t1", "01113131313"]]
      .forEach(([id, ph]) => { if (!d.phones[id]) d.phones[id] = ph; });
    if (!d.refCodes) {
      const h = (n) => new Date(Date.now() - n * 36e5).toISOString();
      d.refCodes = { "demo-s0": "MARKAM", "demo-2": "YOUSEF", "demo-s2": "NOUR22" };
      d.referrals = [
        { referred_id: "demo-s1", referrer_id: "demo-s0", code: "MARKAM", status: "ok", created_at: h(70) },
        { referred_id: "demo-s3", referrer_id: "demo-s0", code: "MARKAM", status: "ok", created_at: h(50) },
        { referred_id: "demo-4", referrer_id: "demo-s0", code: "MARKAM", status: "ok", created_at: h(26) },
        { referred_id: "demo-t2", referrer_id: "demo-s0", code: "MARKAM", status: "rejected", created_at: h(20) },
        { referred_id: "demo-s4", referrer_id: "demo-2", code: "YOUSEF", status: "ok", created_at: h(40) },
        { referred_id: "demo-5", referrer_id: "demo-2", code: "YOUSEF", status: "ok", created_at: h(8) },
        { referred_id: "demo-t1", referrer_id: "demo-s2", code: "NOUR22", status: "ok", created_at: h(30) },
      ];
      d.contest = { id: 1, points_per_invite: 100, prize1: "AirPods 🎧", prize2: "Scientific calculator", prize3: "ON-site hoodie", starts_at: null, ends_at: new Date(Date.now() + 12 * 864e5 + 5 * 36e5).toISOString() };
    }
    // a couple of fresh sessions so "New this week" has something in it
    d.sessions.forEach((s, i) => { if (i % 5 === 2 && Date.now() - new Date(s.created_at) > 10 * 864e5 && !s._fresh) { s.created_at = new Date(Date.now() - (i % 4 + 1) * 864e5).toISOString(); s._fresh = 1; } });
    return d;
  };
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { db = seed(); }
  db = upgrade(db);
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let listener = () => {};
  const me = () => db.profiles.find((p) => p.id === db.user);

  return {
    demo: true,
    reset() { localStorage.removeItem(KEY); location.reload(); },
    async currentUser() { return db.user ? { id: db.user, email: db.users.find((u) => u.id === db.user)?.email } : null; },
    onAuth(cb) { listener = cb; },
    async signIn(email, password) {
      const u = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!u || u.password !== password) throw new Error("Invalid login credentials");
      db.user = u.id; persist(); listener("SIGNED_IN", { id: u.id, email });
    },
    async signUp(full_name, email, password, teachSubject, phone, school, ref) {
      if (phone) { db.phones = db.phones || {}; if (Object.values(db.phones).some((x) => demoNorm(x) === demoNorm(phone))) throw new Error("phone_taken"); }
      if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error("User already registered");
      const id = "u-" + Math.random().toString(36).slice(2), now = new Date().toISOString();
      db.users.push({ id, email, password });
      const sid = teachSubject ? SUBJECTS.find((x) => x.slug === teachSubject)?.id ?? null : null;
      db.profiles.push({ id, full_name, school: school || null, role: "student", subject_id: null, created_at: now,
        requested_role: teachSubject ? "teacher" : null, requested_subject: sid, requested_at: teachSubject ? now : null });
      if (phone) db.phones[id] = phone;
      const by = ref && Object.entries(db.refCodes || {}).find(([, c]) => c === String(ref).toUpperCase());
      if (by && by[0] !== id) db.referrals.push({ referred_id: id, referrer_id: by[0], code: by[1], status: "ok", created_at: now });
      db.user = id; persist(); listener("SIGNED_IN", { id, email });
      return { needsConfirm: false };
    },
    async signOut() { db.user = null; persist(); listener("SIGNED_OUT", null); },
    async resetPassword() {},
    async updatePassword(password) { db.users.find((u) => u.id === db.user).password = password; persist(); },

    async getProfile() { return clone(me()); },
    async updateProfile(fields) { Object.assign(me(), fields); persist(); },
    async listSubjects() { return clone(SUBJECTS); },
    async listSessions() {
      const p = me();
      return clone(db.sessions.filter((s) => s.published || p.role === "admin" || (p.role === "teacher" && p.subject_id === s.subject_id))
        .sort((a, b) => a.subject_id - b.subject_id || a.position - b.position));
    },
    async saveSession(s) {
      if (!s.id) { const row = { ...s, id: "s-" + Math.random().toString(36).slice(2), created_by: db.user, created_at: new Date().toISOString() }; db.sessions.push(row); persist(); return clone(row); }
      const row = db.sessions.find((x) => x.id === s.id); Object.assign(row, s); persist(); return clone(row);
    },
    async deleteSession(id) { db.sessions = db.sessions.filter((s) => s.id !== id); db.progress = db.progress.filter((p) => p.session_id !== id); persist(); },
    async setPositions(list) { list.forEach(({ id, position }) => { const s = db.sessions.find((x) => x.id === id); if (s) s.position = position; }); persist(); },
    async listMyProgress() { return clone(db.progress.filter((p) => p.user_id === db.user)); },
    async saveProgress(p) {
      const row = { ...p, user_id: db.user, updated_at: new Date().toISOString() };
      const i = db.progress.findIndex((x) => x.user_id === db.user && x.session_id === p.session_id);
      if (i >= 0) db.progress[i] = { ...db.progress[i], ...row }; else db.progress.push({ notes: "", ...row });
      persist();
    },
    async listProfiles() { return clone(db.profiles); },
    async listAllProgress() { return clone(db.progress); },
    async setRole(id, role, subject_id) { Object.assign(db.profiles.find((p) => p.id === id), { role, subject_id }); persist(); },
    async updatePerson(id, fields) { Object.assign(db.profiles.find((p) => p.id === id), fields); persist(); },
    async listCollabs() { return clone(db.collabs || []); },
    async getMyPhone() { return (db.phones || {})[db.user] || null; },
    async saveMyPhone(phone) {
      db.phones = db.phones || {};
      if (Object.entries(db.phones).some(([id, x]) => id !== db.user && demoNorm(x) === demoNorm(phone))) throw new Error("phone_taken");
      db.phones[db.user] = phone; persist();
    },
    async listPhones() { return clone(db.phones || {}); },
    async listMyRatings() { return clone((db.ratings || []).filter((r) => r.user_id === db.user)); },
    async saveRating(session_id, stars, comment) {
      db.ratings = db.ratings || [];
      const row = { user_id: db.user, session_id, stars, comment: comment || "", updated_at: new Date().toISOString() };
      const i = db.ratings.findIndex((r) => r.user_id === db.user && r.session_id === session_id);
      if (i >= 0) db.ratings[i] = row; else db.ratings.push(row);
      persist();
    },
    async listRatings() { return clone(db.ratings || []); },
    async addCollab(name, logo) { db.collabs = db.collabs || []; const row = { id: Math.max(0, ...db.collabs.map((c) => c.id)) + 1, name, logo: logo || null }; db.collabs.push(row); persist(); return clone(row); },

    // ----- dorm sessions -----
    async listDorms() { return clone(db.dorms); },
    async addDorm(name_en, name_ar) { const row = { id: Math.max(0, ...db.dorms.map((x) => x.id)) + 1, name_en, name_ar: name_ar || name_en, sort: 99 }; db.dorms.push(row); persist(); return clone(row); },
    async listLive() {
      const p = me(), mine = (l) => p.role === "admin" || (p.role === "teacher" && l.teacher_id === p.id);
      return clone(db.live.filter(mine).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        .map((l) => ({ ...l, checked_in: db.attendance.filter((a) => a.live_session_id === l.id).length })));
    },
    async getLive(id) { return clone(db.live.find((l) => l.id === id) || null); },
    async saveLive(row) {
      const r = pickLive(row);
      if (!row.id) { const n = { id: "live-" + Math.random().toString(36).slice(2), created_by: db.user, created_at: new Date().toISOString(), ...r }; db.live.push(n); persist(); return clone(n); }
      const l = db.live.find((x) => x.id === row.id); Object.assign(l, r); persist(); return clone(l);
    },
    async deleteLive(id) { db.live = db.live.filter((l) => l.id !== id); db.attendance = db.attendance.filter((a) => a.live_session_id !== id); persist(); },
    async listAttendance(id) {
      return clone(db.attendance.filter((a) => a.live_session_id === id).sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at))
        .map((a) => ({ ...a, full_name: db.profiles.find((p) => p.id === a.user_id)?.full_name || "" })));
    },
    async removeAttendance(id, user_id) { db.attendance = db.attendance.filter((a) => !(a.live_session_id === id && a.user_id === user_id)); persist(); },
    async checkIn(code, method) {
      const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const l = db.live.find((x) => x.checkin_open && x.code === c);
      if (!l) return { ok: false, reason: "invalid" };
      const already = db.attendance.some((a) => a.live_session_id === l.id && a.user_id === db.user);
      if (!already) { db.attendance.push({ live_session_id: l.id, user_id: db.user, checked_in_at: new Date().toISOString(), method: method === "qr" ? "qr" : "code" }); persist(); }
      const d = db.dorms.find((x) => x.id === l.dorm_id);
      return { ok: true, already, id: l.id, subject_id: l.subject_id, topic: l.topic, teacher_name: l.teacher_name, dorm: d?.name_en, dorm_ar: d?.name_ar };
    },
    async myAttendance() {
      return clone(db.attendance.filter((a) => a.user_id === db.user).sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at)).map((a) => {
        const l = db.live.find((x) => x.id === a.live_session_id) || {}, d = db.dorms.find((x) => x.id === l.dorm_id) || {};
        return { live_session_id: a.live_session_id, subject_id: l.subject_id, topic: l.topic, teacher_name: l.teacher_name, dorm: d.name_en, dorm_ar: d.name_ar, starts_at: l.starts_at, checked_in_at: a.checked_in_at };
      }));
    },

    // ----- extras -----
    async listAnnouncements() { return clone((db.ann || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))); },
    async saveAnnouncement(a) {
      const row = { ...a, id: Math.max(0, ...db.ann.map((x) => +x.id || 0)) + 1, created_by: db.user, created_at: new Date().toISOString() };
      db.ann.push(row); persist(); return clone(row);
    },
    async deleteAnnouncement(id) { db.ann = db.ann.filter((x) => x.id !== id); persist(); },
    async leaderboard(days) {
      const since = days ? Date.now() - days * 864e5 : 0, pub = new Set(db.sessions.filter((s) => s.published).map((s) => s.id));
      const short = (n) => { const [a, b] = String(n || "").trim().split(/\s+/); return a + (b ? " " + b[0] + "." : ""); };
      return db.profiles.filter((p) => p.role === "student" && (p.show_on_board || p.id === db.user)).map((p) => {
        const rows = db.progress.filter((r) => r.user_id === p.id && pub.has(r.session_id) && new Date(r.updated_at).getTime() >= since);
        return { user_id: p.id, name: short(p.full_name), finished: rows.filter((r) => r.completed).length,
          minutes: Math.round(rows.reduce((a, r) => a + Math.min(+r.max_seconds || 0, +r.duration_seconds || Infinity), 0) / 60), is_me: p.id === db.user };
      }).filter((r) => r.finished || r.minutes || r.is_me).sort((a, b) => b.finished - a.finished || b.minutes - a.minutes || a.name.localeCompare(b.name));
    },
    subscribe() { return () => {}; },

    // ----- invites -----
    async phoneAvailable(p) { return !Object.entries(db.phones || {}).some(([id, x]) => id !== db.user && demoNorm(x) === demoNorm(p)); },
    async getRefCode() {
      if (!db.refCodes[db.user]) { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; db.refCodes[db.user] = Array.from({ length: 6 }, () => A[(Math.random() * 32) | 0]).join(""); persist(); }
      return db.refCodes[db.user];
    },
    async refInfo(code) { const e = Object.entries(db.refCodes || {}).find(([, c]) => c === String(code || "").toUpperCase()); return e ? (db.profiles.find((p) => p.id === e[0])?.full_name || "").split(" ")[0] : null; },
    async inviteBoard() {
      const c = db.contest, short = (n) => { const [a, b] = String(n || "").trim().split(/\s+/); return a + (b ? " " + b[0] + "." : ""); };
      const ok = (r) => r.status === "ok" && db.phones[r.referred_id] && (!c.starts_at || r.created_at >= c.starts_at) && (!c.ends_at || r.created_at <= c.ends_at);
      const by = {};
      db.referrals.filter(ok).forEach((r) => { const o = (by[r.referrer_id] = by[r.referrer_id] || { n: 0, last: "" }); o.n++; if (r.created_at > o.last) o.last = r.created_at; });
      return Object.entries(by).map(([id, o]) => ({ id, o, p: db.profiles.find((x) => x.id === id) })).filter((x) => x.p && x.p.role === "student")
        .sort((a, b) => b.o.n - a.o.n || a.o.last.localeCompare(b.o.last))
        .map((x, i) => ({ rank: i + 1, user_id: x.id, name: short(x.p.full_name), school: x.p.school || null, invites: x.o.n, points: x.o.n * c.points_per_invite, is_me: x.id === db.user }));
    },
    async myReferrals() {
      const c = db.contest;
      return clone(db.referrals.filter((r) => r.referrer_id === db.user).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => {
        const p = db.profiles.find((x) => x.id === r.referred_id), [a, b] = String(p?.full_name || "").split(/\s+/);
        const state = r.status === "rejected" ? "rejected" : !db.phones[r.referred_id] ? "no_phone" : (c.starts_at && r.created_at < c.starts_at) || (c.ends_at && r.created_at > c.ends_at) ? "outside" : "ok";
        return { name: a + (b ? " " + b[0] + "." : ""), joined_at: r.created_at, state };
      }));
    },
    async listReferrals() { return clone(db.referrals.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))); },
    async setReferralStatus(id, status) { const r = db.referrals.find((x) => x.referred_id === id); if (r) r.status = status; persist(); },
    async getContest() { return clone(db.contest); },
    async saveContest(f) { Object.assign(db.contest, f); persist(); return clone(db.contest); },
  };
}
// same rule as the database: 01012345678 = +201012345678 = 00201012345678
function demoNorm(p) { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("0020")) d = "0" + d.slice(4); else if (d.startsWith("20") && d.length === 12) d = "0" + d.slice(2); return d; }

const API = DEMO ? demoApi() : supabaseApi();
