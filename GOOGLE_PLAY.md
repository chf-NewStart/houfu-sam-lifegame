# Publishing the Game Life Arcade to Google Play

Wraps the live PWA (lifegameproject.com) in a thin Android shell (a **TWA** —
Trusted Web Activity) so it installs from the Play Store and opens fullscreen.
No rewrite — it's the same site, and the installed app opens to the **arcade hub**
(`start_url` is now `/`).

## ✅ Already done in this repo
- Installable PWA: `manifest.json` (arcade name/description, `id`, icons 192/512/maskable — maskable has an 18% safe margin), service worker (offline app shell)
- 6 phone-portrait store screenshots in `screenshots/phone-1…6.png` (1290×2796)
- `.well-known/assetlinks.json` scaffold (needs one value — step 3)
- Privacy policy at **lifegameproject.com/privacy** (Play requires a URL)
- Store-listing copy (bottom of this file)

## 🟩 Your steps (~1 hour of work + a one-time $25)

### 1. Google Play developer account
Sign up at **play.google.com/console** — $25 one-time. Personal accounts need ID
verification, and **new personal accounts must run a closed test** (a required
number of testers for ~2 weeks — check the current threshold in Console) before
you can publish publicly. Budget that lead time; start the account early.

### 2. Generate the Android package — PWABuilder
Go to **pwabuilder.com**, enter `https://lifegameproject.com`, then
**Package For Stores → Android → Google Play**.
- **Package ID:** `com.lifegameproject.arcade` (must match `assetlinks.json` — step 3)
- Leave signing as **"Let PWABuilder generate a signing key"** (download & keep the
  `.keystore` + passwords safe — you need the SAME key for every future update)
- Download the zip → it contains:
  - `app-release-signed.aab` (the app you upload)
  - `assetlinks.json` (with the real SHA-256 fingerprint)
  - a readme with your fingerprint

### 3. Wire up Digital Asset Links (makes it open fullscreen, no URL bar)
Copy the `sha256_cert_fingerprints` value from the PWABuilder `assetlinks.json`
into **this repo's** `.well-known/assetlinks.json` (replace `REPLACE_ME`), keep the
`package_name` as `com.lifegameproject.arcade`, then commit + push. Confirm it's live:
```
https://lifegameproject.com/.well-known/assetlinks.json
```
(Must return the JSON, not a 404. GitHub Pages serves it because `.nojekyll` exists.)

### 4. Create the app in Play Console & submit
- Create app → upload the `.aab` to a **Closed testing** track first.
- Fill the **store listing** (copy below) and upload the **phone screenshots** from
  `screenshots/phone-1…6.png` (real 1290×2796 phone captures of the arcade and its
  games — better than the desktop `screen-*.png`).
- Set **content rating** (questionnaire → "Everyone"), pick **Category: Games**, and
  add the **privacy policy URL**: `https://lifegameproject.com/privacy`.
- Submit for review (first review can take a few days).

> iOS later: PWABuilder also generates an Xcode project — see `APPLE_APP_STORE.md`.
> Play first: it's cheaper and officially supports PWAs, so ship here to learn the flow.

---

## 📋 Store listing copy

**App name** (30 char max)
```
Game Life Arcade
```
> "Game Life Arcade" should be free on Play; confirm at upload and tweak if needed.

**Short description** (80 char max)
```
Nine hand-coded games: Life, Gomoku, mazes, tomatoes & more. Offline. 游戏厅.
```

**Full description** (4000 char max)
```
A little arcade of hand-coded browser games — no engines, no ads, no tracking.
Nine games in one app, most of them playable offline.

THE GAMES
• Game of Life — draw cells, watch them evolve, and turn the living grid into
  music. Free-play sandbox, goal-based challenges with a global leaderboard, and
  a Music Box sequencer that plays your pattern as it grows.
• Gomoku — five-in-a-row against a minimax AI, watch AI-vs-AI, or play a friend
  online.
• Labyrinth — an endless torch-lit descent with fog-of-war line-of-sight and a
  bigger maze every time you escape.
• Grow a Tomato — raise the biggest, sweetest tomato by balancing light and feed
  across the season, powered by a real plant-metabolism model.
• Tomatoswipe — Minesweeper, but the mines are tomatoes. Read the numbers, flag
  the 🍅, clear the garden.
• Sudoku — every puzzle has one guaranteed unique solution, with pencil notes,
  hints and a one-click solver.
• Keep-Up & Co-op Lander — two-player games you play on one device or remotely
  in a shared room.
• Tether — two players, one rope, hand-coded Verlet physics; climb together or
  fall together.

• Fully bilingual: English / 中文
• Works offline · no ads · no tracking · lightweight

Built by hand for the love of it — a pocket arcade you can pick up for thirty
seconds or an hour.
```

**Category:** Games  ·  **Tags:** casual, puzzle, arcade
**Contact email:** houfuchen0702@gmail.com
**Privacy policy:** https://lifegameproject.com/privacy
