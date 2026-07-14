# Publishing the Game Life Arcade to the Apple App Store

Wraps the live PWA (lifegameproject.com) in a native iOS shell via **PWABuilder**,
so it installs from the App Store. Same site, native container (WKWebView). The
installed app opens to the **arcade hub** (`start_url` is `/`).

## ⚠️ Read this first — the real risk
Apple's **Guideline 4.2 (Minimum Functionality)** often rejects apps that are
"just a website in a web view." Your odds are *better than average* because most
of the arcade **works offline** and is genuinely **interactive** (drawing, Web
Audio music, physics, AI opponents, lessons) — it plays like an app, not a
marketing page. But an arcade of web games can also read to a reviewer as a
"portal," so **rejection is a real possibility** and you may need to iterate.

Two things that lower the risk:
1. **Bundle the assets in the app (offline-first)** rather than pointing the
   web view at a remote URL. PWABuilder's iOS project can do this; the
   **Capacitor** route (below) bundles by default. An app that fully works with
   the network off is a much stronger 4.2 defense — lead with Game of Life,
   Sudoku, Labyrinth, Tomatoswipe (all offline) in your screenshots/description,
   and treat the online multiplayer (Keep-Up / Lander / Gomoku online) as a bonus.
2. Be ready to **reply in the Resolution Center** stressing offline use and the
   interactive drawing/simulation, and/or add one small native feature (push
   notifications are the usual unlock). Budget for a back-and-forth.

If it's rejected, the PWA install, Google Play, and itch.io routes all still stand.

## ✅ Already done in this repo
- Installable PWA (`manifest.json` with arcade name/`id`/icons, service worker)
- Privacy policy live at **lifegameproject.com/privacy** (Apple requires the URL + a privacy label)
- 6 phone-portrait screenshots at **1290×2796** in `screenshots/phone-1…6.png` (the 6.7" size Apple wants)
- Store-listing copy (bottom of this file)

## What you need
- A **Mac** with **Xcode** (free) — the build/sign/submit steps are Mac-only
- **Apple Developer Program** membership — **$99/year** (developer.apple.com/programs)
- ~2–3 hours of setup + Apple's review time (~1–3 days; longer if rejected)

## Quick path — account already active
You're enrolled (individual account works fine). On your Mac, this is the whole ship:
```bash
cd app && npm install && npm run ios      # builds the offline www, syncs, opens Xcode
```
1. Xcode → target **App** → **Signing & Capabilities** → select your **Team** (auto-manage signing). Xcode registers the bundle ID `com.lifegameproject.arcade` for you.
2. Plug in your iPhone, press ▶ — spend ten minutes actually playing (Glyph Run joystick feel is the thing to check).
3. **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect**.
4. appstoreconnect.apple.com → **New App** → fill the listing from the copy below → attach the processed build → **Submit for review**.

**If Guideline 4.2 bites** (the "web portal" objection), the pivot is cheap and this
repo is ready for it: change `appId`/`appName` in `app/capacitor.config.json` to a
standalone **字源 Glyph Run** app, point `index.html` → `game/glyphrun.html` in the
shell (redirect or swap the start page in `sync-www.js`), new icon from the seal
stamp, resubmit as a single polished game. One focused game with offline play,
sound, progression and a codex is the strongest possible 4.2 story.

## Steps

### 1. Enroll in the Apple Developer Program
**developer.apple.com/programs → Enroll** ($99/yr; individual account is fine).
Identity verification can take a day or two — start it early.

### 2. The iOS project — already scaffolded in `app/`
This repo now contains a **Capacitor** iOS project at **`app/`** that bundles the
whole arcade *inside* the app (offline-first — the strongest Guideline 4.2 story).
Bundle ID: `com.lifegameproject.arcade` · Name: "Game Life Arcade" · icon + dark
splash already set. See **`app/README.md`** for the exact Mac commands.

### 3. Build & upload — on the Mac
```bash
# one-time: Xcode (App Store) · Node.js (nodejs.org LTS) · brew install cocoapods
cd app
npm install
npm run ios        # builds www, syncs, opens Xcode
```
- **Signing & Capabilities** → pick your **Team** → let Xcode auto-manage signing.
- Test on your iPhone first (plug in, press ▶) — make sure games feel right in the shell.
- Target **"Any iOS Device (arm64)"** → **Product → Archive**.
- **Organizer** → **Distribute App → App Store Connect → Upload**.

### 4. App Store Connect listing
**appstoreconnect.apple.com → My Apps → + New App**
- **Name (must be unique!):** e.g. **"Game Life Arcade"** — confirm availability at creation.
- **Bundle ID:** the one from step 2.
- Wait ~15–30 min for the build to process, then select it.
- **Screenshots (required):** upload `screenshots/phone-7-glyphrun.png` + `phone-8-glyphrun-battle.png` FIRST (the marquee), then `phone-1…6.png` (all 6.7" / 1290×2796).
- **Description / keywords / category** (copy below). Category: **Games** (+ Puzzle / Arcade).
- **Privacy policy URL:** `https://lifegameproject.com/privacy`
- **App Privacy label:** the leaderboard/gallery store a **display name + score you
  submit** (optional, not linked to your identity); no tracking, no ads.
- **Age rating:** questionnaire → **4+**.
- **Submit for review.**

---

## Paste-ready for App Store Connect

**Promotional text (170 char, editable without review):**
```
New: 字源 Glyph Run — be a Chinese character, fight with real radicals, evolve
3,000 years back to your oracle-bone form. Plays fullscreen landscape on iPhone.
```

**Review notes (paste into "Notes" when submitting — heads off Guideline 4.2):**
```
All ten games are bundled inside the app and fully playable OFFLINE (airplane
mode works). No account or login required. Suggested review path: open
字源 Glyph Run (first card) — it runs fullscreen landscape with touch-anywhere
steering, original canvas engine, synthesized Web Audio sound, progression that
persists between runs, and an in-game encyclopedia; then Game of Life (draw on
the grid, switch to Music Box mode for sound). Online extras (remote co-op
rooms, optional leaderboard) degrade gracefully when offline. No ads, no
tracking, no third-party SDKs.
```

**App Privacy label answers (Data Collection):**
- "Do you collect data from this app?" → **Yes**, only if you keep the Life
  leaderboard/gallery; the data is a **display name + score the player types in**.
  Declare: **User Content** → "Name/score submitted to a public leaderboard" →
  **Not linked to identity**, **not used for tracking**, **app functionality** only.
- Everything else (runs, unlocks, settings) stays **on-device** (localStorage) — not collected.
- Tracking: **No**. Third-party ads: **No**.

**Export compliance:** already answered in the project —
`ITSAppUsesNonExemptEncryption = false` is set in Info.plist (HTTPS only), so
App Store Connect won't ask per build.

**Age rating questionnaire:** everything "None" → **4+** (stylized line-art
combat against ghost glyphs; no realistic violence, no user chat).

**What's New (v1.0):**
```
First release — ten hand-coded games, offline-first, bilingual (EN/中文).
Headliner: 字源 Glyph Run, an arena survivor that teaches oracle-bone script.
```

---

## Listing copy

**Name (30 char max):** `Game Life Arcade`
**Subtitle (30 char max):** `字源 Glyph Run + 9 more games`
**Keywords (100 char):** `chinese,hanzi,oracle bone,survivor,game of life,gomoku,sudoku,maze,offline,字源`
**Support URL:** `https://lifegameproject.com`
**Privacy Policy:** `https://lifegameproject.com/privacy`
**Category:** Games · Puzzle / Arcade

**Description:**
```
A little arcade of hand-coded games — no engines, no ads, no tracking.
Ten games in one app, most of them playable offline.

字源 GLYPH RUN — the headliner
You ARE a Chinese character, hunted through four nights of script. Steer and
your ink fights back with real brush strokes. Evolve 3,000 years to your
oracle-bone form (人→大→夫→舞 and seven more families); every weapon is a true
radical worn on your body — become the right form carrying the right radical
and you spell a real character (牛+宀=牢, 隹+网=羅). Five-element synergies, a
bamboo-scroll upgrade desk, a carved-seal meta-progression, and a codex where
every glyph links to its real 3,000-year history. A survivors-style arcade
game that quietly teaches oracle-bone etymology.

THE OTHER GAMES
• Game of Life — draw cells, watch them evolve, and turn the living grid into
  music. Sandbox, leaderboard challenges, and a Music Box sequencer.
• Gomoku — five-in-a-row against a minimax AI, AI-vs-AI, or a friend online.
• Labyrinth — an endless torch-lit descent with fog-of-war and a bigger maze
  every time you escape.
• Grow a Tomato — raise the biggest, sweetest tomato with a real
  plant-metabolism model.
• Tomatoswipe — Minesweeper, but the mines are tomatoes.
• Sudoku — one guaranteed unique solution, with pencil notes, hints and a solver.
• Keep-Up & Co-op Lander — two-player games on one device or remotely.
• Tether — two players, one rope, hand-coded physics.

• Fully bilingual: English / 中文
• Works offline · no ads · no tracking

Built by hand for the love of it — a pocket arcade for thirty seconds or an hour.
```
