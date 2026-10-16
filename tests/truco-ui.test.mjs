import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../game/truco.html', import.meta.url), 'utf8');
const arcade = readFileSync(new URL('../arcade.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

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

test('online rooms run on the relay with the shared room contract', () => {
  assert.match(html, /PLAY ONLINE · 2–4 PEOPLE/);
  assert.match(html, /function createOnlineRoom\(\)/);
  assert.match(html, /function joinOnlineRoom\(rawCode\)/);
  assert.match(html, /function startOnlineRoom\(\)/);
  assert.match(html, /function sitAt\(seat\)/);
  assert.match(html, /wss:\/\/lifegame-relay\./);
  assert.match(html, /'\/room\/' \+ encodeURIComponent\(online\.code\) \+ '\?id=' \+ encodeURIComponent\(online\.pid\)/);
  assert.match(html, /location\.pathname \+ roomQuery\(online\.code\)/);
  assert.match(html, /O\.startMatch\(online\.room/);
  assert.match(html, /O\.reconcile\(online\.room, O\.joinsOf\(online\.map\)\)/);
  assert.doesNotMatch(html, /firebase/i, 'no Google hosts: they are unreachable from mainland China');
});

test('online rooms play in teams of two or every player for themselves, as the host picks', () => {
  assert.match(html, /function setOnlinePartners\(on\)/);
  assert.match(html, /O\.setPartners\(online\.room, on\)/);
  assert.match(html, /O\.newRoom\(online\.pid, online\.avatar, now, undefined, savedPartners\(\)\)/);
  assert.match(html, /TrucoEngine\.newGame\(4, undefined, O\.hasPartners\(online\.room\) \? \{ teams: O\.TEAM_BY_SEAT \} : undefined\)/);
  assert.match(html, /TEAMS 2V2/);
  assert.match(html, /FREE-FOR-ALL/);
  assert.match(html, /WAITING FOR A FRIEND TO JOIN/);
  assert.doesNotMatch(html, /'PERSON' : 'PEOPLE'/, 'alone, the deal button waits instead of offering 1 person + 3 AI');
  assert.match(html, /\/game\/truco-online\.js\?v=4/, 'returning browsers fetch the new contract');
  assert.match(sw, /'\/game\/truco-online\.js\?v=4'/);
});

test('cards and guesses are picked, then confirmed; guesses can be locked in early; the hand fits and sorts', () => {
  assert.match(html, /function tapCard\(seat, idx\)/);
  assert.match(html, /function playSelected\(\)/);
  assert.match(html, /function pickGuess\(seat, count\)/);
  assert.match(html, /function confirmGuess\(seat\)/);
  assert.match(html, /function sendLockedGuess\(\)/);
  assert.match(html, /LOCK IN \$\{choice\.count\}/);
  assert.doesNotMatch(html, /b === Math\.floor\(g\.handSize \/ 2\) \? 'primary'/, 'no number is pre-highlighted');
  assert.doesNotMatch(html, /'s guess — how many/, 'no "You\'s guess"');
  assert.match(html, /function fitHand\(\)/);
  assert.match(html, /function handOrder\(hand\)/);
  assert.doesNotMatch(html, /\.card-row\.human-hand \{[^}]*overflow-x: auto/, 'the hand no longer scrolls sideways');
  assert.match(html, /id="indChip"/);
  assert.doesNotMatch(html, /id="indicatorCard"/, 'the indicator is no longer in the middle of the table');
  assert.match(html, /const lastShown = showingTrickResult/);
});

test('players are avatars and seat numbers, never typed names', () => {
  assert.match(html, /function avatarPickerHtml\(\)/);
  assert.match(html, /O\.AVATARS/);
  assert.doesNotMatch(html, /id="onlineName"/);
  assert.doesNotMatch(html, /your name/);
});

test('the host publishes the engine state and checks intents; guests send intents', () => {
  assert.match(html, /function maybePublish\(\)/);
  assert.match(html, /O\.gameRecord\(online\.room, g, online\.record\)/);
  assert.match(html, /O\.checkIntent\(online\.room, online\.record, seat, intent, g\)/);
  assert.match(html, /sendOnlineIntent\(\{ type: 'guess', count: b \}\)/);
  assert.match(html, /sendOnlineIntent\(\{ type: 'play', card: TrucoEngine\.cardId\(card\) \}\)/);
  assert.match(html, /TrucoEngine\.restoreGame\(rec\.state\)/);
});

test('a dropped host is replaced, away players are never moved for automatically, and leaving hands the room on', () => {
  assert.match(html, /O\.successor\(room, \[\.\.\.online\.live, online\.pid\]\) !== seat/);
  assert.match(html, /writeRoom\(O\.takeOver\(room, seat\)\)/);
  assert.match(html, /now - since >= O\.AWAY_GRACE/);
  const checkAway = html.slice(html.indexOf('function checkAway('), html.indexOf('function playForAway('));
  assert.doesNotMatch(checkAway, /setBid|playCard/, 'checkAway only offers the host a button');
  assert.match(html, /LET THE COMPUTER PLAY THIS TURN/);
  assert.match(html, /O\.handOver\(online\.room, others\)/);
  assert.match(html, /writeKey\(O\.KEYS\.join\(online\.pid\), null\)/);
  assert.match(html, /function roomClosed\(\)[\s\S]{0,600}Math\.pow\(2, online\.attempts\)/);
});

test('the game says guess, never bid', () => {
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, s => s.replace(/\.bids?\b|\b(setBid|cpuBid|teamBids|humanBid|bidn)\b/g, ''));
  assert.doesNotMatch(visible, /\bbids?\b/i);
  assert.doesNotMatch(visible, /叫牌|叫 /);
  assert.match(html, /guesses \$\{b\}/);
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
  assert.match(html, /dealState = \{ order: plan\.order, step, total, indicatorRevealed: false \}/);
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

test('CPU guess logging keeps the guesser before the engine advances turn', () => {
  assert.match(html, /const seat = g\.turn;\s*await sleep\(950\);[\s\S]{0,220}const b = g\.cpuBid\(seat\);\s*g\.setBid\(seat, b\);[\s\S]{0,140}logLine\(`\$\{seatName\(seat\)\} guesses/);
});

test('arcade promotes Truco as a one-to-four-player online hero cabinet', () => {
  assert.match(arcade, /class="card glow-truco star" data-players="1234"/);
  assert.match(arcade, /card\.star\.glow-truco/);
  assert.match(arcade, /2–4 online players/);
  assert.match(arcade, /1–4P · ONLINE/);
  assert.match(arcade, /up to three friends—four humans total/);
  assert.match(arcade, /\/game\/truco\.html\?v=4/);
});
