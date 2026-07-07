# Game Life Arcade — native iOS shell (Capacitor)

This directory wraps the whole arcade in a native iOS app. The site's files are
**bundled inside the app** (offline-first — the strongest defense against
Apple's "just a website" Guideline 4.2), not loaded from the network. Online
features (remote rooms, leaderboard) still work when the device is online.

- `capacitor.config.json` — app id `com.lifegameproject.arcade`, name "Game Life Arcade"
- `scripts/sync-www.js` — copies the playable site from the repo root into `www/`
  (run again whenever the games change, then re-sync)
- `ios/` — the generated Xcode project (icon + dark splash already set)
- `www/` and `node_modules/` are generated — not committed

## Build & submit — on the Mac

One-time setup:
```bash
# 1. Xcode from the Mac App Store (free), open it once to accept the license
# 2. Node.js  — https://nodejs.org (LTS .pkg installer)  or  brew install node
# 3. CocoaPods — brew install cocoapods
```

Every build:
```bash
cd app
npm install          # first time only
npm run ios          # builds www, syncs into the Xcode project, opens Xcode
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities** → choose your **Team**
   (your Apple Developer account) and let Xcode manage signing.
2. Pick a real device or **Any iOS Device (arm64)** as the destination.
3. Test on your iPhone first (plug it in, press ▶).
4. **Product → Archive** → in the Organizer: **Distribute App → App Store Connect → Upload**.

Then finish the listing in App Store Connect — everything you need (name,
description, keywords, screenshots at `screenshots/phone-1…6.png`, privacy
answers) is in `../APPLE_APP_STORE.md`.

## Updating the app after site changes

```bash
cd app && npm run sync    # rebuild www + sync
```
Then bump the version in Xcode (App target → General → Version/Build),
re-archive, upload, and submit the new build for review.
