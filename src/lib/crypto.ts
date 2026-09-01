import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// AES-256-GCM encryption for integration tokens at rest.
//
// The key comes from TOKEN_ENCRYPTION_KEY (base64, 32 bytes). Outside
// production a deterministic key is derived from a constant so the app still
// runs with no configuration - but that constant lives in a public repository,
// so anyone who reads it can decrypt any token it protected. In production the
// fallback is refused rather than used: storing a Google or GitHub token under
// a key the whole internet knows is worse than not storing it at all.
let keyWarned = false;

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 32 bytes base64-encoded; got ${buf.length}. ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  if (process.env.NODE_ENV === "production") {
    if (!keyWarned) {
      keyWarned = true;
      console.error(
        "[rauell-os] SECURITY: TOKEN_ENCRYPTION_KEY is not set. Integration " +
          "tokens cannot be stored, because the development fallback key is " +
          "derived from a constant committed to this repository. Generate one " +
          "with `openssl rand -base64 32` and set it to connect integrations."
      );
    }
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is required in production; integration tokens are not stored until it is configured."
    );
  }
  // Development only, and clearly insecure.
  return createHash("sha256").update("rauell-os-dev-token-key").digest();
}

/** Whether integration tokens can actually be stored, for UI that offers to connect one. */
export function tokenEncryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
