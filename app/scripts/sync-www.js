#!/usr/bin/env node
/* Builds app/www — the offline copy of the arcade that ships inside the native
   app. Copies the playable site from the repo root and skips web-only extras
   (store screenshots, demo GIFs, docs, the service worker — Capacitor serves
   local files, so no SW is needed and it can't register on capacitor:// anyway).
   The site uses root-absolute URLs (/game/..., /life.html); Capacitor serves
   www/ as the root, so no path rewriting is required. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');   // repo root
const OUT = path.resolve(__dirname, '..', 'www');

const COPY = [
  // files
  'index.html',
  'life.html',
  'privacy.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
  'gameicon.png',
  // directories (recursive)
  'game',
  'patterns',
  'training',
];

const SKIP_EXT = new Set(['.md', '.pdf']);          // docs & paper PDFs aren't part of the game
const SKIP_NAMES = new Set(['thumbs?nothing']);      // placeholder — everything else in COPY ships

function copyRec(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRec(path.join(src, name), path.join(dst, name));
    }
    return;
  }
  if (SKIP_EXT.has(path.extname(src).toLowerCase())) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let missing = [];
for (const item of COPY) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) { missing.push(item); continue; }
  copyRec(src, path.join(OUT, item));
}
if (missing.length) {
  console.error('MISSING (site layout changed? update COPY list):', missing.join(', '));
  process.exit(1);
}

// quick size report
let total = 0, files = 0;
(function walk(p) {
  for (const name of fs.readdirSync(p)) {
    const f = path.join(p, name);
    const st = fs.statSync(f);
    if (st.isDirectory()) walk(f);
    else { total += st.size; files++; }
  }
})(OUT);
console.log(`www built: ${files} files, ${(total / 1024 / 1024).toFixed(1)} MB`);
