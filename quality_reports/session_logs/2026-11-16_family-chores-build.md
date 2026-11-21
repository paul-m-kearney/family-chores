# Session log: Family Chores site build (2026-11-16)

**Goal:** Free-hosted family chore tracker: daily/weekly/monthly lists, anyone can check off, who did it, daily completion captured, history.

**Decisions (from PI answers):**
- Devices: "both, start simple" → LocalStore default, optional Firestore sync behind one interface (`js/store.js`).
- Weekly/monthly: "flexible" → done any day in the period, count toward the day completed, never lower a day's score.
- Extras: assign chores to people; streaks and badges. Printable chart not selected.
- Hosting: static site (GitHub Pages / Netlify / Cloudflare), not WordPress.com (free plan can't run scripts).
- No server for "end of day": every check-off writes the day record; lazy close-out stamps `final` on first open after midnight; never-opened days shown as "not logged", not 0%.
- Starter chores are the PI's real list (9 daily, 14 weekly, 6 monthly), supplied mid-session.

**Verification:**
- `node --test tests/*.test.js`: 18/18 pass (logic + store contract against LocalStore and a Firestore fake).
- Headless Chrome via DevTools protocol (`scratchpad/drive.mjs`): 40/40 UI checks, no console errors; screenshots at 390px and 1100px, light and dark.
- Driver pitfalls found (not app bugs): stale DOM nodes after re-render; `Page.navigate` to same URL + hash is a same-document navigation (use `Page.reload`); stale tabs on the same origin.
- Fixed from screenshots: history chart labels unreadable on phone (viewBox 720 → 360, max-width 520px).

**Not verified here:** live Firestore path (needs the PI's Firebase project). Adapter is ~60 lines; README has the two-phone test.

**Open PI items:** publish to a host; optionally set up Firebase and paste config into `js/firebase-config.js`; rename "Our Family" default and add members in the wizard.

## 2026-11-17 addendum: tablet, Firebase, live sync verification

- Samsung tablet (serial 5200ba30c0da45df) appeared over USB only after a data cable; no adb/MTP tooling on the Mac, and auto mode refused to execute the downloaded (checksum-verified) platform-tools adb. Fell back to LAN transfer (python http.server on 8765) and then to the hosted + Firebase plan at the PI's request.
- PI created Firebase project `family-chores-kearney`; web config pasted into `js/firebase-config.js` (public identifiers, not secrets).
- REST probes against the live database found two rule bugs, both mine: (1) `allow write` on config blocked deletes (no request.resource on delete) -> split into create/update + delete; (2) `allow read` on days with a per-doc date condition blocked the collection *listing* the app subscribes to -> `allow list` without condition, `allow get`/`write` keep the date check. PI republished; propagation ~1 min.
- App hardening from the live test: replaced blocking `alert()` with an in-app error dialog (an alert froze headless Chrome and would freeze a kiosk tablet); clearer permission-denied message; already-joined invite links land on Today; **sync-mode uncheck used a dotted string field path that fails for ids starting with a digit** -> `firebase.firestore.FieldPath('checks', id)`.
- Verification: `tests/ui-drive-sync.mjs` 20/20 against the real Firestore (create family uploads 29 tasks; check-off, uncheck, re-check reach the server; server-side REST write appears live in the page at 22%; second tab joins via invite link and shows synced state). `tests/ui-drive.mjs` local mode 40/40. Unit tests 18/18. Test families and probe docs deleted afterwards.
- Deliverable: `FamilyChores.zip` (30.6 KB) with config and corrected rules. Local server on 8765 left running for the tablet; headless Chrome stopped.

## 2026-11-17 addendum 2: avatar stamps

- PI request: stamp each completed task with the completer's unique avatar.
- Change: the check button becomes the completer's stamp (emoji on their colour) with a short pop animation; "for <name>" marks the assignee separately; History log lines carry the stamp plus name and time; member chips use coloured avatars; each check-off snapshots byName/emoji/color so history survives member edits or removal; member form disables avatars and colours already taken, defaults to the first unused, blocks exact duplicates; wizard assigns distinct pairs.
- Verification: local UI 47/47 (new checks: stamp class/emoji/colour match the chosen person, accessible label names the completer, log stamps, taken avatars disabled), live sync 20/20, unit 18/18. Zip rebuilt.

## 2026-11-21 addendum 3: points and rewards

- PI request: per-member points (+1 daily, +3 weekly, +5 monthly), a reward thermometer with prizes at 25/50/100, and a manual way to deduct points when exchanged.
- Design: earned points are derived from check-offs (`ChoreLogic.pointsEarned`), never stored, so unchecking takes them back; exchanges and bonuses are a ledger in `config.redemptions` ({id, memberId, delta, note, at, by, byName}); balance = earned + bonus − exchanged. Ledger lives in the config doc so no Firestore rules change was needed. Point values and the three reward tiers (points + label) are editable on the Family tab (`settings.points`, `settings.rewards`).
- UI: new Rewards tab (🏆): per-member card with balance, horizontal thermometer (bulb + tube, tick marks at each tier, reached ticks green), "N more for <prize>", Exchange dialog (affordable tiers selectable, others greyed, custom amount, note), Adjust dialog (± with reason), ledger with undo. Chore rows show "+1/+3/+5".
- Verification: unit 21/21 (3 new tests), local UI 64/64 (17 new checks), live sync 20/20. Zip rebuilt.
