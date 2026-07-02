# 🚗 License Plate Game

A simple, phone-friendly web app for the classic road-trip license plate game.
Spot plates from all **50 states + Washington D.C. (51 total)**, tap to mark each
one found, and keep a running count of how many times you've seen each one — with
a colorful visual plate for every state. Play across multiple devices on one
shared board.

**Live board sharing** works through Firebase (free). Until you add Firebase keys,
the app still runs perfectly — it just saves to the one device you're on.

---

## How to play

- **Tap a plate** when you spot it on the road. It lights up green, counts up,
  and adds to your progress.
- **Tap it again** each time you see that state again — the badge tracks the total.
- Made a mistake? Tap the **−** button on a found plate to knock the count down.
- Use the **All / Found / Missing** tabs and the **sort** menu (A–Z, Recent,
  Most seen) to slice the board however you like.
- Open **⚙️ Settings** to change the game code, copy a share link, or reset.

### Same board on multiple phones
Everyone opens the **same game code** (default: `roadtrip`). Use
**⚙️ → Copy shareable link** to send a URL like
`…/index.html?game=roadtrip` to the other phones — opening it joins that board.
With Firebase turned on, every tap syncs live across all of them.

---

## 1) Put it online with GitHub Pages (free)

This repo is a plain static site — no build step.

**Option A — automatic (recommended):** a workflow is included at
`.github/workflows/deploy.yml`.
1. Push this repo to GitHub (branch `main`).
2. In your repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow deploys on every push to `main`. Your site appears at
   `https://<your-username>.github.io/<repo-name>/`.

**Option B — no workflow:** **Settings → Pages → Source: Deploy from a branch →
`main` / `/ (root)`**. Same result, deploys straight from the branch.

That's it — the game is now playable on any phone at that URL (local-only until
you do step 2).

---

## 2) Turn on cross-device live sync with Firebase (free)

Firebase's free "Spark" plan is plenty for a family road trip.

1. Go to **https://console.firebase.google.com** → **Add project**. Give it any
   name, accept defaults (you can disable Google Analytics).
2. On the project dashboard, click the **`</>` (Web)** icon to *"Add an app to
   get started."* Register it with any nickname. Firebase shows you a snippet:
   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "your-project.firebaseapp.com",
     databaseURL: "https://your-project-default-rtdb.firebaseio.com",
     projectId: "your-project",
     …
   };
   ```
3. In the left sidebar: **Build → Realtime Database → Create Database**. Choose a
   location, then start in **Test mode** (fine for a trip) and click through.
   - If `databaseURL` wasn't in the snippet at step 2, grab it from the top of the
     Realtime Database page now.
4. Open **`firebase-config.js`** in this repo and paste your real values over the
   `YOUR_…` placeholders. Save.
5. Commit & push. The app now shows **● Live sync** in Settings, and every device
   on the same game code updates in real time. 🎉

### Recommended database rules (optional but tidy)
Test mode leaves the database open to anyone who has your project URL for ~30
days. For something a bit more contained, in **Realtime Database → Rules** you can
scope access to just this game's data:
```json
{
  "rules": {
    "games": {
      "$game": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```
This is a casual, no-login family game, so the data is intentionally open. Don't
store anything sensitive. If you want it private, add
[Firebase Anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth)
and tighten the rules to `auth != null`.

---

## Add it to your home screen (feels like an app)

- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** ⋮ menu → *Add to Home screen / Install app*.

---

## Files

| File | What it does |
|------|--------------|
| `index.html` | App shell / layout |
| `styles.css` | Phone-first styling + the CSS-rendered plates |
| `plates.js` | The 51 plates (names, nicknames, colors) |
| `app.js` | Game logic, rendering, controls |
| `sync.js` | Storage layer — Firebase if configured, else localStorage |
| `firebase-config.js` | **Paste your Firebase keys here** to enable sync |
| `manifest.json` | Home-screen name/icon |
| `.github/workflows/deploy.yml` | Auto-deploy to GitHub Pages |

No frameworks, no build tools — just open `index.html` to run it locally.
