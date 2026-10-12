// node wpshots.mjs <outDir> key:lv ...  → frames of each weapon's glyph attack
import { execFileSync } from 'node:child_process';
const [out, ...specs] = process.argv.slice(2), dir = new URL('.', import.meta.url).pathname;
for (const sp of specs) {
  const [key, lv] = sp.split(':');
  const steps = [['eval', 'Game.test.lv(3)'], ['wait', 6500], ['eval', `Game.test.arm('${key}',${lv})`], ['shots', Array.from({length: 30}, (_, i) => 40 + i*50), key + lv]];
  let r; try { r = execFileSync('node', [dir + 'fxshot.mjs', out, '0', JSON.stringify(steps)], { encoding: 'utf8' }); } catch (e) { r = e.stdout + e.stderr; }
  console.log(key + lv + ': ' + r.trim().split('\n').slice(-1)[0]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-pattern_type', 'glob', '-i', `${out}/${key}${lv}-*.jpg`, '-vf', 'crop=440:330:259:150,tile=6x5', '-frames:v', '1', `${out}/row-${key}${lv}.jpg`]);
}
