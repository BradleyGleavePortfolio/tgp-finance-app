/**
 * Sprint A — coach signup token (mobile side).
 *
 * Mints `<userId>.<expiresAt>.<hmac>` where the hmac is
 * HMAC-SHA256(EXPO_PUBLIC_COACH_SIGNUP_SECRET, `${userId}.${expiresAt}`).
 *
 * The backend (`/api/auth/coach-promote`) verifies the HMAC + freshness
 * + that the embedded user matches the authenticated caller before
 * flipping the role. Embedding the secret in the client means a
 * determined attacker can mint a token; we lean on rate limiting and
 * audit logging on the server. See backend/src/auth/auth.service.ts.
 *
 * Pure-JS implementation — no native dependency. Lifted from RFC 6234
 * (SHA-256) + RFC 2104 (HMAC). Verified byte-for-byte against
 * Node's `crypto.createHmac('sha256', ...)` in the unit test.
 */

const TOKEN_TTL_MS = 4 * 60 * 1000; // 4 minutes — server allows 5; pad for clock skew

// ── SHA-256 ────────────────────────────────────────────────────────────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const ROTR = (n: number, x: number) => (x >>> n) | (x << (32 - n));

function sha256Bytes(message: Uint8Array): Uint8Array {
  // Padding
  const len = message.length;
  const bitLen = len * 8;
  const paddedLen = ((len + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(message);
  padded[len] = 0x80;
  // Length as 64-bit big-endian — JS numbers max out at 2^53, so the
  // top 32 bits are always 0 for any payload we feed it here.
  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  padded[paddedLen - 8] = (high >>> 24) & 0xff;
  padded[paddedLen - 7] = (high >>> 16) & 0xff;
  padded[paddedLen - 6] = (high >>> 8) & 0xff;
  padded[paddedLen - 5] = high & 0xff;
  padded[paddedLen - 4] = (low >>> 24) & 0xff;
  padded[paddedLen - 3] = (low >>> 16) & 0xff;
  padded[paddedLen - 2] = (low >>> 8) & 0xff;
  padded[paddedLen - 1] = low & 0xff;

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);

  for (let chunkStart = 0; chunkStart < paddedLen; chunkStart += 64) {
    for (let i = 0; i < 16; i++) {
      const j = chunkStart + i * 4;
      W[i] = (padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ROTR(7, W[i - 15]) ^ ROTR(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = ROTR(17, W[i - 2]) ^ ROTR(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3];
    let e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ROTR(6, e) ^ ROTR(11, e) ^ ROTR(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = ROTR(2, a) ^ ROTR(13, a) ^ ROTR(22, a);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (H[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
    out[i * 4 + 3] = H[i] & 0xff;
  }
  return out;
}

function utf8Encode(str: string): Uint8Array {
  // RN's TextEncoder is reliable on SDK 49+. Fall back to a manual
  // ASCII-safe encoder if it's missing for any reason.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return Uint8Array.from(out);
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

export function hmacSha256Hex(secret: string, message: string): string {
  const blockSize = 64;
  let key = utf8Encode(secret);
  if (key.length > blockSize) key = sha256Bytes(key);
  if (key.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(key);
    key = padded;
  }
  const oKey = new Uint8Array(blockSize);
  const iKey = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKey[i] = key[i] ^ 0x5c;
    iKey[i] = key[i] ^ 0x36;
  }
  const msgBytes = utf8Encode(message);
  const inner = new Uint8Array(iKey.length + msgBytes.length);
  inner.set(iKey);
  inner.set(msgBytes, iKey.length);
  const innerHash = sha256Bytes(inner);
  const outer = new Uint8Array(oKey.length + innerHash.length);
  outer.set(oKey);
  outer.set(innerHash, oKey.length);
  return bytesToHex(sha256Bytes(outer));
}

export function mintCoachSignupToken(
  userId: string,
  secret: string,
  nowMs: number = Date.now(),
): string {
  if (!secret || secret.length < 32) {
    throw new Error('COACH_SIGNUP_SECRET is not configured (mobile side).');
  }
  const expiresAt = nowMs + TOKEN_TTL_MS;
  const sig = hmacSha256Hex(secret, `${userId}.${expiresAt}`);
  return `${userId}.${expiresAt}.${sig}`;
}

export function getCoachSignupSecret(): string | null {
  const raw = process.env.EXPO_PUBLIC_COACH_SIGNUP_SECRET ?? '';
  if (!raw || raw.length < 32) {
    // Prod builds (release/AppStore/TestFlight) must never silently fall back
    // to the legacy COACH_ACCESS_CODE backdoor — that path bypasses the
    // backend's audit log and rate limit. Fail loudly so a missed secret in
    // the EAS profile surfaces in Sentry instead of as a confused user.
    if (!__DEV__) {
      throw new Error(
        'EXPO_PUBLIC_COACH_SIGNUP_SECRET is not configured (production build). ' +
          'Coach signup is unavailable.',
      );
    }
    return null;
  }
  return raw;
}
