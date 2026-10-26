// The web's Mahjong online code (online.js + mahjong-room.js + mahjong-keys.js) in Node on the
// real relay: `host` opens a table and plays seat 0 and the computers; `join CODE` sits as a guest.
import { x25519 } from '@noble/curves/ed25519';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { writeFileSync } from 'node:fs';
const Q = new URL('../../game/qi/', import.meta.url).href;
const K = await import(Q + 'mahjong-keys.js?v=4');
await K.loadCrypto({ x25519, chacha20poly1305, hkdf, sha256 });
const { OnlineSession } = await import(Q + 'online.js?v=4');
const R = await import(Q + 'mahjong-room.js?v=4');
const M = await import(Q + 'mahjong.js?v=4');
const mem = {};
const s = new OnlineSession({ headers: { Origin: 'https://lifegameproject.com' }, storage: { get: (k) => mem[k] ?? null, set: (k, v) => { mem[k] = v; } } });
s.ext = R.mahjongExt; R.mahjongExt.reset(s);
s.mahjongLevel = 'normal';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [mode, code] = process.argv.slice(2);
if (mode === 'host') s.create('mahjong', 9, 0); else s.join(code);
while (!(s.info && s.seat != null)) await sleep(100);
console.log('CODE', s.code, 'seat', s.seat);
writeFileSync('code.txt', s.code);
if (mode === 'host') {
  while (Object.keys(s.info.seats).length < 2) await sleep(200);
  console.log('guest seated', JSON.stringify(s.info.seats));
  await sleep(1000);
  s.send('rematch');   // deal
}
let answered = -1, hands = 0;
const t0 = Date.now();
while (Date.now() - t0 < 600000) {
  await sleep(300);
  if (s.outbox.length || !s.record || !s.record.mj || !s.record.mj.dealt) continue;
  const seat = s.seat, r = s.record;
  const g = s.isHost ? R.table.hostGame(s) : R.view(r, seat, s.mahjongTiles);
  if (!g) continue;
  if (s.isHost && R.table.computerTurnDue(s)) { R.table.playComputerTurn(s); continue; }
  if (g.phase === 'turn' && g.turn === seat && g.hands[seat].every((x) => x >= 0)) {
    const step = M.aiTurn(g, 'normal');
    s.send('move', { move: M.stepCode(step) });
  } else if (g.phase === 'claims' && g.claimOptions(seat).length && answered !== g.steps.length) {
    answered = g.steps.length;
    s.send('move', { move: R.answerCode(M.aiClaim(g, seat, 'normal'), g.steps.length) });
  } else if (g.phase === 'over' && r.rematch[String(seat)] !== true) {
    hands++;
    console.log(`HAND ${r.round} OVER steps=${g.steps.length} winner=${g.result.winner ?? '-'} fans=${JSON.stringify(g.result.fans)} change=${JSON.stringify(g.result.change)} tilesKnown=${s.mahjongTiles.length} openView=${g.isOpenView}`);
    console.log('STEPS ' + g.steps.map(M.stepCode).join(' '));
    if (hands >= 2) { console.log('DONE'); await sleep(3000); process.exit(0); }
    s.send('rematch');
  }
}
