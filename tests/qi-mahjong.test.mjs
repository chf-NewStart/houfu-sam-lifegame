/* Mahjong on the web against the app: whole hands played by the computer in every seat, from
   nine walls at each level, must match the app's Swift engine and AI step for step (winner,
   fans, payments), and the walls must be the same. qi-mahjong-fixtures.txt is the output of
   the app's Qi/Engine/Mahjong.swift + MahjongAI.swift (MahjongAI.playOut) for these seeds.
   usage: node tests/qi-mahjong.test.mjs */
import { readFileSync } from 'node:fs';
import * as M from '../game/qi/mahjong.js';

const lines = [];
for (const seed of [1n, 2n, 3n, 5n, 12n, 16n, 99n, 12345n, 0xdeadbeefn]) {
  for (const level of ['easy', 'normal', 'hard']) {
    const g = M.playOut(new M.Game(M.wall(seed), Number(seed % 4n)), [level, level, level, level]);
    const r = g.result;
    lines.push(`${seed} ${level} ${g.steps.map(M.stepCode).join(' ')} | ${r && r.winner != null ? r.winner : '-'} ${r ? r.points : 0} ${r ? r.fans.join(',') : ''} ${r ? r.change.join(',') : ''}`);
  }
}
lines.push('wall3 ' + M.wall(3n).slice(0, 20).join(','));
const swift = readFileSync(new URL('./qi-mahjong-fixtures.txt', import.meta.url), 'utf8').trim().split('\n');
let bad = 0;
lines.forEach((l, i) => { if (l !== swift[i]) { bad++; console.log('FAIL line', i, '\n js:', l.slice(0, 200), '\n app:', (swift[i] || '').slice(0, 200)); } });
// Rules spot checks.
const c = M.counts(M.tiles('1112345678999m5m'));
if (!M.isWin(c, 0)) { bad++; console.log('FAIL 九莲 wins'); }
if (M.shanten(M.counts(M.tiles('1112345678999m')), 0) !== 0) { bad++; console.log('FAIL ready'); }
if (M.points(M.fans(M.tiles('1112345678999m5m'), [], true, false, false)) !== 6) { bad++; console.log('FAIL 6 fan'); }
console.log(bad ? `${bad} failures` : `all passed (${lines.length} hands and walls identical to the app)`);
process.exit(bad ? 1 : 0);
