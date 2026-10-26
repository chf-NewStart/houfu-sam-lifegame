/* Who is likely to own each point of a Go board (the app's Qi/Engine/GoOwnership.swift), read
   from many quick random games played out from the position: both sides play random legal
   moves (never filling their own eyes) until neither can, and every point is counted for
   whoever holds it at the end. Averaged, safe groups and settled corners read clearly, stones
   that keep dying in the playouts read as dead, and open space stays unsure. The 3D board uses
   it for its animals' moods. Runs in the worker. */

/** Ownership per point (row-major), from −1 (White's for sure) to +1 (Black's for sure). */
export function estimate(board, size, toMove, playouts = 300) {
  let seed = 0x9e3779b9;
  for (const v of board) seed = Math.imul(seed ^ v, 0x01000193) >>> 0;
  const rng = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sim = new Playouts(size);
  sim.setUp(board);
  sim.save();
  const total = new Int32Array(size * size);
  for (let i = 0; i < playouts; i++) {
    sim.reset();
    sim.play(toMove, rng);
    sim.count(total);
  }
  return Array.from(total, (v) => v / playouts);
}

/* A board built for speed: a border of 3s around it, groups as linked rings of stones with a
   head, and pseudo-liberties kept as a count, a sum and a sum of squares of the liberty
   points, so a group in atari (all of them the same point) is known without a flood fill. */
class Playouts {
  constructor(size) {
    const w = size + 2, n = w * w;
    this.size = size; this.width = w; this.cells = n;
    this.step = [-1, 1, -w, w];
    this.ko = -1;
    const make = () => ({ color: new Int8Array(n).fill(3), head: new Int32Array(n).fill(-1), next: new Int32Array(n).fill(-1),
      stones: new Int32Array(n), libCount: new Int32Array(n), libSum: new Float64Array(n), libSumSq: new Float64Array(n),
      empties: new Int32Array(n), emptyAt: new Int32Array(n).fill(-1) });
    Object.assign(this, make());
    this.saved = make();
    this.emptyCount = 0;
  }

  padded(i) { return (Math.floor(i / this.size) + 1) * this.width + (i % this.size) + 1; }

  setUp(board) {
    this.emptyCount = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const p = (r + 1) * this.width + c + 1;
        this.color[p] = 0;
        this.emptyAt[p] = this.emptyCount;
        this.empties[this.emptyCount++] = p;
      }
    }
    board.forEach((v, i) => { if (v === 1 || v === 2) this.place(this.padded(i), v); });
    this.ko = -1;
  }

  save() {
    for (const k of ['color', 'head', 'next', 'stones', 'libCount', 'libSum', 'libSumSq', 'empties', 'emptyAt']) this.saved[k].set(this[k]);
    this.savedEmpty = this.emptyCount;
  }
  reset() {
    for (const k of ['color', 'head', 'next', 'stones', 'libCount', 'libSum', 'libSumSq', 'empties', 'emptyAt']) this[k].set(this.saved[k]);
    this.emptyCount = this.savedEmpty;
    this.ko = -1;
  }

  addLib(g, p) { this.libCount[g]++; this.libSum[g] += p; this.libSumSq[g] += p * p; }
  removeLib(g, p) { this.libCount[g]--; this.libSum[g] -= p; this.libSumSq[g] -= p * p; }
  inAtari(g) { const n = this.libCount[g]; return n > 0 && this.libSum[g] * this.libSum[g] === n * this.libSumSq[g]; }
  removeEmpty(p) {
    const i = this.emptyAt[p], last = this.empties[this.emptyCount - 1];
    this.empties[i] = last; this.emptyAt[last] = i; this.emptyAt[p] = -1;
    this.emptyCount--;
  }
  addEmpty(p) { this.empties[this.emptyCount] = p; this.emptyAt[p] = this.emptyCount; this.emptyCount++; }

  /** Puts a stone down, joins it to its friends and captures what it surrounds. */
  place(p, c) {
    const color = this.color, head = this.head, step = this.step;
    color[p] = c;
    this.removeEmpty(p);
    head[p] = p; this.next[p] = p; this.stones[p] = 1;
    this.libCount[p] = 0; this.libSum[p] = 0; this.libSumSq[p] = 0;
    for (let k = 0; k < 4; k++) {
      const q = p + step[k], cq = color[q];
      if (cq === 0) this.addLib(p, q); else if (cq !== 3) this.removeLib(head[q], p);
    }
    let g = p;
    for (let k = 0; k < 4; k++) { const q = p + step[k]; if (color[q] === c && head[q] !== g) g = this.merge(g, head[q]); }
    let captured = 0, at = -1;
    const opp = 3 - c;
    for (let k = 0; k < 4; k++) {
      const q = p + step[k];
      if (color[q] === opp && this.libCount[head[q]] === 0) { at = q; captured += this.removeGroup(head[q]); }
    }
    return [captured, at];
  }

  merge(a, b) {
    let big = a, small = b;
    if (this.stones[small] > this.stones[big]) { big = b; small = a; }
    let s = small;
    do { this.head[s] = big; s = this.next[s]; } while (s !== small);
    const t = this.next[big]; this.next[big] = this.next[small]; this.next[small] = t;
    this.stones[big] += this.stones[small];
    this.libCount[big] += this.libCount[small]; this.libSum[big] += this.libSum[small]; this.libSumSq[big] += this.libSumSq[small];
    return big;
  }

  removeGroup(g) {
    let n = 0, s = g;
    do { this.color[s] = 0; this.addEmpty(s); n++; s = this.next[s]; } while (s !== g);
    s = g;
    do {
      for (let k = 0; k < 4; k++) { const t = s + this.step[k]; if (this.color[t] === 1 || this.color[t] === 2) this.addLib(this.head[t], s); }
      s = this.next[s];
    } while (s !== g);
    return n;
  }

  isLegal(p, c) {
    if (p === this.ko) return false;
    const opp = 3 - c;
    for (let k = 0; k < 4; k++) {
      const q = p + this.step[k], cq = this.color[q];
      if (cq === 0) return true;
      if (cq === c && !this.inAtari(this.head[q])) return true;
      if (cq === opp && this.inAtari(this.head[q])) return true;
    }
    return false;
  }

  /** A point whose four neighbours are all `c` (or the edge), with at most one enemy on the
      diagonals (none at the edge): filling it would only hurt. */
  isEye(p, c) {
    for (let k = 0; k < 4; k++) { const cq = this.color[p + this.step[k]]; if (cq !== c && cq !== 3) return false; }
    let enemies = 0, edge = false;
    const w = this.width;
    for (const d of [p - w - 1, p - w + 1, p + w - 1, p + w + 1]) {
      if (this.color[d] === 3) edge = true; else if (this.color[d] === 3 - c) enemies++;
    }
    return edge ? enemies === 0 : enemies <= 1;
  }

  play(start, rng) {
    let toMove = start === 2 ? 2 : 1, passes = 0, moves = 0;
    const limit = this.size * this.size * 3;
    while (passes < 2 && moves < limit) {
      let chosen = -1, k = this.emptyCount;
      while (k > 0) {
        const i = Math.floor(rng() * k), p = this.empties[i];
        if (!this.isEye(p, toMove) && this.isLegal(p, toMove)) { chosen = p; break; }
        const j = k - 1, q = this.empties[j];
        this.empties[i] = q; this.emptyAt[q] = i;
        this.empties[j] = p; this.emptyAt[p] = j;
        k--;
      }
      if (chosen < 0) { passes++; this.ko = -1; }
      else {
        passes = 0;
        const [captured, at] = this.place(chosen, toMove);
        const g = this.head[chosen];
        this.ko = captured === 1 && this.stones[g] === 1 && this.libCount[g] === 1 ? at : -1;
      }
      toMove = 3 - toMove;
      moves++;
    }
  }

  count(total) {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const p = (r + 1) * this.width + c + 1;
        let v = this.color[p];
        if (v === 0) {
          let owner = 0;
          for (let k = 0; k < 4; k++) {
            const cq = this.color[p + this.step[k]];
            if (cq === 3) continue;
            if (cq === 0 || (owner !== 0 && owner !== cq)) { owner = -1; break; }
            owner = cq;
          }
          v = owner > 0 ? owner : 0;
        }
        if (v === 1) total[r * this.size + c]++; else if (v === 2) total[r * this.size + c]--;
      }
    }
  }
}
