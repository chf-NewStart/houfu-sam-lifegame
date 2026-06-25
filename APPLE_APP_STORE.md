# Publishing Game of Life to the Apple App Store

Wraps the live PWA (lifegameproject.com) in a native iOS shell via **PWABuilder**,
so it installs from the App Store. Same site, native container (WKWebView).

## ⚠️ Read this first — the real risk
Apple's **Guideline 4.2 (Minimum Functionality)** often rejects apps that are
"just a website in a web view." Your odds are *better than average* because the app
**works offline**, is genuinely **interactive** (drawing, Web Audio music,
challenges, lessons), and isn't a marketing page — but **rejection is a real
possibility**, and you may need to iterate (e.g. add a native touch like push
notifications, or reply explaining the offline/interactive value). Budget for a
back-and-forth. This is the hardest, priciest store — and if it's rejected, the
PWA install, itch.io, and Google Play / Amazon routes all still stand.

## ✅ Already done in this repo
- Installable PWA (manifest with `id`/icons, service worker)
- Privacy policy live at **lifegameproject.com/privacy** (Apple requires the URL + a privacy label)
- Store-listing copy (bottom of this file)

## What you need
- A **Mac** with **Xcode** (free, Mac App Store) — ✓ you have the Mac
- **Apple Developer Program** membership — **$99/year** (developer.apple.com/programs)
- ~2–3 hours of setup + Apple's review time (~1–3 days; longer if rejected)

## Steps

### 1. Enroll in the Apple Developer Program
**developer.apple.com/programs → Enroll** ($99/yr; individual account is fine).
Identity verification can take a day or two.

### 2. Generate the iOS package — PWABuilder
**pwabuilder.com** → enter `https://lifegameproject.com` → **Package For Stores → iOS**.
Download the zip — it's an **Xcode project** wrapping the PWA.
- **Bundle ID:** reverse-domain, unique, e.g. `com.lifegameproject.app`

### 3. Build & upload in Xcode
- Open the `.xcodeproj` from the zip.
- **Signing & Capabilities** → pick your **Team** (your Developer account) → let Xcode auto-manage signing.
- Set **Display Name**, confirm icons (PWABuilder includes them) and bundle ID.
- Target **"Any iOS Device"** → **Product → Archive**.
- In the **Organizer** → **Distribute App → App Store Connect → Upload**.

### 4. App Store Connect listing
**appstoreconnect.apple.com → My Apps → + New App**
- **Name (unique!):** "Game of Life" is taken — use e.g. **"Cellsmith: Game of Life"**.
- **Bundle ID:** the one from step 2.
- Wait ~15–30 min for the uploaded build to finish processing, then select it.
- **Screenshots (required):** at minimum **iPhone 6.7"** (1290×2796). Install the PWA on
  your iPhone ("Add to Home Screen"), screenshot 2–10 views — or use the iOS Simulator.
- **Description / keywords / category** (copy below). Category: **Games** (+ Puzzle / Simulation).
- **Privacy policy URL:** `https://lifegameproject.com/privacy`
- **App Privacy label:** declare the leaderboard/gallery store a **display name + score
  you submit** (optional, not linked to your identity); no tracking, no ads.
- **Age rating:** questionnaire → **4+**.
- **Submit for review.**

> If rejected under 4.2: reply in Resolution Center stressing offline use, the
> interactive drawing/simulation, and the Web-Audio "Music Box" — or add a small
> native feature (push notifications are the usual unlock) and resubmit.

---

## Listing copy

**Name (30 char max):** `Cellsmith: Game of Life`
**Subtitle (30 char max):** `Draw, evolve, make music`
**Keywords (100 char):** `game of life,cellular automata,conway,sandbox,simulation,generative,music,puzzle,relax`
**Support URL:** `https://lifegameproject.com`
**Privacy Policy:** `https://lifegameproject.com/privacy`
**Category:** Games · Puzzle / Simulation

**Description:**
```
Conway's Game of Life, reimagined as a playground.

Draw cells with your finger, press play, and watch them come alive — gliders,
oscillators, and patterns you'd never expect from just three simple rules.

THREE MODES
• Sandbox — draw, stamp built-in patterns, and watch them evolve
• Challenges — goal-based puzzles with a global leaderboard
• Music Box — turn the grid into music; a playhead sweeps across and your living
  cells sing

FEATURES
• 20+ classic patterns — drag, rotate, mirror, stamp
• Aura mode — cells glow by age
• Lookahead — preview future generations as you build
• Zoom, pan, and a focus-zone tool
• Interactive lessons that teach the rules and the tools
• Fully bilingual: English / 中文
• Works offline · no ads · no tracking

Relax and watch life unfold, compose generative music, or beat every challenge —
a tiny universe in your pocket.
```
