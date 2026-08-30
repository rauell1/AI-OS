import { getDb } from "./db";

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

// Superseded by buildProfileIndex() in src/lib/scoring/profile-index.ts, which
// all scoring engines (job, scholarship, lead, CV requirement matching) share.
