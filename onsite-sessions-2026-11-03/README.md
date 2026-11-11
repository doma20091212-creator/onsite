# ON-site Sessions — setup guide

## Invite links & prizes (November 2026)

- **Invite page** (new tab in the menu): each member presses **Get your link**, copies it or shares it on WhatsApp. When a friend creates an account with that link, the inviter gets **10 points** (change it in Manage → Invites). The leaderboard is visible to everyone (first name + initial), and the top 3 win the prizes you set.
- **One account per phone number:** a number that already has an account can't sign up again. 01012345678, +201012345678 and 00201012345678 all count as the same number.
- **Manage → Invites** (admin): prizes, points per friend, contest start/end dates, "Start a new round", the leaderboard with full names and WhatsApp buttons, and a log of every invite where you can **Reject** fake ones (and undo).
- **Manage → People:** a **Joined** column (date and time each account was made), invites per person, who invited them, a ⚠ warning on accounts that share a number from before the rule, and a **Sort** menu (newest, oldest, name, school, most invites, most finished, recently active).
- **School** on sign-up, the info step and Account is now a dropdown of all 20 STEM schools, plus "Other school…".

**To switch it on:** Supabase → SQL Editor → run `supabase/referrals.sql` (after `plus.sql`). It only adds things. Then upload the files as usual.

Note: phone numbers aren't confirmed by SMS, so someone could type a made-up number. Before giving prizes, check the top inviters' list in Manage → Invites (the WhatsApp buttons make it quick) and reject anything fake.

---

## What's new (November 2026)

**Feel:** page transitions, cards that rise in one by one, numbers that count up, bars and rings that fill, tilt-on-hover cards, a nav pill that glides between tabs, confetti and full-screen celebrations (finishing a session or a whole subject, streaks, dorm check-ins, new badges), loading skeletons instead of "Loading…", and a slow animated background that is always moving. Members can switch animations to **Calm** in Account, and phones set to "reduce motion" get the calm version automatically.

**Students:** search everything (the magnifier button, or press `/`), badges and levels on My progress, an opt-in leaderboard, "Up next for you" and "New this week" rows on Home, and timestamps in notes (tap one to jump back to that moment).

**Staff:** an **Insights** tab (active students, views, finish rate, ratings, weekly activity, dorm attendance, where students stop watching), an **Announcements** tab (banners on everyone's Home page), and check-ins that appear on the teacher's screen instantly.

**Always on:** the site can be installed as an app, opens even with no internet (showing the last saved copy), saves progress while offline and syncs it when the connection is back.

### Updating your live site (do these once)

1. **Database:** Supabase → **SQL Editor → New query**, paste everything from `supabase/plus.sql`, press **Run**. It only *adds* things; no member, session, progress or attendance data is changed. (Until you run it, the site still works; the leaderboard and announcements just show a setup note to admins.)
2. **Files:** upload the whole folder to your InfinityFree `htdocs` and replace the old files. New files: `sw.js`, `manifest.webmanifest`, `css/fx.css`, `js/fx.js`, `js/plus.js`, `js/i18n-plus.js` and `img/icon-*.png`. Keep `.htaccess`.
3. Open the site once. Everyone who has it open gets the "new version" bar.

Notes:
- Installing as an app and the offline copy need **https** (on.site.je already uses it).
- Next time you change files, change the number in `version.js`, the `FALLBACK` in `index.html`, and `VERSION` at the top of `sw.js`. (The site reads `version.js`, not `version.json`: InfinityFree's bot check blocks the site from reading `.json` files in the background.)
- Free Supabase projects pause after 7 days with nobody using the site. Normal club use keeps it awake; if it ever pauses, press **Restore** in the Supabase dashboard.

---

Your club's video site: sign-in, subjects, a custom video player that remembers where each student stopped, a progress page, and a manage panel for you and the teachers. Free to run (Supabase + Netlify), videos hosted on YouTube as Unlisted.

## 0. Try it first (2 minutes, no setup)

Open the folder, double-click `index.html` (or drop the folder on Netlify, step 3). Without Supabase keys it runs in **demo mode** with sample sessions saved only in your browser. Demo login: `you@onsite.club` / `demo1234`.

## 1. Create the database (Supabase)

1. Go to supabase.com → **New project** (free plan). Pick a region close to Egypt (e.g. Frankfurt).
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, press **Run**.
   This creates the 8 subjects, the tables, and the security rules (students can only see/edit their own progress; teachers can only manage their own subject).
3. **Authentication → Sign In / Providers → Email**: keep it on. "Confirm email" on = students must click a link in their inbox before signing in. Turn it off if you want instant sign-up.

## 2. Connect the site to it

1. Supabase → **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. Open `js/config.js` and paste them in place of `YOUR-PROJECT…` and `YOUR-ANON-KEY`.
   (The anon key is meant to be public; the security rules in step 1 are what protect the data.)

## 3. Put it online (Netlify)

1. Go to app.netlify.com/drop and drag the whole `onsite` folder in.
2. You'll get a link like `https://something.netlify.app`. Rename it under **Site configuration → Change site name** (e.g. `onsite-club`).
3. Back in Supabase → **Authentication → URL Configuration**: set **Site URL** to your Netlify link and add it under **Redirect URLs** too. This makes the email confirmation and password reset links come back to your site.

Updating later: change files, then drag the folder onto the site's **Deploys** tab again.

## 4. Become the admin

**Sign up on the live site yourself first.** The very first account ever created becomes admin automatically; everyone after that is a student.
If someone beat you to it, run this in the SQL Editor (with your email):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

## 5. Add teachers

Teachers sign up like anyone else. Then you open **Manage → People**, set their role to **Teacher** and pick their subject. They'll now see the Manage tab, but only for that subject.

## 6. Upload a session

1. On YouTube: **Create → Upload video**, set visibility to **Unlisted** (not Private — private videos can't be embedded).
2. On the site: **Manage → Add session**, paste the YouTube link. A preview appears and the length is read automatically.
3. Add a title, an optional description and an optional material link (PDF / Drive / slides), then **Save**.
   Untick "Visible to students" to keep it as a draft.
4. Use the ↑ ↓ buttons to set the order inside a subject.

## How progress works

- The player saves position every 10 seconds and whenever a student pauses or leaves.
- A session counts as finished when the student has actually *watched* 90% of it (skipping ahead doesn't count), or presses **Mark as finished**. Change the 90% in `js/config.js` (`COMPLETE_AT`).
- Students can write private notes under each video; they're saved to their account.
- **Manage → People** shows how many sessions each student finished and when they last watched.

## Player keyboard shortcuts

Space/K play-pause · ←/→ 5 s · J/L 10 s · ↑/↓ volume · M mute · F full screen · Shift + < / > speed · double-click full screen.

## Good to know

- Unlisted YouTube videos can still be opened by anyone who gets the exact link. The site hides YouTube's controls and link, but a determined student could find the video ID. For a school club this is usually fine.
- Free Supabase projects pause after a week with no activity. If that happens, open the Supabase dashboard and click **Restore**. Regular use keeps it awake.
- Files: `index.html` (page), `css/style.css` (look), `js/app.js` (pages), `js/player.js` (video player), `js/api.js` (database), `js/i18n.js` (English/Arabic text), `js/config.js` (your keys).

## Dorm sessions and attendance (update)

Run `supabase/dorm-sessions.sql` once in Supabase → SQL Editor (after `schema.sql`). Then:

- **Manage → Dorm sessions**: "Log or schedule a session" (dorm, teacher, subject, topic, place, time, length, headcount, notes, recorded video) or "Start a session now".
- Starting a session shows a 6-letter code and a QR. "Show full screen" is for projecting it. "New code" kills an old code, "End session" closes check-in.
- Students tap **Check in** and type the code, or scan the QR with their phone camera (if they're logged out, they sign in and it finishes automatically).
- Admin sees every session; a teacher sees their own. Both see who checked in, can remove someone, save a headcount, and download the list as CSV.
- Two dorms are added to start (Boys' and Girls'); the admin can add more from the session form ("+ Add a dorm…").

## Teacher sign-up requests

On the sign-up page people choose **Student** or **Teacher**. Choosing Teacher (plus their subject) does **not** make them a teacher: the account starts as a student with a pending request, and an admin approves or declines it in **Manage → People → Teacher requests** (the subject can be changed before approving). Students can also ask later from their **Account** page, and cancel a pending request there.

One-time setup: in Supabase → **SQL Editor**, run `supabase/teacher-requests.sql`. It only adds three empty columns to `profiles` and updates the sign-up function; no existing account, role, session or progress is changed. Running it twice is harmless.

## Collab partners on sessions

When adding or editing a session (**Manage → Videos**), pick a **Collab** (or "No collab"). The partner's logo then shows on that session: on the subject list (a badge on the thumbnail plus "logo · name"), on the watch page ("In collab with …"), in the playlist and in "Pick up where you left off". New Biology and Math sessions start with Life vs. Logic picked. Choose **+ New collab…** to add another partner with its name and logo (teachers and admins can add; only admins can rename or remove).

One-time setup: in Supabase → **SQL Editor**, run `supabase/collabs.sql`. It adds a `collabs` table (with Life vs. Logic already in it) and an empty `collab_id` column on sessions; nothing existing is changed. Existing sessions start with no collab: edit them one by one, or use the optional snippet at the bottom of that file to tag all Biology and Math sessions at once.

## Phone numbers for session feedback

New members type their phone number when they create an account. Members who don't have one saved get a one-time pop-up asking for it ("Later" hides it for 3 days), and anyone can change their number on the **Account** page. Arabic digits are fine (٠١٠… is saved as 010…).

Only admins can see numbers. In **Manage → Videos → "x watched"** each viewer shows their number and a WhatsApp button that opens a ready-made message asking how that session was (in the language the admin is using the site in). Numbers are also in **Manage → People** and in the "Who watched" CSV.

One-time setup: in Supabase → **SQL Editor**, run `supabase/phones.sql`. It adds a private `profile_phones` table (readable only by the owner and admins) and a small sign-up step that can never block a sign-up; nothing existing is changed.

## School + phone are required

The sign-up page asks "What school are you in?" along with the phone number. Members who already have an account but are missing their school or phone see a "One more step" screen instead of the sessions until they fill both in (admins are never stopped). Members can change their school on the **Account** page; admins see each member's school in **Manage → People** and in "Who watched" (and its CSV).

One-time setup: in Supabase → **SQL Editor**, run `supabase/school.sql` (and `supabase/phones.sql` if you haven't yet). The "One more step" screen only switches on once both have been run, so nobody is locked out before the database is ready.

## "Finished" means really watched

A session is marked finished only when the student has actually played 90% of it. Skipping ahead with the seek bar doesn't count, jumping to the last second doesn't count, and there is no longer a "Mark as finished" button: under the video students see "Watched 45% · finishes at 90%". In "Who watched", finished students show the share they really watched ("Done · watched 94%").

## Deploying updates (InfinityFree) — no more hard refresh

The site now loads its CSS/JS through a small loader in `index.html` that first reads
`version.js` (never cached) and then loads every file as `file.js?v=<version>`.

Every time you upload changes:
1. Open `version.js` and change the number, e.g. `2026-10-24.1` → `2026-10-24.2`.
2. Upload the changed files **and** `version.js` to `htdocs`.

Visitors get the new files the next time they open the site. Anyone who already has
it open sees a "A new version of the site is ready · Refresh" bar.

`.htaccess` (in `htdocs`, next to `index.html`) tells the browser to re-check the page
and code files instead of keeping old copies. It's a hidden file: in the InfinityFree
file manager make sure it is uploaded; if you use FileZilla, enable "show hidden files".

Note: people who still have the very old version cached need one last hard refresh after
this first upload. After that, updates show up by themselves.

## Session ratings

Students can rate each session from 1 to 5 stars, with an optional comment.

- Turn it on: run `supabase/ratings.sql` once in Supabase → SQL Editor. It only adds a new
  table (`session_ratings`); nothing that already exists is changed. Until it's run, the
  rating box simply doesn't show.
- Students see the "Rate this session" box under the video once they've watched 30% of it
  (change `RATE_AT` in `js/app.js`). They can change their rating any time.
- Only students rate; admins and teachers don't see the box.
- Manage → Videos: each session shows its average (★ 4.3 (12 ratings)). Open "watched" to see
  each student's stars and comment, filter to "Ratings", and download them in the CSV.
- Students only ever see their own rating. Teachers see ratings for their own subject; admins see all.
