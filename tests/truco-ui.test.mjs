import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../game/truco.html', import.meta.url), 'utf8');
const arcade = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Truco exposes a fixed two-human partnership mode', () => {
  assert.match(html, /2 PLAYERS vs 2 AI · TEAM UP/);
  assert.match(html, /new Set\(\[0, 2\]\)/);
  assert.match(html, /teams: \[0, 1, 0, 1\]/);
  assert.match(html, /isHumanSeat\(g\.turn\)/);
  assert.match(html, /function humanBid\(seat, b\)/);
  assert.match(html, /async function humanPlay\(seat, idx\)/);
  assert.match(html, /g\.playCard\(seat, card\);\s*renderAll\(\);\s*await trickBannerIfNeeded\(\)/);
});

test('card power and chronological play order remain visible at the table', () => {
  assert.match(html, /id="powerStrip"/);
  assert.match(html, /NORMAL_POWER = Object\.keys\(TrucoEngine\.STRENGTH\)/);
  assert.match(html, /\['C', 'H', 'S', 'D'\]/);
  assert.match(html, /class="play-order"/);
  assert.match(html, /PLAY ORDER 1 →/);
  assert.match(html, /trick-banner/);
});

test('round flow has a gated deal and indicator reveal before bidding', () => {
  assert.match(html, /dealState = \{ order, step, total, indicatorRevealed: false \}/);
  assert.match(html, /DEALING \$\{g\.handSize\} EACH/);
  assert.match(html, /dealState\.indicatorRevealed = true/);
  assert.match(html, /await sleep\(\(total - 1\) \* step/);
  assert.match(html, /if \(dealState\) return/);
});

test('cards use semantic controls, rich faces, and accessible labels', () => {
  assert.match(html, /const tag = opts\.clickable \? 'button' : 'div'/);
  assert.match(html, /class="card-corner"/);
  assert.match(html, /class="card-suit"/);
  assert.match(html, /aria-label="\$\{label\}"/);
  assert.match(html, /prefers-reduced-motion:reduce/);
});

test('CPU bid logging keeps the bidder before the engine advances turn', () => {
  assert.match(html, /const seat = g\.turn;\s*await sleep\(950\);\s*const b = g\.cpuBid\(seat\);\s*g\.setBid\(seat, b\);\s*logLine\(`\$\{seatName\(seat\)\} bids/);
});

test('arcade promotes Truco as a one-or-two-player hero cabinet', () => {
  assert.match(arcade, /class="card glow-truco star" data-players="12"/);
  assert.match(arcade, /card\.star\.glow-truco/);
  assert.match(arcade, /1–2 local players/);
  assert.match(arcade, /\/game\/truco\.html\?v=2/);
});
