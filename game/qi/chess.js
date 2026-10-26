/* Chess for Qi: the rules (castling, en passant, promotion, check, mate, stalemate, the
   automatic draws), SAN, the computer opponent and the coach. A port of the app's
   Qi/Engine/Chess.swift and ChessAI.swift; tests/qi-chess.test.mjs checks the move
   generator with perft and replays games.
   Squares: index row * 8 + col, row 0 = rank 8 (Black's back rank), col 0 = the a-file.
   Pieces: 0 empty, +1…+6 white pawn, knight, bishop, rook, queen, king; −1…−6 black.
   Sides: 1 White (moves first), 2 Black, matching the other games' "1 moves first". */

export const WHITE = 1, BLACK = 2;
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const FILES = 'abcdefgh';
/** Centipawns by piece kind. */
export const VALUES = [0, 100, 320, 330, 500, 900, 20000];
const LETTERS = ' ' + ' NBRQK';
const PROMO_LETTERS = '  nbrq ';

export function other(side) { return side === WHITE ? BLACK : WHITE; }
export function sign(side) { return side === WHITE ? 1 : -1; }
export function sideOf(piece) { return piece > 0 ? WHITE : BLACK; }
export function squareName(sq) { return FILES[sq & 7] + (8 - (sq >> 3)); }
export function square(file, rank) {
  const f = FILES.indexOf(file), r = Number(rank);
  if (f < 0 || !(r >= 1 && r <= 8)) return null;
  return (8 - r) * 8 + f;
}
/** Dark squares are the ones where row + col is odd (a1 is dark). */
export function isDark(sq) { return (((sq >> 3) + (sq & 7)) & 1) === 1; }

function targets(offsets) {
  const out = [];
  for (let sq = 0; sq < 64; sq++) {
    const list = [];
    for (const [dr, dc] of offsets) {
      const r = (sq >> 3) + dr, c = (sq & 7) + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) list.push(r * 8 + c);
    }
    out.push(list);
  }
  return out;
}
const KNIGHT_TARGETS = targets([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
const KING_TARGETS = targets([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
/** Rays from every square: directions 0…3 are a rook's, 4…7 a bishop's. */
const RAYS = [];
for (let sq = 0; sq < 64; sq++) {
  RAYS.push([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dr, dc]) => {
    const out = [];
    let r = (sq >> 3) + dr, c = (sq & 7) + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) { out.push(r * 8 + c); r += dr; c += dc; }
    return out;
  }));
}

/** Castling rights left after a move touches a square: bits 1 White O-O, 2 White O-O-O,
    4 Black O-O, 8 Black O-O-O. */
const CASTLE_MASK = [];
for (let sq = 0; sq < 64; sq++) {
  CASTLE_MASK.push(sq === 56 ? 15 & ~2 : sq === 63 ? 15 & ~1 : sq === 60 ? 15 & ~3
    : sq === 0 ? 15 & ~8 : sq === 7 ? 15 & ~4 : sq === 4 ? 15 & ~12 : 15);
}

// Zobrist keys (SplitMix64 from the app's fixed seed), kept as two 32-bit halves.
const Z_HI = new Int32Array(12 * 64 + 16 + 8 + 1), Z_LO = new Int32Array(Z_HI.length);
{
  const M = (1n << 64n) - 1n;
  let state = 0x516fc4e29da3b107n;
  for (let i = 0; i < Z_HI.length; i++) {
    state = (state + 0x9E3779B97F4A7C15n) & M;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M;
    z = z ^ (z >> 31n);
    Z_HI[i] = Number((z >> 32n) & 0xffffffffn) | 0;
    Z_LO[i] = Number(z & 0xffffffffn) | 0;
  }
}
function zPiece(p, sq) { return (p > 0 ? p - 1 : -p + 5) * 64 + sq; }
const Z_CASTLE = 768, Z_EP = 784, Z_SIDE = 792;

/** A move: from and to squares, and the piece a pawn promotes to (0 for none). */
export function mv(from, to, promo = 0) { return { from, to, promo }; }
export function sameMove(a, b) { return !!a && !!b && a.from === b.from && a.to === b.to && a.promo === b.promo; }
/** Long algebraic as UCI writes it: "e2e4", "e7e8q". Online rooms send moves like this. */
export function uci(m) { return squareName(m.from) + squareName(m.to) + (m.promo > 0 ? PROMO_LETTERS[m.promo] : ''); }
export function parseUci(text) {
  const ch = String(text).toLowerCase();
  if (ch.length !== 4 && ch.length !== 5) return null;
  const f = square(ch[0], ch[1]), t = square(ch[2], ch[3]);
  if (f == null || t == null) return null;
  let promo = 0;
  if (ch.length === 5) {
    const i = PROMO_LETTERS.indexOf(ch[4]);
    if (i < 2 || i > 5) return null;
    promo = i;
  }
  return mv(f, t, promo);
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** One position: the board, whose move it is, castling rights, the en-passant square,
    the move clocks, and an incrementally updated Zobrist hash. */
export class Position {
  static fromFEN(fen) {
    const parts = String(fen).split(' ').filter(Boolean);
    if (parts.length < 4) return null;
    const board = new Int8Array(64);
    const rows = parts[0].split('/');
    if (rows.length !== 8) return null;
    const kings = [-1, -1, -1];
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { c += Number(ch); continue; }
        const kind = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1;
        if (c >= 8 || kind === 0) return null;
        const piece = ch === ch.toUpperCase() ? kind : -kind;
        board[r * 8 + c] = piece;
        if (kind === KING) {
          if (kings[sideOf(piece)] !== -1) return null;
          kings[sideOf(piece)] = r * 8 + c;
        }
        c++;
      }
      if (c !== 8) return null;
    }
    if (kings[1] < 0 || kings[2] < 0 || (parts[1] !== 'w' && parts[1] !== 'b')) return null;
    const p = new Position();
    p.board = board;
    p.side = parts[1] === 'w' ? WHITE : BLACK;
    let rights = 0;
    for (const ch of parts[2]) rights |= ({ K: 1, Q: 2, k: 4, q: 8 })[ch] || 0;
    p.castling = rights;
    p.ep = -1;
    if (parts[3] !== '-') {
      const sq = square(parts[3][0], parts[3][1]);
      if (sq == null) return null;
      p.ep = sq;
    }
    p.halfmove = parts.length > 4 ? Number(parts[4]) || 0 : 0;
    p.fullmove = parts.length > 5 ? Number(parts[5]) || 1 : 1;
    p.kingSquare = kings;
    if (p.ep >= 0 && !p.epCapturable(p.ep)) p.ep = -1;
    p.computeHash();
    return p;
  }

  clone() {
    const p = new Position();
    p.board = this.board.slice();
    p.side = this.side;
    p.castling = this.castling;
    p.ep = this.ep;
    p.halfmove = this.halfmove;
    p.fullmove = this.fullmove;
    p.kingSquare = this.kingSquare.slice();
    p.hashHi = this.hashHi;
    p.hashLo = this.hashLo;
    return p;
  }

  get hashKey() { return this.hashHi + ':' + this.hashLo; }

  get fen() {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let row = '', empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = this.board[r * 8 + c];
        if (p === 0) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        const ch = 'pnbrqk'[Math.abs(p) - 1];
        row += p > 0 ? ch.toUpperCase() : ch;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let rights = '';
    if (this.castling & 1) rights += 'K';
    if (this.castling & 2) rights += 'Q';
    if (this.castling & 4) rights += 'k';
    if (this.castling & 8) rights += 'q';
    return `${rows.join('/')} ${this.side === WHITE ? 'w' : 'b'} ${rights || '-'} ${this.ep >= 0 ? squareName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  computeHash() {
    let hi = 0, lo = 0;
    for (let sq = 0; sq < 64; sq++) {
      if (this.board[sq] !== 0) { const z = zPiece(this.board[sq], sq); hi ^= Z_HI[z]; lo ^= Z_LO[z]; }
    }
    hi ^= Z_HI[Z_CASTLE + this.castling]; lo ^= Z_LO[Z_CASTLE + this.castling];
    if (this.ep >= 0) { hi ^= Z_HI[Z_EP + (this.ep & 7)]; lo ^= Z_LO[Z_EP + (this.ep & 7)]; }
    if (this.side === BLACK) { hi ^= Z_HI[Z_SIDE]; lo ^= Z_LO[Z_SIDE]; }
    this.hashHi = hi;
    this.hashLo = lo;
  }

  /** True when a pawn of the side to move stands beside the pawn that skipped `target`. */
  epCapturable(target) {
    const pawnSquare = target + (this.side === WHITE ? 8 : -8);
    if (pawnSquare < 0 || pawnSquare >= 64) return false;
    const mine = PAWN * sign(this.side);
    const c = pawnSquare & 7;
    return (c > 0 && this.board[pawnSquare - 1] === mine) || (c < 7 && this.board[pawnSquare + 1] === mine);
  }

  get inCheck() { return this.attacked(this.kingSquare[this.side], other(this.side)); }

  /** Is `sq` attacked by any piece of `attacker`? */
  attacked(sq, attacker) {
    const b = this.board;
    const s = sign(attacker);
    const r = sq >> 3, c = sq & 7;
    if (attacker === WHITE) {
      if (r < 7) {
        if (c > 0 && b[sq + 7] === PAWN) return true;
        if (c < 7 && b[sq + 9] === PAWN) return true;
      }
    } else if (r > 0) {
      if (c > 0 && b[sq - 9] === -PAWN) return true;
      if (c < 7 && b[sq - 7] === -PAWN) return true;
    }
    const n = KNIGHT * s, k = KING * s;
    for (const t of KNIGHT_TARGETS[sq]) if (b[t] === n) return true;
    for (const t of KING_TARGETS[sq]) if (b[t] === k) return true;
    const straight = ROOK * s, diagonal = BISHOP * s, q = QUEEN * s;
    const rays = RAYS[sq];
    for (let d = 0; d < 8; d++) {
      const slider = d < 4 ? straight : diagonal;
      for (const t of rays[d]) {
        const p = b[t];
        if (p === 0) continue;
        if (p === slider || p === q) return true;
        break;
      }
    }
    return false;
  }

  /** Kinds of `attacker`'s pieces that hit `sq` directly (no x-rays), for the coach. */
  attackers(sq, attacker) {
    const out = [];
    const b = this.board;
    const s = sign(attacker);
    const r = sq >> 3, c = sq & 7;
    if (attacker === WHITE && r < 7) {
      if (c > 0 && b[sq + 7] === PAWN) out.push(PAWN);
      if (c < 7 && b[sq + 9] === PAWN) out.push(PAWN);
    } else if (attacker === BLACK && r > 0) {
      if (c > 0 && b[sq - 9] === -PAWN) out.push(PAWN);
      if (c < 7 && b[sq - 7] === -PAWN) out.push(PAWN);
    }
    for (const t of KNIGHT_TARGETS[sq]) if (b[t] === KNIGHT * s) out.push(KNIGHT);
    for (const t of KING_TARGETS[sq]) if (b[t] === KING * s) out.push(KING);
    const rays = RAYS[sq];
    for (let d = 0; d < 8; d++) {
      for (const t of rays[d]) {
        const p = b[t];
        if (p === 0) continue;
        if (p * s > 0) {
          const kind = p * s;
          if (kind === QUEEN || kind === (d < 4 ? ROOK : BISHOP)) out.push(kind);
        }
        break;
      }
    }
    return out;
  }

  /** Moves that follow the pieces' rules, before checking whether they leave the king in
      check. `capturesOnly` (the search's quiet-position check) keeps captures and queen
      promotions. */
  pseudoMoves(capturesOnly, out) {
    const b = this.board;
    const s = sign(this.side);
    const forward = this.side === WHITE ? -8 : 8;
    const startRow = this.side === WHITE ? 6 : 1;
    const lastRow = this.side === WHITE ? 0 : 7;
    const ep = this.ep;
    const addPawn = (from, to) => {
      if (to >> 3 === lastRow) {
        out.push(mv(from, to, QUEEN));
        if (!capturesOnly) {
          out.push(mv(from, to, KNIGHT));
          out.push(mv(from, to, ROOK));
          out.push(mv(from, to, BISHOP));
        }
      } else {
        out.push(mv(from, to));
      }
    };
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (p === 0 || (p > 0) !== (s > 0)) continue;
      const kind = p * s;
      if (kind === PAWN) {
        const r = sq >> 3, c = sq & 7;
        const one = sq + forward;
        if (b[one] === 0 && (!capturesOnly || one >> 3 === lastRow)) {
          addPawn(sq, one);
          if (!capturesOnly && r === startRow && b[one + forward] === 0) out.push(mv(sq, one + forward));
        }
        for (const dc of [-1, 1]) {
          if (c + dc < 0 || c + dc >= 8) continue;
          const t = one + dc;
          if ((b[t] !== 0 && (b[t] > 0) !== (s > 0)) || t === ep) addPawn(sq, t);
        }
      } else if (kind === KNIGHT || kind === KING) {
        for (const t of (kind === KNIGHT ? KNIGHT_TARGETS : KING_TARGETS)[sq]) {
          const q = b[t];
          if (q === 0 ? !capturesOnly : (q > 0) !== (s > 0)) out.push(mv(sq, t));
        }
        if (kind === KING && !capturesOnly) this.addCastling(sq, out);
      } else {
        const d0 = kind === BISHOP ? 4 : 0, d1 = kind === ROOK ? 4 : 8;
        const rays = RAYS[sq];
        for (let d = d0; d < d1; d++) {
          for (const t of rays[d]) {
            const q = b[t];
            if (q === 0) {
              if (!capturesOnly) out.push(mv(sq, t));
              continue;
            }
            if ((q > 0) !== (s > 0)) out.push(mv(sq, t));
            break;
          }
        }
      }
    }
  }

  addCastling(kingSq, out) {
    const b = this.board;
    const them = other(this.side);
    if (this.side === WHITE) {
      if (kingSq !== 60) return;
      if ((this.castling & 1) && b[61] === 0 && b[62] === 0 && b[63] === ROOK &&
          !this.attacked(60, them) && !this.attacked(61, them) && !this.attacked(62, them)) out.push(mv(60, 62));
      if ((this.castling & 2) && b[59] === 0 && b[58] === 0 && b[57] === 0 && b[56] === ROOK &&
          !this.attacked(60, them) && !this.attacked(59, them) && !this.attacked(58, them)) out.push(mv(60, 58));
    } else {
      if (kingSq !== 4) return;
      if ((this.castling & 4) && b[5] === 0 && b[6] === 0 && b[7] === -ROOK &&
          !this.attacked(4, them) && !this.attacked(5, them) && !this.attacked(6, them)) out.push(mv(4, 6));
      if ((this.castling & 8) && b[3] === 0 && b[2] === 0 && b[1] === 0 && b[0] === -ROOK &&
          !this.attacked(4, them) && !this.attacked(3, them) && !this.attacked(2, them)) out.push(mv(4, 2));
    }
  }

  /** Plays a move that follows the pieces' rules (legal or not: the caller checks the king). */
  make(m) {
    const b = this.board;
    const piece = b[m.from];
    const kind = Math.abs(piece);
    const s = sign(this.side);
    let capturedSquare = m.to;
    let captured = b[m.to];
    if (kind === PAWN && m.to === this.ep && captured === 0) {
      capturedSquare = m.to + (this.side === WHITE ? 8 : -8);
      captured = b[capturedSquare];
    }
    const undo = { moved: piece, captured, capturedSquare, castling: this.castling, ep: this.ep,
      halfmove: this.halfmove, hashHi: this.hashHi, hashLo: this.hashLo };
    let hi = this.hashHi, lo = this.hashLo, z;
    if (captured !== 0) {
      b[capturedSquare] = 0;
      z = zPiece(captured, capturedSquare); hi ^= Z_HI[z]; lo ^= Z_LO[z];
    }
    z = zPiece(piece, m.from); hi ^= Z_HI[z]; lo ^= Z_LO[z];
    b[m.from] = 0;
    const placed = m.promo !== 0 ? m.promo * s : piece;
    b[m.to] = placed;
    z = zPiece(placed, m.to); hi ^= Z_HI[z]; lo ^= Z_LO[z];
    if (kind === KING) {
      this.kingSquare[this.side] = m.to;
      let rf = -1, rt = -1;
      if (m.to - m.from === 2) { rf = m.to + 1; rt = m.to - 1; } else if (m.from - m.to === 2) { rf = m.to - 2; rt = m.to + 1; }
      if (rf >= 0) {
        const rook = b[rf];
        b[rf] = 0;
        b[rt] = rook;
        z = zPiece(rook, rf); hi ^= Z_HI[z]; lo ^= Z_LO[z];
        z = zPiece(rook, rt); hi ^= Z_HI[z]; lo ^= Z_LO[z];
      }
    }
    const rights = this.castling & CASTLE_MASK[m.from] & CASTLE_MASK[m.to];
    if (rights !== this.castling) {
      hi ^= Z_HI[Z_CASTLE + this.castling] ^ Z_HI[Z_CASTLE + rights];
      lo ^= Z_LO[Z_CASTLE + this.castling] ^ Z_LO[Z_CASTLE + rights];
      this.castling = rights;
    }
    if (this.ep >= 0) { hi ^= Z_HI[Z_EP + (this.ep & 7)]; lo ^= Z_LO[Z_EP + (this.ep & 7)]; }
    this.ep = -1;
    this.halfmove = (kind === PAWN || captured !== 0) ? 0 : this.halfmove + 1;
    if (this.side === BLACK) this.fullmove++;
    this.side = other(this.side);
    hi ^= Z_HI[Z_SIDE]; lo ^= Z_LO[Z_SIDE];
    if (kind === PAWN && Math.abs(m.to - m.from) === 16) {
      const target = (m.from + m.to) / 2;
      if (this.epCapturable(target)) { this.ep = target; hi ^= Z_HI[Z_EP + (target & 7)]; lo ^= Z_LO[Z_EP + (target & 7)]; }
    }
    this.hashHi = hi;
    this.hashLo = lo;
    return undo;
  }

  unmake(m, u) {
    const b = this.board;
    this.side = other(this.side);
    if (this.side === BLACK) this.fullmove--;
    b[m.from] = u.moved;
    b[m.to] = 0;
    if (u.captured !== 0) b[u.capturedSquare] = u.captured;
    if (Math.abs(u.moved) === KING) {
      this.kingSquare[this.side] = m.from;
      if (m.to - m.from === 2) { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = 0; }
      else if (m.from - m.to === 2) { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = 0; }
    }
    this.castling = u.castling;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    this.hashHi = u.hashHi;
    this.hashLo = u.hashLo;
  }

  /** Every legal move for the side to move. */
  legalMoves() {
    const pseudo = [];
    this.pseudoMoves(false, pseudo);
    const me = this.side;
    const out = [];
    for (const m of pseudo) {
      const u = this.make(m);
      if (!this.attacked(this.kingSquare[me], this.side)) out.push(m);
      this.unmake(m, u);
    }
    return out;
  }

  /** Leaf count at `depth` (the standard move-generator check). */
  perft(depth) {
    if (depth <= 0) return 1;
    const moves = this.legalMoves();
    if (depth === 1) return moves.length;
    let total = 0;
    for (const m of moves) {
      const u = this.make(m);
      total += this.perft(depth - 1);
      this.unmake(m, u);
    }
    return total;
  }

  /** Neither side can ever mate: kings alone, one minor piece, or bishops all on one colour. */
  get insufficientMaterial() {
    const minors = [];
    for (let sq = 0; sq < 64; sq++) {
      const kind = Math.abs(this.board[sq]);
      if (kind === 0 || kind === KING) continue;
      if (kind === KNIGHT || kind === BISHOP) minors.push({ kind, dark: isDark(sq) });
      else return false;
    }
    if (minors.length <= 1) return true;
    return minors.every((m) => m.kind === BISHOP && m.dark === minors[0].dark);
  }

  /** Standard Algebraic Notation for a legal move: "Nf3", "exd5", "O-O", "e8=Q+", "Qh7#". */
  san(m, legal) {
    const piece = this.board[m.from];
    const kind = Math.abs(piece);
    let out;
    if (kind === KING && Math.abs(m.to - m.from) === 2) {
      out = m.to > m.from ? 'O-O' : 'O-O-O';
    } else if (kind === PAWN) {
      const capture = (m.from & 7) !== (m.to & 7);
      out = capture ? FILES[m.from & 7] + 'x' + squareName(m.to) : squareName(m.to);
      if (m.promo) out += '=' + LETTERS[m.promo];
    } else {
      out = LETTERS[kind];
      const rivals = legal.filter((o) => o.to === m.to && o.from !== m.from && this.board[o.from] === piece);
      if (rivals.length) {
        const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7));
        const sameRank = rivals.some((o) => (o.from >> 3) === (m.from >> 3));
        if (!sameFile) out += FILES[m.from & 7];
        else if (!sameRank) out += 8 - (m.from >> 3);
        else out += squareName(m.from);
      }
      if (this.board[m.to] !== 0) out += 'x';
      out += squareName(m.to);
    }
    const after = this.clone();
    after.make(m);
    if (after.inCheck) out += after.legalMoves().length ? '+' : '#';
    return out;
  }
}

export const START = Position.fromFEN(START_FEN);

/** A game: the position, the moves so far (with SAN), captured pieces and how it ended. */
export class ChessGame {
  constructor(position) {
    this.position = (position || START).clone();
    this.moves = [];
    this.san = [];
    this.hashes = [this.position.hashKey];
    this.legal = this.position.legalMoves();
    /** Piece kinds each side has taken (index 1 White's catches, 2 Black's). */
    this.taken = [[], [], []];
    /** {winner: 1 White, 2 Black, 0 a draw; reason}. */
    this.result = null;
    this.checkEnd();
  }

  clone() {
    const g = Object.create(ChessGame.prototype);
    g.position = this.position.clone();
    g.moves = this.moves.slice();
    g.san = this.san.slice();
    g.hashes = this.hashes.slice();
    g.legal = this.legal.slice();
    g.taken = this.taken.map((t) => t.slice());
    g.result = this.result ? { ...this.result } : null;
    return g;
  }

  get current() { return this.position.side; }
  get isOver() { return this.result != null; }
  get inCheck() { return this.position.inCheck; }
  get lastMove() { return this.moves[this.moves.length - 1] || null; }
  get board() { return this.position.board; }

  movesFrom(sq) { return this.legal.filter((m) => m.from === sq); }
  isLegal(m) { return this.legal.some((l) => sameMove(l, m)); }

  /** Material balance in pawns, from White's side. */
  get materialBalance() {
    let total = 0;
    for (const p of this.position.board) {
      if (p !== 0 && Math.abs(p) !== KING) total += (p > 0 ? 1 : -1) * [0, 1, 3, 3, 5, 9, 0][Math.abs(p)];
    }
    return total;
  }

  /** Plays a legal move; returns what it captured (0 for nothing), or null if it isn't legal. */
  play(m) {
    if (this.result || !this.isLegal(m)) return null;
    const mover = this.position.side;
    const notation = this.position.san(m, this.legal);
    const undo = this.position.make(m);
    this.moves.push(mv(m.from, m.to, m.promo));
    this.san.push(notation);
    this.hashes.push(this.position.hashKey);
    if (undo.captured !== 0) this.taken[mover].push(Math.abs(undo.captured));
    this.legal = this.position.legalMoves();
    this.checkEnd();
    return Math.abs(undo.captured);
  }

  resign(side) {
    if (this.result || (side !== WHITE && side !== BLACK)) return;
    this.result = { winner: other(side), reason: 'resign' };
  }

  agreeDraw() {
    if (this.result) return;
    this.result = { winner: 0, reason: 'agreement' };
  }

  checkEnd() {
    const pos = this.position;
    if (!this.legal.length) {
      this.result = pos.inCheck ? { winner: other(pos.side), reason: 'checkmate' } : { winner: 0, reason: 'stalemate' };
    } else if (pos.halfmove >= 100) {
      this.result = { winner: 0, reason: 'fiftyMoves' };
    } else if (this.hashes.filter((h) => h === pos.hashKey).length >= 3) {
      this.result = { winner: 0, reason: 'repetition' };
    } else if (pos.insufficientMaterial) {
      this.result = { winner: 0, reason: 'material' };
    }
  }

  /** Rebuilds a game from UCI moves (undo and online rooms); null if any move is illegal. */
  static replay(list) {
    const game = new ChessGame();
    for (const text of list) {
      const m = parseUci(text);
      if (!m || game.play(m) == null) return null;
    }
    return game;
  }
}

// ── The computer opponent ─────────────────────────────────────────────────────

/* Alpha-beta search with iterative deepening, a transposition table, a capture search at
   the leaves and the "simplified evaluation" piece-square tables. Easy looks one move
   ahead and picks loosely among the good moves; Normal searches about three moves deep,
   Hard up to six (both stop when their time is up). */
export const LEVELS = {
  easy: { maxDepth: 1, seconds: 0.3, margin: 120 },
  normal: { maxDepth: 3, seconds: 0.8, margin: 12 },
  hard: { maxDepth: 6, seconds: 2.0, margin: 0 },
};

/** The computer's move, or null when the game is over. */
export function chooseMove(game, level, seconds, random = Math.random) {
  if (game.isOver || !game.legal.length) return null;
  const L = LEVELS[level] || LEVELS.normal;
  // Easy now and then settles for a clearly worse move, the way a beginner does.
  const margin = level === 'easy' && random() < 0.25 ? 300 : L.margin;
  const search = new ChessSearch(game, seconds == null ? L.seconds : seconds);
  return search.bestMove(L.maxDepth, margin, random);
}

// Evaluation tables (White's view, index 0 = a8).
const PAWN_T = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0];
const KNIGHT_T = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50];
const BISHOP_T = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20];
const ROOK_T = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0];
const QUEEN_T = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20];
const KING_MID = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20];
const KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
const TABLES = [[], PAWN_T, KNIGHT_T, BISHOP_T, ROOK_T, QUEEN_T, KING_MID];
/** Game phase weights: 24 with every piece on the board, 0 with only kings and pawns. */
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];

/** Static evaluation in centipawns from the side to move. */
export function evaluate(pos) {
  let mg = 0, eg = 0, phase = 0;
  const bishops = [0, 0, 0], pieces = [0, 0, 0], pawns = [0, 0, 0];
  const board = pos.board;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === 0) continue;
    const kind = p > 0 ? p : -p;
    const white = p > 0;
    const index = white ? sq : ((7 - (sq >> 3)) << 3) | (sq & 7);
    const sgn = white ? 1 : -1;
    if (kind === 6) {
      mg += sgn * KING_MID[index];
      eg += sgn * KING_END[index];
      continue;
    }
    const v = VALUES[kind] + TABLES[kind][index];
    mg += sgn * v;
    eg += sgn * v;
    phase += PHASE_WEIGHT[kind];
    const side = white ? 1 : 2;
    if (kind === 1) pawns[side]++; else pieces[side] += VALUES[kind];
    if (kind === 3) bishops[side]++;
  }
  phase = Math.min(phase, 24);
  let score = Math.trunc((mg * phase + eg * (24 - phase)) / 24);
  if (bishops[1] >= 2) score += 30;
  if (bishops[2] >= 2) score -= 30;
  // A lone king: herd it to the edge and bring our king close, so mates get finished.
  if (pawns[2] === 0 && pieces[2] === 0 && pieces[1] >= 500) score += mopUp(pos.kingSquare[1], pos.kingSquare[2]);
  if (pawns[1] === 0 && pieces[1] === 0 && pieces[2] >= 500) score -= mopUp(pos.kingSquare[2], pos.kingSquare[1]);
  return pos.side === WHITE ? score : -score;
}

function mopUp(winner, loser) {
  const lr = loser >> 3, lc = loser & 7;
  const edge = Math.max(3 - lc, lc - 4) + Math.max(3 - lr, lr - 4);
  const distance = Math.abs((winner >> 3) - lr) + Math.abs((winner & 7) - lc);
  return 10 * edge + 4 * (14 - distance);
}

const MATE = 100000, INF = 1000000;
const TT_SIZE = 1 << 17, TT_MASK = TT_SIZE - 1;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function pack(m) { return m.from | (m.to << 6) | (m.promo << 12); }

/** One search: a scratch copy of the position, the hashes of the game so far (for
    repetition) and a small transposition table. Make a new one for every move. */
export class ChessSearch {
  constructor(game, seconds) {
    this.pos = game.position.clone();
    this.pathHi = [];
    this.pathLo = [];
    for (const h of game.hashes) {
      const [hi, lo] = h.split(':').map(Number);
      this.pathHi.push(hi);
      this.pathLo.push(lo);
    }
    this.deadline = now() + Math.max(seconds, 0.01) * 1000;
    this.nodes = 0;
    this.stopped = false;
    this.ttHi = new Int32Array(TT_SIZE);
    this.ttLo = new Int32Array(TT_SIZE);
    this.ttUsed = new Uint8Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttDepth = new Uint8Array(TT_SIZE);
    this.ttFlag = new Uint8Array(TT_SIZE);
    this.ttScore = new Int32Array(TT_SIZE);
    this.killers = new Int32Array(2 * 130);
  }

  /** Iterative deepening; picks at random among the moves within `margin` of the best. */
  bestMove(maxDepth, margin, random) {
    let rootMoves = this.pos.legalMoves();
    if (!rootMoves.length) return null;
    if (rootMoves.length === 1) return rootMoves[0];
    let scored = rootMoves.map((move) => ({ move, score: 0 }));
    for (let depth = 1; depth <= Math.max(1, maxDepth); depth++) {
      let alpha = -INF;
      const results = [];
      for (const m of rootMoves) {
        const u = this.pos.make(m);
        this.pathHi.push(this.pos.hashHi);
        this.pathLo.push(this.pos.hashLo);
        // A window lowered by the margin keeps exact scores for the near-best moves.
        const floor = alpha === -INF ? -INF : alpha - margin - 1;
        const score = -this.negamax(depth - 1, -INF, -floor, 1);
        this.pathHi.pop();
        this.pathLo.pop();
        this.pos.unmake(m, u);
        if (this.stopped) break;
        results.push({ move: m, score });
        alpha = Math.max(alpha, score);
      }
      if (this.stopped && depth > 1) break;
      if (!results.length) break;
      // Moves the stopped iteration didn't reach keep their earlier order at the end.
      const reached = new Set(results.map((r) => r.move));
      scored = results.slice().sort((a, b) => b.score - a.score).concat(scored.filter((s) => !reached.has(s.move)));
      rootMoves = scored.map((s) => s.move);
      if (this.stopped || Math.abs(scored[0].score) > MATE - 200) break;
    }
    const best = scored[0].score;
    const pool = scored.filter((s) => s.score >= best - margin && s.score > -MATE + 200);
    if (!pool.length) return scored[0].move;
    const i = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    return pool[i].move;
  }

  timeUp() {
    this.nodes++;
    if ((this.nodes & 1023) === 0 && now() > this.deadline) this.stopped = true;
    return this.stopped;
  }

  isRepetition() {
    const n = this.pathHi.length;
    const pos = this.pos;
    if (pos.halfmove < 4 || n < 5) return false;
    const limit = Math.max(0, n - 1 - pos.halfmove);
    for (let i = n - 3; i >= limit; i -= 2) {
      if (this.pathHi[i] === pos.hashHi && this.pathLo[i] === pos.hashLo) return true;
    }
    return false;
  }

  negamax(depthIn, alphaIn, beta, ply) {
    if (this.timeUp()) return 0;
    const pos = this.pos;
    if (pos.halfmove >= 100 || this.isRepetition()) return 0;
    if (ply >= 64) return evaluate(pos);
    const inCheck = pos.inCheck;
    const depth = inCheck ? depthIn + 1 : depthIn;
    if (depth <= 0) return this.quiesce(alphaIn, beta, ply);

    let alpha = alphaIn;
    const slot = pos.hashLo & TT_MASK;
    let ttMove = 0;
    if (this.ttUsed[slot] && this.ttHi[slot] === pos.hashHi && this.ttLo[slot] === pos.hashLo) {
      ttMove = this.ttMove[slot];
      if (this.ttDepth[slot] >= depth) {
        let score = this.ttScore[slot];
        if (score > MATE - 1000) score -= ply; else if (score < -MATE + 1000) score += ply;
        const flag = this.ttFlag[slot];
        if (flag === 0) return score;
        if (flag === 1) { if (score >= beta) return score; } else if (score <= alpha) return score;
      }
    }

    const moves = [];
    pos.pseudoMoves(false, moves);
    const ordered = this.order(moves, ttMove, ply);
    const me = pos.side;
    let best = -INF, bestMove = 0, legal = 0;
    for (const m of ordered) {
      const u = pos.make(m);
      if (pos.attacked(pos.kingSquare[me], pos.side)) { pos.unmake(m, u); continue; }
      legal++;
      this.pathHi.push(pos.hashHi);
      this.pathLo.push(pos.hashLo);
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      this.pathHi.pop();
      this.pathLo.pop();
      pos.unmake(m, u);
      if (this.stopped) return 0;
      if (score > best) {
        best = score;
        bestMove = pack(m);
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (pos.board[m.to] === 0 && m.promo === 0 && ply < 128) {
              const packed = pack(m);
              if (this.killers[ply * 2] !== packed) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = packed; }
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -(MATE - ply) : 0;

    const flag = best <= alphaIn ? 2 : (best >= beta ? 1 : 0);
    let stored = best;
    if (stored > MATE - 1000) stored += ply; else if (stored < -MATE + 1000) stored -= ply;
    this.ttUsed[slot] = 1;
    this.ttHi[slot] = pos.hashHi;
    this.ttLo[slot] = pos.hashLo;
    this.ttMove[slot] = bestMove;
    this.ttDepth[slot] = Math.min(depth, 255);
    this.ttFlag[slot] = flag;
    this.ttScore[slot] = stored;
    return best;
  }

  quiesce(alphaIn, beta, ply) {
    if (this.timeUp()) return 0;
    const pos = this.pos;
    const standPat = evaluate(pos);
    if (standPat >= beta || ply >= 64) return standPat;
    let alpha = Math.max(alphaIn, standPat);
    const moves = [];
    pos.pseudoMoves(true, moves);
    const me = pos.side;
    for (const m of this.order(moves, 0, ply)) {
      const u = pos.make(m);
      if (pos.attacked(pos.kingSquare[me], pos.side)) { pos.unmake(m, u); continue; }
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake(m, u);
      if (this.stopped) return 0;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /** Hash move first, then captures (most valuable victim, least valuable attacker),
      promotions, the two killer moves, then the rest. */
  order(moves, ttMove, ply) {
    const k1 = ply < 128 ? this.killers[ply * 2] : 0, k2 = ply < 128 ? this.killers[ply * 2 + 1] : 0;
    const b = this.pos.board;
    for (const m of moves) {
      const packed = pack(m);
      let s = 0;
      if (packed === ttMove && ttMove !== 0) s = 1000000;
      else {
        let victim = b[m.to];
        const attacker = b[m.from];
        if (victim === 0 && Math.abs(attacker) === PAWN && (m.from & 7) !== (m.to & 7)) victim = PAWN;
        if (victim !== 0) s = 100000 + VALUES[Math.abs(victim)] * 8 - Math.trunc(VALUES[Math.abs(attacker)] / 10);
        else if (m.promo !== 0) s = 90000 + m.promo;
        else if (packed === k1) s = 80000;
        else if (packed === k2) s = 79000;
      }
      m.s = s;
    }
    // A stable sort, as Swift's is for these keys in practice.
    return moves.slice().sort((a, b2) => b2.s - a.s);
  }
}

// ── The coach ─────────────────────────────────────────────────────────────────

/* The beginner coach: the one most urgent idea in the position, like the Go coach's ring.
   Mate in one, then getting out of check, then the bigger of "take a free piece" and "save
   a piece under attack" (a threatened piece that can take something does both), then
   opening advice. Returns {kind, move?, square?, piece, other, san, free}. */
export function coach(game) {
  if (game.isOver) return null;
  const pos = game.position;
  const me = pos.side, them = other(me);

  for (const m of game.legal) {
    const after = pos.clone();
    after.make(m);
    if (after.inCheck && !after.legalMoves().length) {
      return { kind: 'mate', move: m, square: null, piece: Math.abs(pos.board[m.from]), other: 0, san: pos.san(m, game.legal), free: false };
    }
  }
  if (pos.inCheck) return { kind: 'check', move: null, square: pos.kingSquare[me], piece: KING, other: 0, san: '', free: false };

  // Our most valuable piece that can be taken for less than it is worth.
  let threat = null;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (p === 0 || sideOf(p) !== me || Math.abs(p) === KING) continue;
    let attackers = pos.attackers(sq, them);
    if (!attackers.length) continue;
    const defended = pos.attacked(sq, me);
    if (defended) attackers = attackers.filter((k) => k !== KING);
    if (!attackers.length) continue;
    const cheapest = attackers.reduce((a, b) => (VALUES[b] < VALUES[a] ? b : a));
    const value = VALUES[Math.abs(p)];
    const loss = defended ? value - VALUES[cheapest] : value;
    if (loss > 0 && loss > (threat ? threat.loss : 0)) threat = { square: sq, loss, piece: Math.abs(p), attacker: cheapest };
  }

  // Our best capture that wins material and doesn't walk into mate.
  let capture = null;
  for (const m of game.legal) {
    if (pos.board[m.to] === 0) continue;
    const value = VALUES[Math.abs(pos.board[m.to])];
    const cost = VALUES[Math.abs(pos.board[m.from])];
    const defended = pos.attacked(m.to, them);
    const gain = defended ? value - cost : value;
    if (gain <= 0 || gain <= (capture ? capture.gain : 0)) continue;
    const after = pos.clone();
    after.make(m);
    const mated = after.legalMoves().some((reply) => {
      const next = after.clone();
      next.make(reply);
      return next.inCheck && !next.legalMoves().length;
    });
    if (!mated) capture = { move: m, gain, free: !defended };
  }

  const captureHint = (c) => ({ kind: 'capture', move: c.move, square: c.move.to, piece: Math.abs(pos.board[c.move.from]),
    other: Math.abs(pos.board[c.move.to]), san: pos.san(c.move, game.legal), free: c.free });
  if (capture && (capture.gain >= (threat ? threat.loss : 0) || (threat && capture.move.from === threat.square))) return captureHint(capture);
  if (threat) return { kind: 'defend', move: null, square: threat.square, piece: threat.piece, other: threat.attacker, san: '', free: false };
  if (capture) return captureHint(capture);

  // Opening: knights and bishops still at home, or the king not castled yet.
  if (pos.fullmove <= 12) {
    const home = me === WHITE ? [57, 58, 61, 62] : [1, 2, 5, 6];
    const s = sign(me);
    const undeveloped = home.filter((sq) => pos.board[sq] === KNIGHT * s || pos.board[sq] === BISHOP * s).length;
    const kingHome = pos.kingSquare[me] === (me === WHITE ? 60 : 4);
    if (undeveloped >= 2 || (kingHome && (pos.castling & (me === WHITE ? 3 : 12)) !== 0)) {
      return { kind: 'develop', move: null, square: null, piece: 0, other: 0, san: '', free: false };
    }
  }
  return { kind: 'quiet', move: null, square: null, piece: 0, other: 0, san: '', free: false };
}
