# Publishing Game of Life to Google Play

This wraps the live PWA (lifegameproject.com) in a thin Android shell (a **TWA** —
Trusted Web Activity) so it installs from the Play Store and opens fullscreen.
No rewrite — it's the same site.

## ✅ Already done in this repo
- Installable PWA: manifest, service worker, icons (192/512/maskable)
- `manifest.json` extras for stores: `id`, `lang`, `screenshots`
- 3 store screenshots in `screenshots/`
- `.well-known/assetlinks.json` scaffold (needs one value — step 3)
- Privacy policy at **lifegameproject.com/privacy** (Play requires a URL)
- Store-listing copy (bottom of this file)

## 🟩 Your steps (~1 hour of work + a one-time $25)

### 1. Google Play developer account
Sign up at **play.google.com/console** — $25 one-time. Personal accounts need ID
verification and (for new personal accounts) a short testing period before going
fully public; budget a few days of lead time.

### 2. Generate the Android package — PWABuilder
Go to **pwabuilder.com**, enter `https://lifegameproject.com`, then
**Package For Stores → Android → Google Play**.
- **Package ID:** `com.lifegameproject.twa` (must match `assetlinks.json` — see step 3)
- Leave signing as **"Let PWABuilder generate a signing key"** (download & keep the
  `.keystore` + passwords safe — you need the SAME key for every future update)
- Download the zip → it contains:
  - `app-release-signed.aab` (the app you upload)
  - `assetlinks.json` (with the real SHA-256 fingerprint)
  - a readme with your fingerprint

### 3. Wire up Digital Asset Links (makes it open fullscreen, no URL bar)
Open the `assetlinks.json` PWABuilder gave you, copy the
`sha256_cert_fingerprints` value into **this repo's** `.well-known/assetlinks.json`
(replace the `REPLACE_ME` placeholder), then commit + push. Confirm it's live:
```
https://lifegameproject.com/.well-known/assetlinks.json
```
(It must return the JSON, not a 404. GitHub Pages serves it because `.nojekyll` exists.)

### 4. Create the app in Play Console & submit
- Create app → upload the `.aab` to a **Closed testing** track first (recommended).
- Fill the **store listing** (copy below), upload **phone screenshots**
  (install the PWA on your phone via "Add to Home Screen", screenshot 2–8 views —
  these look better than the desktop ones in `screenshots/`).
- Set **content rating** (questionnaire → it'll be "Everyone"), pick
  **Category: Games**, and add the **privacy policy URL**: `https://lifegameproject.com/privacy`.
- Submit for review (first review can take a few days).

> Apple/iOS later? PWABuilder can also generate an Xcode project — but that needs a
> Mac + a $99/yr Apple account and is more likely to get review pushback. Play first.

---

## 📋 Store listing copy

**App name** (30 char max)
```
Game of Life
```

**Short description** (80 char max)
```
Draw cells, watch them evolve, make music, take on challenges. 生命游戏.
```

**Full description** (4000 char max)
```
Conway's Game of Life, reimagined as a playground.

Draw cells with your finger, press play, and watch them come alive — gliders,
oscillators, and patterns you'd never expect from just three simple rules.

THREE MODES
• Sandbox — free play: draw, stamp built-in patterns, and watch them evolve
• Challenges — goal-based puzzles with a global leaderboard
• Symphony — turn the grid into music; a playhead sweeps across and your living
  cells sing

FEATURES
• 20+ classic patterns (glider, pulsar, Gosper gun and more) — drag, rotate, stamp
• Aura mode — cells glow by age
• Lookahead — preview future generations as you build
• Zoom, pan, and a focus-zone tool
• Interactive lessons that teach the rules and the tools
• Fully bilingual: English / 中文
• Works offline · no ads · no tracking · lightweight

Whether you want to relax and watch life unfold, compose generative music, or beat
every challenge, the Game of Life is a tiny universe in your pocket.
```

**Category:** Games  ·  **Tags:** casual, puzzle, educational
**Contact email:** houfuchen0702@gmail.com
**Privacy policy:** https://lifegameproject.com/privacy
