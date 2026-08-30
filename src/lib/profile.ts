import { getDb } from "./db";
import { parseJSON, toJSON } from "./utils";
import type { ProfileContext } from "./scoring";

export interface MasterProfile {
  user: any;
  profile: any;
  headline: string;
  summary: string;
  education: any[];
  employment: any[];
  skills: any[];
  organizations: any[];
  projects: any[];
  goals: any[];
  references: any[];
  courses: any[];
}

export async function getMasterProfile(userId: string): Promise<MasterProfile> {
  const db = await getDb();
  const user = await db.get(`SELECT id, email, name, role, created_at FROM users WHERE id = ?`, [userId]);
  const profile = await db.get(`SELECT * FROM profiles WHERE user_id = ?`, [userId]);
  const [education, employment, skills, organizations, projects, goals, references_, courses] = await Promise.all([
    db.query(`SELECT * FROM education WHERE user_id = ? ORDER BY end_year DESC, start_year DESC`, [userId]),
    db.query(`SELECT * FROM employment WHERE user_id = ? ORDER BY current DESC, start_date DESC`, [userId]),
    db.query(`SELECT * FROM skills WHERE user_id = ? ORDER BY confidence DESC, name ASC`, [userId]),
    db.query(`SELECT * FROM organizations WHERE user_id = ? ORDER BY name ASC`, [userId]),
    db.query(`SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC`, [userId]),
    db.query(`SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC`, [userId]),
    db.query(`SELECT * FROM references_ WHERE user_id = ? ORDER BY name ASC`, [userId]),
    db.query(`SELECT * FROM education WHERE user_id = ? AND details_json LIKE '%course%'`, [userId]),
  ]);
  return {
    user,
    profile,
    headline: profile?.headline || "Agricultural & Biosystems Engineer | Renewable Energy & EV Infrastructure",
    summary: profile?.summary || "",
    education,
    employment,
    skills,
    organizations,
    projects,
    goals,
    references: references_,
    courses,
  };
}

export async function getProfileContext(userId: string): Promise<ProfileContext> {
  const db = await getDb();
  const [skills, employment, education, projects, goals, prefs] = await Promise.all([
    db.query<{ name: string; years?: number; proficiency?: string; category?: string }>(
      `SELECT name, years, proficiency, category FROM skills WHERE user_id = ?`,
      [userId]
    ),
    db.query<{ title: string; role_category?: string; organization_id?: string }>(
      `SELECT title, role_category, organization_id FROM employment WHERE user_id = ?`,
      [userId]
    ),
    db.query<{ field?: string; degree?: string }>(`SELECT field, degree FROM education WHERE user_id = ?`, [userId]),
    db.query<{ category?: string; overview?: string }>(`SELECT category, overview FROM projects WHERE user_id = ?`, [userId]),
    db.query<{ title: string }>(`SELECT title FROM goals WHERE user_id = ?`, [userId]),
    db.get<any>(`SELECT prefs_json FROM user_preferences WHERE user_id = ?`, [userId]),
  ]);

  const pref = parseJSON<{ preferredGeos?: string[]; preferredSectors?: string[]; languages?: string[] }>(prefs?.prefs_json, {});
  const preferredSectors = pref.preferredSectors || [
    "renewable energy", "solar", "ev", "electric mobility", "water", "energy", "climate", "sustainability", "data", "software", "infrastructure",
  ];
  const preferredGeos = pref.preferredGeos || ["kenya", "nairobi", "east africa", "europe", "remote"];

  const skillNames = skills.map((s) => s.name);
  const skillMap: Record<string, { years?: number; proficiency?: string }> = {};
  for (const s of skills) skillMap[s.name.toLowerCase()] = { years: s.years, proficiency: s.proficiency };
  const sectors = Array.from(new Set([...employment.map((e) => e.role_category).filter(Boolean), "renewable energy", "ev infrastructure", "water systems"])) as string[];
  const employmentTitles = employment.map((e) => e.title);
  const employmentOrgs = employment.map((e) => e.organization_id).filter(Boolean) as string[];
  const locations = ["Nairobi, Kenya"];
  const hasEngineeringDegree = education.some((e) => /engineer|biosystems|agricultural/i.test(e.field || e.degree || "")) || education.length > 0;
  const yearsExperience = Math.max(2, ...employment.map((e) => (e.role_category ? 2 : 1)));
  const languages = pref.languages || ["English", "Swahili"];


  return {
    skillNames,
    skillMap,
    sectors,
    employmentTitles,
    employmentOrgs,
    locations,
    hasEngineeringDegree,
    yearsExperience,
    preferredGeos,
    preferredSectors,
    languages,
    tools: [],
  };
}
