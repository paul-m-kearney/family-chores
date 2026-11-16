# Family Chores

A small website that keeps a family's daily, weekly and monthly chores in one list. Anyone can check a chore off, every check-off records who did it and when, and each day's completion percentage is saved so you can look back at the week or month.

It is a plain static site (HTML, CSS, JavaScript). There is nothing to install and nothing to pay for.

## Try it right now

Open `index.html` in a browser. That's it. On first run it asks for a family name and the family's names, and offers to pre-load the chore list (9 daily, 14 weekly, 6 monthly). Everything is saved on that device.

## Put it online for free (about 5 minutes)

Any free static host works. GitHub Pages is the simplest:

1. Create a free account at github.com and click **New repository**. Name it `family-chores`, keep it **Public**, and create it.
2. Click **uploading an existing file**, drag in everything in this folder (keep the `css` and `js` folders), and click **Commit changes**.
3. In the repository, open **Settings → Pages**. Under "Branch" choose `main` and `/ (root)`, then **Save**.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/family-chores/`.

Netlify Drop (drop the folder at app.netlify.com/drop) and Cloudflare Pages work the same way.

Why not WordPress.com? Its free plan can't run custom scripts, and the live check-off list needs them.

## Add it to a phone's home screen

Open the site in the phone's browser, then **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android). It opens full-screen like an app.

## Turn on sync (everyone on their own phone)

Out of the box the list lives on one device. To share it live across every phone, give the site a free database. This takes about 10 minutes, once.

1. Go to console.firebase.google.com, sign in with a Google account, and click **Create a project**. Name it anything (for example `family-chores`). You can turn Google Analytics off.
2. In the project, click **Build → Firestore Database → Create database**. Choose a location near you and **Start in production mode**.
3. Open the **Rules** tab, delete what's there, paste the contents of `firestore.rules` from this folder, and click **Publish**.
4. Click the gear icon → **Project settings**. Under "Your apps" click the **</>** (Web) icon, give the app a nickname, and click **Register app**. You'll see a block that starts `const firebaseConfig = {`.
5. Open `js/firebase-config.js` in a text editor. Replace the line `window.FIREBASE_CONFIG = null;` with `window.FIREBASE_CONFIG = { ... };` using the values from step 4. Save, and re-upload the file to your host.
6. Open your site, go to the **Family** tab, and tap **Create a shared family**. The device's existing chores and history are uploaded.
7. Tap **Copy invite link** and send it to each family member. Opening the link joins them to the family.

**Test with two phones:** check a chore off on one, and it should appear ticked on the other within a second or two.

### How access works

There are no logins. The family is identified by a long random code (24 letters and digits) that lives in the invite link. The Firestore rules only allow reading and writing under that code, and nobody can list which codes exist. Anyone who has the link can see and edit your chores, so share it with the family and don't post it anywhere public. If a link leaks, tap **Leave family** on one device, **Create a shared family** again, and send the new link around.

The `firebaseConfig` values are not secrets; they identify your project, and the rules control access.

### Free-plan limits

Firebase's free Spark plan allows 50,000 reads and 20,000 writes per day. A family of five checking off a few dozen chores uses well under 1% of that.

## How scoring works

- **Daily chores** are scheduled on the days you pick (every day, or specific weekdays). Each one counts toward that day's total whether or not it gets done.
- **Weekly and monthly chores** sit in "This week" and "This month". They can be done on any day in the period and count toward the day they're completed. They can raise a day's score but never lower it. Whether they were done at all shows in the week and month rollups.
- **Day score** = chores done ÷ chores counted, saved automatically with every check-off. The first time anyone opens the site after midnight, the previous day is stamped as final and a "Yesterday: 80%" recap appears.
- **Not logged** means nobody opened the site that day. It is shown as a dashed mark, not 0%, because the data can't tell "skipped" from "nobody recorded it".
- **Streak** = consecutive days at 100%. Days with nothing scheduled don't break it; a not-logged day with scheduled chores does. Badges at 3, 7, 14 and 30 days.

## Everyday use

- **Today** tab: the progress ring, the streak, "I'm checking as" (tap your name once per device so check-offs are credited to you), "Only my chores", and the three lists. Use ‹ › to look back and fix a day someone forgot to tick.
- **History** tab: a 30-day chart, week and month rollups, the chore champion, and a day-by-day log of who did what.
- **Chores** tab: add, edit, reorder, assign to a person, choose weekdays, delete.
- **Family** tab: members, settings, sync, and backup (download a JSON file; restore from one).

## Files

```
index.html            app shell
css/styles.css        styles, light and dark
js/logic.js           dates, scheduling, scoring, streaks (no DOM; unit tested)
js/store.js           storage: this device (localStorage) or shared (Firestore)
js/app.js             screens and events
js/firebase-config.js paste your Firebase config here to turn on sync
firestore.rules       database access rules (paste into Firebase console)
manifest.webmanifest  home-screen install
tests/                run with: node --test tests/*.test.js
```

## Changing things

Starter chores, member colours and icons are at the top of `js/app.js`. Scoring is the `scoreDay` function in `js/logic.js`; if you change it, run the tests.
