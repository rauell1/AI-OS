import "./load-env";
import { getDb, runAsSystem } from "../src/lib/db";
import { newId, nowISO, toJSON, parseJSON } from "../src/lib/utils";
import { SEED, seedTargetEmail } from "../src/lib/seed-data";
import { hashPassword } from "../src/lib/auth";
import { scoreJob, scoreScholarship, buildProfileIndex } from "../src/lib/scoring";
import { USER_SCOPED, CHILD_SCOPED } from "../src/lib/rls";

const DEFAULT_PREFERRED_SECTORS = ["renewable energy", "solar", "ev", "electric mobility", "water", "energy", "climate", "sustainability", "data", "software", "infrastructure"];
const DEFAULT_PREFERRED_GEOS = ["kenya", "nairobi", "east africa", "europe", "remote"];
const DEFAULT_LANGUAGES = ["English", "Swahili"];

function normalizeFundingType(text?: string): string | undefined {
  const t = (text || "").toLowerCase();
  if (!t) return undefined;
  if (/fully[- ]?funded|full funding/.test(t)) return "FULLY_FUNDED";
  if (/self[- ]?funded/.test(t)) return "SELF_FUNDED";
  if (/tuition only/.test(t)) return "TUITION_ONLY";
  if (/partial|scholarship/.test(t)) return "PARTIAL";
  return undefined;
}

// Clears everything the seed owns for a user, keeping the `users` row itself:
// the account is the thing you sign in with, and reseeding must not delete it.
// Driven by the RLS table lists so a new table is covered here automatically.
async function wipeUserData(db: any, userId: string) {
  // Children first - they are reached through a parent that carries user_id.
  for (const { table, fk, parent } of CHILD_SCOPED) {
    await db.run(
      `DELETE FROM ${table} WHERE ${fk} IN (SELECT id FROM ${parent} WHERE user_id = ?)`,
      [userId]
    );
  }
  for (const table of USER_SCOPED) {
    await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
}

function targetEmail(): string {
  const email = seedTargetEmail();
  if (!email) {
    console.error(
      "Refusing to seed: neither SEED_EMAIL nor OWNER_EMAIL is set.\n\n" +
        "The seed attaches its data to one account, and row level security makes\n" +
        "that data invisible to every other account. Guessing the address would\n" +
        "silently seed a user you cannot sign in as.\n\n" +
        "Set OWNER_EMAIL to the address you sign in with, or pass SEED_EMAIL\n" +
        "explicitly to seed a different account."
    );
    process.exit(1);
  }
  return email;
}

// Has this account already been seeded? Checked across a few tables so that a
// user who has only, say, created a task by hand is not mistaken for a seeded
// one - and so a reseed does not silently double every row.
async function existingRowCount(db: any, userId: string): Promise<number> {
  let total = 0;
  for (const table of ["projects", "skills", "opportunities", "organizations", "goals"]) {
    const row = await db.get(`SELECT COUNT(*) AS c FROM ${table} WHERE user_id = ?`, [userId]);
    total += Number(row?.c) || 0;
  }
  return total;
}

async function main() {
  const email = targetEmail();
  const db = await getDb();
  const existing = await db.get<{ id: string }>(`SELECT id FROM users WHERE email = ?`, [email]);

  let userId: string;
  if (existing) {
    // The account already exists - almost always the owner, created by signing
    // up. Attach the seed data to them rather than building a second user whose
    // rows nobody can see.
    userId = existing.id;
    const rows = await existingRowCount(db, userId);
    if (rows > 0 && !process.env.SEED_FORCE) {
      console.log(
        `Seed skipped: ${email} already has ${rows} seeded row(s).\n` +
          "Set SEED_FORCE=1 to clear this account's data and seed it again."
      );
      process.exit(0);
    }
    if (rows > 0) {
      console.log(`SEED_FORCE set: clearing ${rows} existing row(s) for ${email}...`);
    }
    // Always clear, even at zero rows: profiles and user_preferences are keyed
    // by user_id, so a partial previous run would collide on insert.
    await wipeUserData(db, userId);
    console.log(`Seeding into the existing account ${email} (id=${userId}).`);
  } else {
    // No such account yet, so the seed has to create one - and that needs a
    // password. It used to fall back to one committed to this repository, which
    // is a real credential on any reachable deployment.
    if (!SEED.user.password) {
      console.error(
        `Refusing to seed: ${email} has no account yet and SEED_PASSWORD is not set.\n\n` +
          "Run with an explicit secret, e.g.:\n" +
          "  SEED_PASSWORD='<a strong password>' npm run db:seed\n\n" +
          "If the account already exists, no password is needed - check that\n" +
          "OWNER_EMAIL matches the address you sign in with."
      );
      process.exit(1);
    }
    if (SEED.user.password.length < 8) {
      console.error("Refusing to seed: SEED_PASSWORD must be at least 8 characters.");
      process.exit(1);
    }
    userId = newId("usr");
    await db.insert("users", {
      id: userId,
      email,
      name: SEED.user.name,
      password_hash: hashPassword(SEED.user.password),
      role: "owner",
      timezone: "Africa/Nairobi",
      settings_json: toJSON({ theme: "dark" }),
      created_at: nowISO(),
    });
    console.log(`Created account ${email} (id=${userId}).`);
  }

  await db.insert("profiles", {
    user_id: userId,
    headline: SEED.profile.headline,
    summary: SEED.profile.summary,
    location: SEED.profile.location,
    nationality: SEED.profile.nationality,
    linkedin_url: SEED.profile.linkedin_url,
    portfolio_url: SEED.profile.portfolio_url,
    resume_url: "",
    updated_at: nowISO(),
  });

  // Education
  for (const e of SEED.education) {
    await db.insert("education", {
      id: newId("edu"),
      user_id: userId,
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      start_year: e.start_year,
      end_year: e.end_year,
      status: e.status,
      details_json: toJSON(e.details || {}),
      verification: "user_provided",
      created_at: nowISO(),
    });
  }

  // Organizations (dedupe by name)
  const orgByName: Record<string, string> = {};
  for (const o of SEED.organizations) {
    const id = newId("org");
    await db.insert("organizations", {
      id,
      user_id: userId,
      name: o.name,
      type: o.type,
      industry: o.industry,
      location: o.location,
      website: o.website,
      notes: o.notes,
      created_at: nowISO(),
    });
    orgByName[o.name] = id;
  }

  // Employment (link org)
  const empByTitle: Record<string, string> = {};
  for (const emp of SEED.employment) {
    const id = newId("emp");
    await db.insert("employment", {
      id,
      user_id: userId,
      organization_id: orgByName[emp.orgName] || null,
      title: emp.title,
      role_category: emp.role_category,
      start_date: emp.start_date,
      end_date: emp.end_date,
      current: emp.current,
      location: emp.location,
      summary: emp.summary,
      responsibilities_json: toJSON(emp.responsibilities || []),
      verification: "user_provided",
      created_at: nowISO(),
    });
    empByTitle[emp.title] = id;
  }

  // Skills + evidence (link to org/project/employment by name)
  for (const s of SEED.skills) {
    const sid = newId("skl");
    await db.insert("skills", {
      id: sid,
      user_id: userId,
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
      years: s.years,
      last_used: nowISO(),
      confidence: 1.0,
      ai_summary: null,
      verification: "user_provided",
      created_at: nowISO(),
    });
    for (const ev of s.evidence || []) {
      let sourceType = "note";
      let sourceId: string | null = null;
      if (orgByName[ev]) { sourceType = "organization"; sourceId = orgByName[ev]; }
      else if (empByTitle[ev]) { sourceType = "employment"; sourceId = empByTitle[ev]; }
      await db.insert("skill_evidence", {
        id: newId("sev"),
        skill_id: sid,
        source_type: sourceType,
        source_id: sourceId,
        note: ev,
        created_at: nowISO(),
      });
    }
  }

  // Projects
  const projByName: Record<string, string> = {};
  for (const p of SEED.projects) {
    const id = newId("prj");
    await db.insert("projects", {
      id,
      user_id: userId,
      name: p.name,
      category: p.category,
      status: p.status,
      overview: p.overview,
      goals_json: toJSON(p.goals || []),
      decisions_json: toJSON([]),
      risks_json: toJSON([]),
      ai_summary: null,
      next_actions_json: toJSON(p.nextActions || []),
      github_json: toJSON([]),
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    projByName[p.name] = id;
  }

  // Goals
  for (const g of SEED.goals) {
    await db.insert("goals", {
      id: newId("goal"),
      user_id: userId,
      title: g.title,
      description: g.description,
      status: "active",
      linked_json: toJSON([]),
      created_at: nowISO(),
    });
  }

  // User preferences
  await db.insert("user_preferences", {
    user_id: userId,
    prefs_json: toJSON({
      preferredSectors: DEFAULT_PREFERRED_SECTORS,
      preferredGeos: DEFAULT_PREFERRED_GEOS,
      languages: DEFAULT_LANGUAGES,
      opportunityTypes: ["job", "programme", "scholarship", "fellowship", "grant"],
      aiProvider: process.env.AI_DEFAULT_PROVIDER || "openai",
    }),
    created_at: nowISO(),
    updated_at: nowISO(),
  });

  // Sample opportunities (real public programmes + a sample job) with scoring
  const profileIndex = await buildProfileIndex(userId);
  for (const op of SEED.opportunities) {
    const oid = newId("opp");
    const structured = (op.structured || {}) as Record<string, any>;
    await db.insert("opportunities", {
      id: oid,
      user_id: userId,
      type: op.type,
      title: op.title,
      organization_id: orgByName[op.orgName] || null,
      source_url: op.source_url || null,
      source_name: "Seed",
      description: op.description,
      raw_text: null,
      published_date: nowISO(),
      deadline: op.deadline || null,
      location: op.location || null,
      remote: op.remote ? 1 : 0,
      compensation: op.compensation || null,
      status: "discovered",
      structured_json: toJSON(structured),
      evidence_json: toJSON([]),
      last_verified: null,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    // Score immediately so the dashboard is meaningful.
    const deadlineAt = op.deadline ? new Date(op.deadline) : null;
    const result =
      op.type === "job"
        ? scoreJob(
            {
              title: op.title,
              requirements: structured.requirements || [],
              sectorTags: structured.sector ? [structured.sector] : [],
              location: op.location,
              remoteMode: op.remote ? "REMOTE" : null,
              deadlineAt,
            },
            profileIndex
          )
        : scoreScholarship(
            {
              title: op.title,
              fieldRequirements: structured.field ? [structured.field] : structured.requirements || [],
              englishRequirement: structured.englishRequirement || null,
              fundingType: normalizeFundingType(structured.funding) || null,
              fundingCovers: [
                ...(structured.tuitionCovered ? ["TUITION"] : []),
                ...(structured.livingAllowance ? ["STIPEND"] : []),
                ...(structured.travelAllowance ? ["TRAVEL"] : []),
              ],
              applicationFee: structured.applicationFee ?? null,
              deadlineAt,
            },
            profileIndex
          );
    const dimensions = result.factors.map((f) => ({
      key: f.dimension.toLowerCase().replace(/\s+/g, "_"),
      label: f.dimension,
      score: f.score,
      weight: f.weight,
      note: f.detail,
    }));
    await db.insert("opportunity_scores", {
      id: newId("osc"),
      opportunity_id: oid,
      model: "evidence-engine-v2",
      overall: result.score,
      dimensions_json: toJSON(dimensions),
      explanation: result.explanation,
      recommendation: result.label,
      created_at: nowISO(),
    });
  }

  // Sample tasks
  for (const t of SEED.tasks) {
    const due = t.due_in_days != null ? new Date(Date.now() + t.due_in_days * 86400000).toISOString() : null;
    await db.insert("tasks", {
      id: newId("tsk"),
      user_id: userId,
      title: t.title,
      description: null,
      source: t.source,
      source_id: null,
      project_id: null,
      opportunity_id: null,
      application_id: null,
      person_id: null,
      organization_id: null,
      due_date: due,
      priority: t.priority,
      status: t.status,
      effort: t.effort,
      ai_reasoning: t.strategic ? "Linked to a strategic goal." : null,
      completion_evidence: null,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
  }

  console.log(`Seeded Rauell OS for ${email} (id=${userId}).`);
  if (!existing) {
    console.log("Sign in with the password you passed as SEED_PASSWORD.");
  }
  process.exit(0);
}

runAsSystem(main).catch((e) => {
  console.error(e);
  process.exit(1);
});
