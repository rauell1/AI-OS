import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveWithin, safeFilename, serveHeaders } from "../src/lib/file-serving";

describe("serveHeaders", () => {
  it("renders the safe types in place", () => {
    for (const mime of ["image/png", "image/jpeg", "application/pdf", "text/plain"]) {
      const h = serveHeaders(mime, "file");
      expect(h.contentType, mime).toBe(mime);
      expect(h.disposition, mime).toMatch(/^inline;/);
    }
  });

  it("downloads anything that could execute on this origin", () => {
    // The whole point: a stored file claiming to be HTML must never render as a
    // page here, or it runs with access to the session cookie.
    for (const mime of [
      "text/html",
      "application/xhtml+xml",
      "image/svg+xml", // an SVG is a document and can carry script
      "application/javascript",
      "text/xml",
      "application/octet-stream",
      "",
      null,
      undefined,
    ]) {
      const h = serveHeaders(mime, "file");
      expect(h.contentType, String(mime)).toBe("application/octet-stream");
      expect(h.disposition, String(mime)).toMatch(/^attachment;/);
    }
  });

  it("is not fooled by casing or parameters", () => {
    expect(serveHeaders("TEXT/HTML; charset=utf-8", "x").disposition).toMatch(/^attachment;/);
    expect(serveHeaders("Image/PNG; qs=1", "x").contentType).toBe("image/png");
  });
});

describe("safeFilename", () => {
  it("cannot terminate the header or inject another", () => {
    const name = safeFilename('evil".pdf\r\nSet-Cookie: a=b');
    expect(name).not.toContain('"');
    expect(name).not.toContain("\r");
    expect(name).not.toContain("\n");
  });

  it("strips path separators and falls back for empty names", () => {
    expect(safeFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(safeFilename("")).toBe("download");
    expect(safeFilename(null)).toBe("download");
  });
});

describe("resolveWithin", () => {
  const base = path.resolve("/srv/data/documents");

  it("allows a path inside the directory", () => {
    expect(resolveWithin(base, "doc_123.pdf")).toBe(path.join(base, "doc_123.pdf"));
    expect(resolveWithin(base, "nested/doc.pdf")).toBe(path.join(base, "nested", "doc.pdf"));
  });

  it("refuses anything that escapes it", () => {
    for (const bad of [
      "../secrets.env",
      "../../etc/passwd",
      "nested/../../outside.txt",
      "/etc/passwd",
      "",
      null,
    ]) {
      expect(resolveWithin(base, bad), String(bad)).toBeNull();
    }
  });

  it("refuses a sibling directory with the same prefix", () => {
    // /srv/data/documents-public must not pass a naive startsWith check.
    expect(resolveWithin(base, "../documents-public/x")).toBeNull();
  });
});
