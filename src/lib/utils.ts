import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function newId(prefix = "id"): string {
  const c: any = globalThis.crypto;
  const uuid = c && typeof c.randomUUID === "function"
    ? c.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${uuid.slice(0, 20)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

// Timestamp columns are TEXT holding full ISO 8601 strings, so date cutoffs are
// computed here and bound as parameters rather than expressed in SQL. SQLite's
// datetime() does not exist in Postgres, and its output format
// ("2026-08-30 13:00:00") does not match the stored format
// ("2026-08-30T13:00:00.000Z") - the "T" sorts after the space, so a same-day
// row compared against datetime() lands on the wrong side of the boundary.
// Comparing ISO against ISO keeps both backends correct and identical.
export function isoDaysFromNow(days = 0): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function parseJSON<T = any>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJSON(value: any): string {
  return JSON.stringify(value ?? null);
}

export function daysUntil(date?: string | Date | null): number | null {
  if (!date) return null;
  const d = (date instanceof Date ? date : new Date(date)).getTime();
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24));
}

export function isOverdue(date?: string | null): boolean {
  const d = daysUntil(date);
  return d != null && d < 0;
}

export function formatDate(date?: string | null, withTime = false): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (!withTime) return datePart;
  return `${datePart} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function relativeTime(date?: string | null): string {
  if (!date) return "";
  const d = new Date(date).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Date.now() - d;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ${suffix}`;
  if (hrs < 24) return `${hrs}h ${suffix}`;
  if (days < 30) return `${days}d ${suffix}`;
  return `${Math.round(days / 30)}mo ${suffix}`;
}

export function truncate(text: string, n = 140): string {
  if (!text) return "";
  return text.length > n ? text.slice(0, n - 1).trimEnd() + "…" : text;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
