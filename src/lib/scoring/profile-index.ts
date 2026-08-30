import { getDb } from "@/lib/db";
import { parseJSON } from "@/lib/utils";

/**
 * A normalized, searchable index over the master profile.
 * Built per scoring run (cheap at personal scale) and shared by the job,
 * scholarship, and lead engines so all engines reason over the same facts.
 */
export type ProfileIndex = {
  skills: { name: string; category?: string; proficiency: number; years?: number | null }[];
  titles: string[];
  employers: string[];
  projects: { name: string; overview?: string | null }[];
  degrees: { degree: string; field?: string | null; institution: string; grade?: string | null }[];
  certificates: string[];
  sectors: string[];
  hasBachelor: boolean;
  gradeLevel: "FIRST" | "UPPER_SECOND" | "LOWER_SECOND" | "PASS" | "UNKNOWN";
  yearsTotal: number;
  textBlob: string;
};

/** Skills are stored as free-text proficiency ("advanced", "developing", ...); normalize to 1..5. */
export function proficiencyToLevel(proficiency?: string | null): number {
  const p = (proficiency || "").toLowerCase();
  if (/expert|master(?!'s)/.test(p)) return 5;
  if (/advanced|proficient|strong/.test(p)) return 4;
  if (/intermediate|working/.test(p)) return 3;
  if (/develop|beginner|basic|learning|exposure/.test(p)) return 2;
  return 3; // unspecified: assume moderate rather than claiming expertise
}

function empty(): ProfileIndex {
  return {
    skills: [], titles: [], employers: [], projects: [], degrees: [], certificates: [],
    sectors: [], hasBachelor: false, gradeLevel: "UNKNOWN", yearsTotal: 0, textBlob: "",
  };
}

export async function buildProfileIndex(userId: string): Promise<ProfileIndex> {
  const db = await getDb();
  const [skillsRows, employmentRows, projectRows, educationRows, prefsRow] = await Promise.all([
    db.query<{ name: string; category?: string; proficiency?: string; years?: number }>(
      `SELECT name, category, proficiency, years FROM skills WHERE user_id = ?`,
      [userId]
    ),
    db.query<{ title: string; organization_id?: string; start_date?: string; end_date?: string; current?: number; responsibilities_json?: string }>(
      `SELECT e.title, e.start_date, e.end_date, e.current, e.responsibilities_json, o.name AS organization_name
       FROM employment e LEFT JOIN organizations o ON o.id = e.organization_id WHERE e.user_id = ?`,
      [userId]
    ),
    db.query<{ name: string; overview?: string; category?: string }>(
      `SELECT name, overview, category FROM projects WHERE user_id = ?`,
      [userId]
    ),
    db.query<{ institution: string; degree?: string; field?: string; details_json?: string }>(
      `SELECT institution, degree, field, details_json FROM education WHERE user_id = ?`,
      [userId]
    ),
    db.get<{ prefs_json?: string }>(`SELECT prefs_json FROM user_preferences WHERE user_id = ?`, [userId]),
  ]);

  if (!skillsRows.length && !employmentRows.length && !educationRows.length) return empty();

  const titles = employmentRows.map((e) => e.title);
  const employers = (employmentRows as any[]).map((e) => e.organization_name).filter(Boolean);
  const yearsTotal = employmentRows.reduce((sum, e) => {
    const start = e.start_date ? new Date(e.start_date).getTime() : Date.parse("2021-01-01");
    const end = e.current ? Date.now() : e.end_date ? new Date(e.end_date).getTime() : start;
    return sum + Math.max(0, (end - start) / (365.25 * 86400000));
  }, 0);

  let gradeLevel: ProfileIndex["gradeLevel"] = "UNKNOWN";
  for (const ed of educationRows) {
    const details = parseJSON<{ grade?: string; classification?: string }>(ed.details_json, {});
    const g = `${details.grade ?? ""} ${details.classification ?? ""}`.toLowerCase();
    if (g.includes("first class") && !g.includes("second")) gradeLevel = "FIRST";
    else if (g.includes("upper")) gradeLevel = gradeLevel === "FIRST" ? "FIRST" : "UPPER_SECOND";
    else if (g.includes("lower")) gradeLevel = gradeLevel === "UNKNOWN" ? "LOWER_SECOND" : gradeLevel;
  }

  const prefs = parseJSON<{ domains?: string[]; preferredSectors?: string[] }>(prefsRow?.prefs_json, {});
  const sectors = prefs.preferredSectors || prefs.domains || [];

  const degrees = educationRows.map((e) => {
    const details = parseJSON<{ grade?: string; classification?: string }>(e.details_json, {});
    return { degree: e.degree || "", field: e.field, institution: e.institution, grade: details.grade || details.classification };
  });

  const employmentHighlights = employmentRows
    .flatMap((e) => parseJSON<string[]>(e.responsibilities_json, []))
    .join(" ");

  const textBlob = [
    skillsRows.map((s) => `${s.name} ${s.category ?? ""}`).join(" "),
    titles.join(" "),
    employers.join(" "),
    projectRows.map((p) => `${p.name} ${p.overview ?? ""} ${p.category ?? ""}`).join(" "),
    degrees.map((d) => `${d.degree} ${d.field ?? ""} ${d.institution}`).join(" "),
    sectors.join(" "),
    employmentHighlights,
  ]
    .join(" ")
    .toLowerCase();

  return {
    skills: skillsRows.map((s) => ({
      name: s.name,
      category: s.category ?? undefined,
      proficiency: proficiencyToLevel(s.proficiency),
      years: s.years ?? null,
    })),
    titles,
    employers,
    projects: projectRows.map((p) => ({ name: p.name, overview: p.overview })),
    degrees,
    certificates: [], // certificates live inside education/details_json until a dedicated table exists
    sectors,
    hasBachelor: educationRows.some((e) => /bachelor|b\.sc|bsc|beng|b\.eng/i.test(`${e.degree ?? ""} ${e.field ?? ""}`)),
    gradeLevel,
    yearsTotal: Math.round(yearsTotal * 10) / 10,
    textBlob,
  };
}
