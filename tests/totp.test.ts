import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  formatSecretForDisplay,
  generateSecret,
  hotp,
  otpauthUri,
  totp,
  verifyTotp,
} from "../src/lib/totp";

// The RFC's own published vectors. If this implementation disagrees with them
// it disagrees with every authenticator app, and the failure would look like
// "the code is always wrong" with nothing to point at.
const RFC_SECRET_ASCII = "12345678901234567890";
const RFC_SECRET_B32 = base32Encode(Buffer.from(RFC_SECRET_ASCII, "ascii"));

describe("HOTP — RFC 4226 appendix D", () => {
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  it.each(expected.map((code, counter) => [counter, code]))("counter %i -> %s", (counter, code) => {
    expect(hotp(Buffer.from(RFC_SECRET_ASCII, "ascii"), counter as number)).toBe(code);
  });
});

describe("TOTP — RFC 6238 appendix B (SHA1)", () => {
  // The RFC prints 8-digit codes; the last six are what a 6-digit authenticator
  // shows, which is what this implementation produces.
  const vectors: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];
  it.each(vectors)("t=%i -> %s", (seconds, code) => {
    expect(totp(RFC_SECRET_B32, seconds as number)).toBe(code);
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const size of [1, 2, 5, 10, 20, 32]) {
      const buf = Buffer.from(Array.from({ length: size }, (_, i) => (i * 37) % 256));
      expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    }
  });

  it("accepts the spaces and padding people paste in", () => {
    const secret = generateSecret();
    expect(base32Decode(formatSecretForDisplay(secret)).equals(base32Decode(secret))).toBe(true);
    expect(base32Decode(secret + "===").equals(base32Decode(secret))).toBe(true);
    expect(base32Decode(secret.toLowerCase()).equals(base32Decode(secret))).toBe(true);
  });

  it("rejects characters that are not base32", () => {
    expect(() => base32Decode("ABC!DEF")).toThrow();
    // 0, 1 and 8 are excluded from the alphabet precisely because they are
    // misread as O, I and B.
    expect(() => base32Decode("ABC0DEF")).toThrow();
  });
});

describe("verifyTotp", () => {
  const secret = generateSecret();
  const now = 1_700_000_000;

  it("accepts the current code", () => {
    expect(verifyTotp(secret, totp(secret, now), { atSeconds: now })).toBe(true);
  });

  it("tolerates one step of clock drift either way", () => {
    expect(verifyTotp(secret, totp(secret, now - 30), { atSeconds: now })).toBe(true);
    expect(verifyTotp(secret, totp(secret, now + 30), { atSeconds: now })).toBe(true);
  });

  it("refuses a code from further out", () => {
    expect(verifyTotp(secret, totp(secret, now - 90), { atSeconds: now })).toBe(false);
    expect(verifyTotp(secret, totp(secret, now + 90), { atSeconds: now })).toBe(false);
  });

  it("accepts a code typed with a space in it", () => {
    const code = totp(secret, now);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { atSeconds: now })).toBe(true);
  });

  it("refuses malformed input without throwing", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34", "000000000"]) {
      expect(verifyTotp(secret, bad, { atSeconds: now }), bad).toBe(false);
    }
  });

  it("refuses another account's code", () => {
    const other = generateSecret();
    expect(verifyTotp(secret, totp(other, now), { atSeconds: now })).toBe(false);
  });
});

describe("otpauthUri", () => {
  it("carries the secret, issuer and parameters an app needs", () => {
    const uri = otpauthUri("JBSWY3DPEHPK3PXP", "someone@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    const params = new URL(uri).searchParams;
    expect(params.get("secret")).toBe("JBSWY3DPEHPK3PXP");
    expect(params.get("issuer")).toBe("Rauell OS");
    expect(params.get("period")).toBe("30");
    expect(params.get("digits")).toBe("6");
    expect(decodeURIComponent(uri.split("/")[3].split("?")[0])).toBe("Rauell OS:someone@example.com");
  });
});

describe("generateSecret", () => {
  it("is 160 bits and different every time", () => {
    const a = generateSecret();
    expect(base32Decode(a)).toHaveLength(20);
    expect(new Set(Array.from({ length: 50 }, () => generateSecret())).size).toBe(50);
  });
});
