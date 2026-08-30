/** Lightweight fuzzy duplicate detection using URL canonicalization + text similarity. */

export function canonicalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const drop = [...u.searchParams.keys()].filter((k) => /^(utm_|ref|fbclid|gclid|source)/i.test(k));
    drop.forEach((k) => u.searchParams.delete(k));
    u.hash = "";
    let s = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
    const q = u.searchParams.toString();
    if (q) s += `?${q}`;
    return s.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|at|of|and|for|in|to|with|junior|senior)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenJaccard(a: string, b: string): number {
  const sa = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const sb = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export type DupCheck = { sameUrl: boolean; similarTitle: boolean; isDuplicate: boolean };

/** Two opportunities are duplicates when URLs match, or title+org are near-identical. */
export function isDuplicateOpportunity(
  a: { title: string; sourceUrl?: string | null; organizationName?: string | null },
  b: { title: string; sourceUrl?: string | null; organizationName?: string | null }
): DupCheck {
  const urlA = canonicalUrl(a.sourceUrl);
  const urlB = canonicalUrl(b.sourceUrl);
  const sameUrl = Boolean(urlA && urlB && urlA === urlB);
  const titleSim = tokenJaccard(a.title, b.title);
  const sameOrg =
    normalizeTitle(a.organizationName ?? "") === normalizeTitle(b.organizationName ?? "") &&
    normalizeTitle(a.organizationName ?? "").length > 2;
  const similarTitle = titleSim >= 0.85 && (sameOrg || !urlA || !urlB);
  return { sameUrl, similarTitle, isDuplicate: sameUrl || similarTitle };
}

export function findBestMatch<T extends { title: string; sourceUrl?: string | null; organizationName?: string | null }>(
  item: { title: string; sourceUrl?: string | null; organizationName?: string | null },
  candidates: T[]
): T | null {
  for (const c of candidates) {
    if (isDuplicateOpportunity(item, c).isDuplicate) return c;
  }
  return null;
}
