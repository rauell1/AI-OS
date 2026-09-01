// Parsers for the profile importer.
//
// Kept separate from the page so each format can be tested without a database
// or a request. Every parser returns the same shape, and says what it could not
// read rather than returning empty and letting the caller report success.

import { completeJSON, aiEnabled } from "./ai";

export interface ParsedSkill {
  name: string;
  category?: string;
}

export interface ParsedEducation {
  institution: string;
  degree?: string;
  field?: string;
  start_year?: number;
  end_year?: number;
}

export interface ParsedEmployment {
  title: string;
  organization?: string;
  start_date?: string;
  end_date?: string;
  current?: boolean;
  summary?: string;
}

export interface ParsedProject {
  name: string;
  overview?: string;
}

export interface ParsedProfile {
  headline?: string;
  summary?: string;
  location?: string;
  skills: ParsedSkill[];
  education: ParsedEducation[];
  employment: ParsedEmployment[];
  projects: ParsedProject[];
  /** What the parser could not read, in words a person can act on. */
  notes: string[];
}

export function emptyProfile(): ParsedProfile {
  return { skills: [], education: [], employment: [], projects: [], notes: [] };
}

export function parsedCount(p: ParsedProfile): number {
  return p.skills.length + p.education.length + p.employment.length + p.projects.length;
}

function year(value: unknown): number | undefined {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 1900 && n < 2200 ? n : undefined;
}

function str(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return s || undefined;
}

// --- LinkedIn data export (ZIP of CSVs) ------------------------------------

/**
 * LinkedIn's export is a ZIP of CSVs whose exact set varies by account and by
 * what the user ticked when requesting it, so every file is optional and a
 * missing one is reported rather than treated as an empty result.
 */
export async function parseLinkedInZip(buffer: ArrayBuffer): Promise<ParsedProfile> {
  const out = emptyProfile();
  const JSZip = (await import("jszip")).default;
  const { parse } = await import("csv-parse/sync");
  const zip = await JSZip.loadAsync(buffer);

  const rowsOf = async (name: string): Promise<any[]> => {
    // LinkedIn nests files under a folder in some exports, so match on the leaf.
    const file =
      zip.file(name) ||
      zip.file(new RegExp(`(^|/)${name.replace(".", "\\.")}$`, "i"))?.[0] ||
      null;
    if (!file) return [];
    const text = await file.async("text");
    try {
      return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true }) as any[];
    } catch {
      out.notes.push(`${name} could not be read as CSV and was skipped.`);
      return [];
    }
  };

  const seen = new Set<string>();
  for (const row of await rowsOf("Skills.csv")) {
    const name = str(row.Name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.skills.push({ name, category: "Imported" });
  }

  for (const row of await rowsOf("Education.csv")) {
    const institution = str(row["School Name"]) || str(row.School);
    if (!institution) continue;
    out.education.push({
      institution,
      degree: str(row["Degree Name"]) || str(row.DegreeName),
      field: str(row["Field Of Study"]) || str(row.Notes),
      start_year: year(row["Start Date"] ?? row.StartDate),
      end_year: year(row["End Date"] ?? row.EndDate),
    });
  }

  for (const row of await rowsOf("Positions.csv")) {
    const title = str(row.Title);
    if (!title) continue;
    const finished = str(row["Finished On"]);
    out.employment.push({
      title,
      organization: str(row["Company Name"]),
      start_date: str(row["Started On"]),
      end_date: finished,
      current: !finished,
      summary: str(row.Description),
    });
  }

  for (const row of await rowsOf("Projects.csv")) {
    const name = str(row.Title) || str(row.Name);
    if (!name) continue;
    out.projects.push({ name, overview: str(row.Description) });
  }

  const profileRows = await rowsOf("Profile.csv");
  if (profileRows.length) {
    const row = profileRows[0];
    out.headline = str(row.Headline);
    out.summary = str(row.Summary);
    out.location = str(row["Geo Location"]) || str(row.Location);
  }

  if (parsedCount(out) === 0) {
    out.notes.push(
      "No Skills.csv, Education.csv, Positions.csv or Projects.csv was found in this ZIP. " +
        "Request a full export from LinkedIn (Settings → Data privacy → Get a copy of your data)."
    );
  }
  return out;
}

// --- JSON --------------------------------------------------------------------

/**
 * Accepts this application's own export shape, and tolerates the common
 * variations (a bare array of skills, `work` instead of `employment` as in
 * JSON Resume) rather than failing on a near miss.
 */
export function parseProfileJson(text: string): ParsedProfile {
  const out = emptyProfile();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch (err: any) {
    out.notes.push(`The file is not valid JSON (${err?.message || "parse failed"}).`);
    return out;
  }

  const basics = data.basics || data.profile || {};
  out.headline = str(basics.headline) || str(basics.label);
  out.summary = str(basics.summary);
  out.location = str(basics.location?.city ? `${basics.location.city}, ${basics.location.region ?? ""}`.replace(/,\s*$/, "") : basics.location);

  const skills = Array.isArray(data) ? data : data.skills || [];
  for (const s of skills) {
    const name = typeof s === "string" ? s : str(s?.name);
    if (name) out.skills.push({ name, category: typeof s === "string" ? "Imported" : str(s?.category) || "Imported" });
  }

  for (const e of data.education || []) {
    const institution = str(e?.institution) || str(e?.school);
    if (institution) {
      out.education.push({
        institution,
        degree: str(e?.degree) || str(e?.studyType),
        field: str(e?.field) || str(e?.area),
        start_year: year(e?.start_year ?? e?.startDate),
        end_year: year(e?.end_year ?? e?.endDate),
      });
    }
  }

  for (const w of data.employment || data.work || []) {
    const title = str(w?.title) || str(w?.position);
    if (title) {
      out.employment.push({
        title,
        organization: str(w?.organization) || str(w?.company) || str(w?.name),
        start_date: str(w?.start_date) || str(w?.startDate),
        end_date: str(w?.end_date) || str(w?.endDate),
        current: !str(w?.end_date ?? w?.endDate),
        summary: str(w?.summary),
      });
    }
  }

  for (const p of data.projects || []) {
    const name = str(p?.name);
    if (name) out.projects.push({ name, overview: str(p?.overview) || str(p?.description) });
  }

  if (parsedCount(out) === 0) {
    out.notes.push(
      "No skills, education, employment or projects were found. Expected an object with " +
        "any of those keys, or a bare array of skill names."
    );
  }
  return out;
}

// --- PDF / CV ----------------------------------------------------------------

const CV_SYSTEM = `You extract structured facts from a CV. Return ONLY JSON matching:
{"headline":string?,"summary":string?,"location":string?,
 "skills":[{"name":string,"category":string?}],
 "education":[{"institution":string,"degree":string?,"field":string?,"start_year":number?,"end_year":number?}],
 "employment":[{"title":string,"organization":string?,"start_date":string?,"end_date":string?,"current":boolean?,"summary":string?}],
 "projects":[{"name":string,"overview":string?}]}
Copy facts from the CV. Never invent a role, school, date or skill that is not written there. Omit anything you are unsure of.`;

/**
 * A CV is prose, so this one genuinely needs a model. Without an AI key
 * configured it says so instead of importing nothing and reporting success -
 * which is what the importer used to do for every PDF it was given.
 */
export async function parseCvText(text: string, userId?: string): Promise<ParsedProfile> {
  const out = emptyProfile();
  const trimmed = text.trim();
  if (!trimmed) {
    out.notes.push(
      "No text could be extracted from this PDF. Scanned or image-only PDFs need " +
        "OCR first; a text-based PDF or a DOCX-exported one will work."
    );
    return out;
  }
  if (!aiEnabled()) {
    out.notes.push(
      "Reading a CV needs an AI provider, and none is configured. Set one of " +
        "NVIDIA_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY, or " +
        "import a LinkedIn ZIP export instead, which is parsed without AI."
    );
    return out;
  }

  const parsed = await completeJSON<Partial<ParsedProfile>>({
    system: CV_SYSTEM,
    messages: [{ role: "user", content: trimmed.slice(0, 40_000) }],
    temperature: 0,
    agent: "cv_import",
    userId,
  });
  if (!parsed) {
    out.notes.push("The AI provider did not return usable JSON for this CV. Nothing was imported.");
    return out;
  }

  out.headline = str(parsed.headline);
  out.summary = str(parsed.summary);
  out.location = str(parsed.location);
  for (const s of parsed.skills || []) {
    const name = str(s?.name);
    if (name) out.skills.push({ name, category: str(s?.category) || "Imported" });
  }
  for (const e of parsed.education || []) {
    const institution = str(e?.institution);
    if (institution) {
      out.education.push({
        institution,
        degree: str(e?.degree),
        field: str(e?.field),
        start_year: year(e?.start_year),
        end_year: year(e?.end_year),
      });
    }
  }
  for (const w of parsed.employment || []) {
    const title = str(w?.title);
    if (title) {
      out.employment.push({
        title,
        organization: str(w?.organization),
        start_date: str(w?.start_date),
        end_date: str(w?.end_date),
        current: Boolean(w?.current),
        summary: str(w?.summary),
      });
    }
  }
  for (const p of parsed.projects || []) {
    const name = str(p?.name);
    if (name) out.projects.push({ name, overview: str(p?.overview) });
  }

  if (parsedCount(out) === 0) {
    out.notes.push("The CV was read but nothing recognisable was found in it.");
  }
  return out;
}
