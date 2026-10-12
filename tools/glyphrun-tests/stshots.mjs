// node stshots.mjs <outDir> charIdx:name[:weapon:lv] ... → dense frames of each character's strike
import { execFileSync } from 'node:child_process';
const [out, ...specs] = process.argv.slice(2), dir = new URL('.', import.meta.url).pathname;
for (const sp of specs) {
  const [ci, name, wk, wl] = sp.split(':');
  const steps = [['eval', 'Game.test.lv(3)'], ['wait', 6500]];
  steps.push(['eval', wk ? `Game.test.noStrike(true); Game.test.arm('${wk}',${wl})` : 'Game.test.arm(null)']);
  steps.push(['shots', Array.from({ length: 30 }, (_, i) => 40 + i * 50), name]);
  let r; try { r = execFileSync('node', [dir + 'fxshot.mjs', out, ci, JSON.stringify(steps)], { encoding: 'utf8' }); } catch (e) { r = e.stdout + e.stderr; }
  console.log(name + ': ' + r.trim().split('\n').slice(-1)[0]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-pattern_type', 'glob', '-i', `${out}/${name}-*.jpg`, '-vf', 'crop=440:330:259:150,tile=6x5', '-frames:v', '1', `${out}/sheet-${name}.jpg`]);
}
