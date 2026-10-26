/* Keys and seeds for online Mahjong (the app's MahjongKeys in Qi/Online/MahjongRoom.swift), so a
   web player's tiles can be sealed to them and opened by them alone, and the app and the page
   can sit at one table: X25519 between the host and each player, HKDF-SHA256 (salt: the room
   code), ChaCha20-Poly1305 sealed boxes (nonce ‖ ciphertext ‖ tag, base64), and each hand's
   wall seed from the host's secret. The cryptography is @noble's (audited, pure JS), loaded
   from the CDN at exact versions the first time a Mahjong room needs it. */

let lib = null;
const CDN = 'https://cdn.jsdelivr.net/npm/';
/** Loads the libraries (or takes them, in tests: { x25519, chacha20poly1305, hkdf, sha256 }). */
export async function loadCrypto(given) {
  if (lib) return lib;
  if (given) { lib = given; return lib; }
  const [curves, ciphers, hk, sha] = await Promise.all([
    import(CDN + '@noble/curves@1.4.0/ed25519/+esm'),
    import(CDN + '@noble/ciphers@0.5.3/chacha/+esm'),
    import(CDN + '@noble/hashes@1.4.0/hkdf/+esm'),
    import(CDN + '@noble/hashes@1.4.0/sha256/+esm'),
  ]);
  lib = { x25519: curves.x25519, chacha20poly1305: ciphers.chacha20poly1305, hkdf: hk.hkdf, sha256: sha.sha256 };
  return lib;
}
export const ready = () => lib != null;

const enc = new TextEncoder(), dec = new TextDecoder();
export function b64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
export function unb64(text) {
  try { const s = atob(text); return Uint8Array.from(s, (c) => c.charCodeAt(0)); } catch (e) { return null; }
}
const concat = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };

/** A new room secret: 32 random bytes, base64. */
export function newSecret() { const b = new Uint8Array(32); crypto.getRandomValues(b); return b64(b); }

/** SHA-256 of the secret's bytes followed by a label. */
function bytes(secret, label) { return lib.sha256(concat(unb64(secret) || enc.encode(secret), enc.encode(label))); }

export function privateKey(secret) { return bytes(secret, 'qi-mahjong-key'); }
export function publicKey(secret) { return b64(lib.x25519.getPublicKey(privateKey(secret))); }

/** The wall seed of hand `hand` (a BigInt): the first eight bytes, big-endian. */
export function seed(secret, hand) {
  const b = bytes(secret, `qi-mahjong-hand-${hand}`);
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(b[i]);
  return v;
}

/** The key two players share: my secret, your public key, the room. */
export function shared(secret, pub, room) {
  const yours = unb64(pub);
  if (!yours || yours.length !== 32) return null;
  try {
    const s = lib.x25519.getSharedSecret(privateKey(secret), yours);
    return lib.hkdf(lib.sha256, s, enc.encode(room), enc.encode('qi-mahjong-tiles'), 32);
  } catch (e) { return null; }
}

/** The host's key for notes to itself. */
export function own(secret) { return bytes(secret, 'qi-mahjong-notes'); }

export function seal(value, key) {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const box = lib.chacha20poly1305(key, nonce).encrypt(enc.encode(JSON.stringify(value)));
  return b64(concat(nonce, box));
}

export function open(text, key) {
  const data = unb64(text);
  if (!data || data.length < 28 || !key) return null;
  try {
    const plain = lib.chacha20poly1305(key, data.subarray(0, 12)).decrypt(data.subarray(12));
    return JSON.parse(dec.decode(plain));
  } catch (e) { return null; }
}
