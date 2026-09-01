// RFC 4648 base32 and RFC 6238 TOTP.
//
// Implemented here rather than pulled from npm on purpose. This is the code
// that stands between a leaked password and the account, and it is about eighty
// lines of standard algorithm with published test vectors. A dependency for it
// would add a supply chain to audit in exchange for very little.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  // Authenticator apps display the secret in groups; people paste it back with
  // the spaces and any padding still attached.
  const cleaned = input.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Not valid base32: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, the size RFC 4226 recommends for HMAC-SHA1. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP: RFC 4226 section 5.3. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  // Counters stay far below 2^32 for any realistic clock, and writing the high
  // word explicitly avoids depending on BigInt here.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", secret).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export const TOTP_STEP_SECONDS = 30;

/** TOTP: RFC 6238. `atSeconds` defaults to now. */
export function totp(secretBase32: string, atSeconds = Math.floor(Date.now() / 1000), digits = 6): string {
  return hotp(base32Decode(secretBase32), Math.floor(atSeconds / TOTP_STEP_SECONDS), digits);
}

/**
 * Checks a submitted code, allowing for clock drift.
 *
 * `window` is how many 30-second steps either side are accepted; 1 tolerates
 * about ±30 seconds, which covers a phone whose clock is slightly off and a
 * person who starts typing as the code rolls over. Every candidate is compared
 * in constant time, and all of them are compared even after a match, so the
 * time taken says nothing about which step matched.
 */
export function verifyTotp(
  secretBase32: string,
  submitted: string,
  { window = 1, atSeconds = Math.floor(Date.now() / 1000), digits = 6 } = {}
): boolean {
  const code = submitted.replace(/\s/g, "");
  if (!/^\d+$/.test(code) || code.length !== digits) return false;
  const submittedBuf = Buffer.from(code, "utf8");
  let matched = false;
  for (let drift = -window; drift <= window; drift++) {
    const candidate = totp(secretBase32, atSeconds + drift * TOTP_STEP_SECONDS, digits);
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === submittedBuf.length &&
      timingSafeEqual(candidateBuf, submittedBuf)
    ) {
      matched = true;
    }
  }
  return matched;
}

/**
 * The otpauth:// URI an authenticator app enrols from. The label carries the
 * account and issuer so the entry is identifiable among a dozen others.
 */
export function otpauthUri(secretBase32: string, account: string, issuer = "Rauell OS"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Groups a secret into fours so it can be typed in without losing your place. */
export function formatSecretForDisplay(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, "$1 ").trim();
}
