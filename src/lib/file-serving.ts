import path from "node:path";

// Rules for handing a stored file back to the browser.
//
// Both the document vault and the chat attachment store serve files whose MIME
// type and path came from outside: an upload sets its own Content-Type, and a
// Google Drive sync brings whatever Drive reports. Serving those back verbatim
// as `Content-Disposition: inline` means a file claiming to be text/html
// renders as a page on this origin, with access to the session cookie - stored
// XSS against the only account that exists.
//
// `X-Content-Type-Options: nosniff` does not help here. It stops the browser
// guessing a type, but an explicit `Content-Type: text/html` is still honoured.

/**
 * Types a browser may render in place.
 *
 * Deliberately excludes image/svg+xml: an SVG is a document that can carry
 * script, and browsers execute it when the SVG is the top-level response.
 */
const INLINE_SAFE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "application/pdf",
  "text/plain",
]);

export interface ServedFileHeaders {
  contentType: string;
  disposition: string;
}

/**
 * Decides how to serve a stored file. Anything not on the inline allowlist is
 * downloaded as an opaque blob rather than rendered, so an unexpected type can
 * never become a page on this origin.
 */
export function serveHeaders(mime: unknown, name: unknown): ServedFileHeaders {
  const declared = String(mime || "").split(";")[0].trim().toLowerCase();
  const inline = INLINE_SAFE.has(declared);
  return {
    contentType: inline ? declared : "application/octet-stream",
    disposition: `${inline ? "inline" : "attachment"}; filename="${safeFilename(name)}"`,
  };
}

/**
 * A filename that cannot break out of the header. Quotes and newlines would
 * terminate the value or inject a second header.
 */
export function safeFilename(name: unknown): string {
  const cleaned = String(name ?? "")
    .replace(/[\\/]/g, "_")
    .replace(/["\r\n]/g, "_")
    .trim();
  return cleaned.slice(0, 200) || "download";
}

/**
 * Joins a stored relative path onto a base directory, returning null when the
 * result escapes it. A stored path is not trustworthy input: `../` in a value
 * that arrived from a sync would otherwise read any file the process can.
 */
export function resolveWithin(baseDir: string, relativePath: unknown): string | null {
  const relative = String(relativePath ?? "");
  if (!relative) return null;
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, relative);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}
