# Plan: Family Chore Tracker (free-hosted website)

Status: APPROVED 2026-11-16
Date: 2026-11-16
Project folder: `/Users/x95281/FamilyChores/` (new, deliberately outside the FeaverBot research repo)

## Context

The family needs one place to track daily, weekly and monthly chores. Anyone can check a chore off, and the site records how much of each day's chores got done. It must run on a free host.

Decisions from the user's answers:
- **Devices: "both, start simple".** It works on one device with zero setup. Phone-to-phone sync is a switch you turn on later without losing data.
- **Weekly/monthly chores: "flexible".** They sit in "This week" / "This month" lists and can be done any day. They count toward the day they are completed.
- **Extras: assign chores to people, plus streaks and badges.**

Why not WordPress: the free WordPress.com plan can't run custom scripts or plugins, and live check-offs need exactly that. A static site on free hosting plus a free database does the job.

## Architecture

Static site: plain HTML, CSS and JavaScript. No build step, no framework, no server of our own. It deploys by uploading a folder to GitHub Pages (or Netlify or Cloudflare Pages).

Two interchangeable storage back-ends behind one small interface (`js/store.js`):
1. **LocalStore** (default): `localStorage` on the device. Works immediately by opening `index.html`. Tabs on the same device stay in sync.
2. **FirestoreStore** (opt-in): Google Firebase Firestore on the free Spark plan. Real-time sync across every family phone. Uses the CDN "compat" SDK so no bundler is needed.

Sharing model for sync: no logins. A long random **Family Code** (20+ characters) names the family's data. It is generated in-app and shared by an invite link (`#join=CODE`, which never reaches a server). It is not stored in the deployed files. Firestore rules (`firestore.rules`) allow access only under `families/{code}/...` when the code is at least 16 characters, and forbid listing families. Anyone with the code can read and write, so the README says plainly not to post the link publicly.

## "End of day" capture, and its limit

Free static hosting has no server to run a midnight job, so the design does not need one:
- Every check-off or uncheck immediately writes that day's record (`days/YYYY-MM-DD`: scheduled chores, who checked what and when, done/total/percent). The record is always current, so the end-of-day number is always right.
- On the first open after a day ends, the app stamps that day's `final` score (lazy close-out) and shows a "Yesterday: 80% (4 of 5)" recap.
- Days nobody opened the site show "not logged", not 0%. The data can't tell "chores skipped" from "nobody recorded them".

## Scoring rules (one function, `scoreDay` in `js/logic.js`, easy to change)

- Day total = daily chores scheduled that day + weekly/monthly chores completed that day.
- Day done = checked ones among those.
- Day % = done / total. Weekly and monthly chores can only raise a day's score. Leaving them undone is captured in the week/month rollups, not by punishing individual days.
- Week and month rollups: weekly chores done out of weekly chores, monthly chores done out of monthly chores, and the average daily score.
- Streak = consecutive logged days at 100%. Days with no chores scheduled are skipped. A past "not logged" day breaks the streak.

## Features

- **Today**: progress ring, flame streak, "I'm checking as: [person]" chips (who gets credit), "only mine" filter, three sections (Today / This week / This month). Weekly and monthly chores show "done by Dad on Tue". Browse back and edit recent days (for "forgot to tick it").
- **Assign chores**: each chore is "Anyone" or one family member. Per-person tallies for the day and week, plus a friendly "Chore champion" label.
- **Streaks and badges**: family streak (current and best), milestone badges (3, 7, 14, 30 days), perfect-day confetti (respects reduced-motion).
- **History**: last 30 days bar chart (inline SVG, no library), day list with who did what, week and month rollups.
- **Chores / Family tabs**: add, edit, delete, reorder chores (frequency, optional weekdays for daily chores such as "weekdays only", assignee). Add or edit members (name, emoji, colour). Week start day (default Sunday). First-run wizard with optional starter chores.
- **Sync (Family tab)**: create a family or join with a code; copy invite link. Creating uploads the device's existing local data. Joining keeps a local backup first. JSON export and import as a safety net.
- **Quality of life**: mobile-first, 44px tap targets, dark mode, keyboard and ARIA-correct checkboxes, home-screen install via `manifest.webmanifest`, auto-rollover at midnight.

## Files

```
FamilyChores/
  index.html               app shell and tabs
  css/styles.css
  js/logic.js              pure functions: local-date helpers, week/month keys,
                           scheduling, scoreDay, rollups, streaks (UMD: browser + Node)
  js/store.js              LocalStore, FirestoreStore, migration, export/import
  js/app.js                rendering and events
  js/firebase-config.js    placeholder; user pastes their public Firebase web config
  firestore.rules          path-scoped rules, min code length
  manifest.webmanifest, favicon.svg
  tests/logic.test.js      node:test unit tests
  README.md                try it, publish free, turn on sync, add to home screen
  quality_reports/plans/2026-11-16_family-chores-site.md   copy of this plan
```

Data model: `data/config` holds `{familyName, members[], tasks[], settings}`. `days/{date}` holds `{date, scheduled[{id,title,freq,assignee}], checks{taskId:{by,at,title,freq}}, final?}`. Titles are snapshotted so history survives later edits and deletes. Dates are built from local y/m/d, never `toISOString`, to avoid timezone and DST off-by-one errors. Check-offs are written as nested-map merges so two people ticking different chores at once never overwrite each other.

## Out of scope for v1 (can add later)

Push notifications or reminders, rewards or allowance, photo proof, per-person login or PINs, offline service worker, printable weekly chart (not selected).

The research-pipeline rules in this repo (adversarial agent pairs, scoring, research journal) are for the papers and do not apply to this site. I'm not dispatching them.

## Verification

1. `node --test tests/` covers local-date and week/month boundaries (year end, leap day, week start Sunday vs Monday), daily scheduling by weekday, `scoreDay` (flexible chores raise but never lower the score, empty days), rollups and streak edge cases (not-logged gap, zero-chore days, 100% chains).
2. Serve locally (`python3 -m http.server`) and drive the real UI in a headless browser if one is available. Cover first-run wizard, add chore, check and uncheck, switch person, change day, history chart, export and import, dark mode, 390px phone width. If no headless browser exists, give you a short click-through checklist instead and say so.
3. A contract test runs the same store-interface checks against LocalStore and an in-memory fake of the Firestore adapter.
4. **Cannot be verified here:** the live Firestore path, because it needs your Firebase project. The adapter is kept thin (about 60 lines) and the README has a 10-minute setup with a "two phones" test. I will say so in my final report instead of claiming it works.
5. No placeholder or invented data ships as real. Starter chores are clearly editable samples.
