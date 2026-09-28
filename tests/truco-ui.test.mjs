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
  assert.match(html, /function isLocalSeat\(s\)/);
  assert.match(html, /function humanBid\(seat, b\)/);
  assert.match(html, /async function humanPlay\(seat, idx\)/);
  assert.match(html, /g\.playCard\(seat, card\);[\s\S]{0,120}renderAll\(\);\s*await trickBannerIfNeeded\(\)/);
});

test('unlisted rooms support invite links, 2–4 humans, and AI-filled seats', () => {
  assert.match(html, /INVITE ROOM · 2–4 HUMANS/);
  assert.match(html, /function createOnlineRoom\(\)/);
  assert.match(html, /function joinOnlineRoom\(rawCode\)/);
  assert.match(html, /function startOnlineRoom\(\)/);
  assert.match(html, /function moveOnlineSeat\(target\)/);
  assert.match(html, /function replaceOfflineWithAI\(\)/);
  assert.match(html, /location\.pathname \+ '\?room='/);
  assert.match(html, /TrucoOnline\.lockRoster/);
  assert.match(html, /TrucoOnline\.TEAM_BY_SEAT/);
});

test('online play is host-authoritative and publishes per-seat views', () => {
  assert.match(html, /function buildOnlineView\(seat, revision\)/);
  assert.match(html, /TrucoOnline\.projectGame\(g, seat, \{ dealState \}\)/);
  assert.match(html, /online\.role !== 'host'/);
  assert.match(html, /sendOnlineIntent\(\{ type: 'bid'/);
  assert.match(html, /sendOnlineIntent\(\{ type: 'play', cardId:/);
  assert.match(html, /record\.token !== intent\.token/);
  assert.match(html, /Number\(intent\.expectedActionRev\) !== Number\(online\.actionRev\)/);
  assert.match(html, /g\.cardById\(seat/);
});

test('room writes preserve hidden-card placeholders and atomically handle cold-cache room edits', () => {
  assert.match(html, /updates\['views\/' \+ seat\] = JSON\.stringify\(buildOnlineView\(seat, revision\)\)/);
  assert.match(html, /if \(typeof view === 'string'\) \{[\s\S]{0,100}JSON\.parse\(view\)/);
  assert.match(html, /async function transactExistingRoom\(ref, baseline, mutate\)/);
  assert.match(html, /mutate\(current == null \? baseline : current\)/);
  assert.match(html, /TrucoOnline\.claimSeat\(current, online\.token, name/);
  assert.match(html, /transactExistingRoom\(online\.ref, baseline, fresh =>/);
});

test('online presence recovers and removed guests leave stale room state', () => {
  assert.match(html, /firebaseDatabase\.ref\('\.info\/connected'\)/);
  assert.match(html, /presenceRef\.onDisconnect\(\)\.remove\(\)[\s\S]{0,260}presenceRef\.set\(record\)/);
  assert.match(html, /if \(!online\.active \|\| online\.ref !== roomRef \|\| online\.token !== token\) return/);
  assert.match(html, /if \(nextSeat < 0 && online\.role === 'guest'\)/);
  assert.match(html, /function handleOnlineMembershipLost\(roomClosed\)/);
  assert.match(html, /role === 'host' \|\| wasWaiting/);
  assert.match(html, /role === 'host' && room\.status === 'locked'[\s\S]{0,120}closeOnlineRoomRef\(ref, room\)/);
  assert.match(html, /const tombstone = \{[\s\S]{0,220}status: 'closed'/);
  assert.match(html, /withTimeout\(ref\.set\(tombstone\)/);
  assert.match(html, /else await transactExistingRoom\(ref, roomSnapshot, current =>/);
  assert.match(html, /onDisconnect\(\)\.cancel\(\)[\s\S]{0,160}presenceRef\.remove\(\)/);
  assert.match(html, /online\.ref !== ref \|\| Number\(online\.session\) !== Number\(session\)/);
});

test('Firebase loads only when an online room is used', () => {
  assert.doesNotMatch(html, /<script[^>]+firebase-app-compat/);
  assert.match(html, /async function ensureFirebase\(\)/);
  assert.match(html, /firebase-app-compat\.js/);
  assert.match(html, /firebase-database-compat\.js/);
  assert.match(html, /Local play still works/);
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
  assert.match(html, /const seat = g\.turn;\s*await sleep\(950\);[\s\S]{0,220}const b = g\.cpuBid\(seat\);\s*g\.setBid\(seat, b\);[\s\S]{0,140}logLine\(`\$\{seatName\(seat\)\} bids/);
});

test('arcade promotes Truco as a one-to-four-player online hero cabinet', () => {
  assert.match(arcade, /class="card glow-truco star" data-players="1234"/);
  assert.match(arcade, /card\.star\.glow-truco/);
  assert.match(arcade, /2–4 online players/);
  assert.match(arcade, /1–4P · ONLINE/);
  assert.match(arcade, /up to three friends—four humans total/);
  assert.match(arcade, /\/game\/truco\.html\?v=3/);
});
