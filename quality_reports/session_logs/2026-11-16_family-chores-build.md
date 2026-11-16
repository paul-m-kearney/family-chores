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
