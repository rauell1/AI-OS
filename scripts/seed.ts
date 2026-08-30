import "./load-env";
import { getDb } from "../src/lib/db";
import { newId, nowISO, toJSON, parseJSON } from "../src/lib/utils";
import { SEED } from "../src/lib/seed-data";
import { hashPassword } from "../src/lib/auth";
import { getProfileContext } from "../src/lib/profile";
import { scoreJob, scoreProgramme, type ProfileContext } from "../src/lib/scoring";

async function wipeUser(db: any, email: string) {
  const u = await db.get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase()]);
  if (!u) return;
  const uid = u.id;
  const tables = [
    "activity_events", "notifications", "approvals", "audit_logs", "goals",
    "projects", "employment", "education", "skills", "skill_evidence",
    "organizations", "people", "links", "opportunities", "opportunity_scores",
    "applications", "tasks", "emails", "documents", "references_", "leads",
    "notes", "knowledge_items", "automation_rules", "user_preferences", "profiles",
  ];
  for (const t of tables) {
    await db.run(`DELETE FROM ${t} WHERE user_id = ?`, [uid]);
  }
  await db.run(`DELETE FROM users WHERE id = ?`, [uid]);
}

async function main() {
  if (!SEED.user.password) {
    console.error(
      "Refusing to seed: SEED_PASSWORD is not set.\n" +
        "The seed account previously fell back to a password committed to this\n" +
        "repository, which is a real credential on any reachable deployment.\n\n" +
        "Run with an explicit secret, e.g.:\n" +
        "  SEED_PASSWORD='<a strong password>' npm run db:seed\n\n" +
        "SEED_EMAIL and SEED_NAME can override the seeded identity."
    );
    process.exit(1);
  }
  if (SEED.user.password.length < 8) {
    console.error("Refusing to seed: SEED_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }
  const db = await getDb();
  const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [SEED.user.email.toLowerCase()]);
  if (existing && !process.env.SEED_FORCE) {
    console.log(`Seed skipped: user ${SEED.user.email} already exists. Set SEED_FORCE=1 to reseed.`);
    process.exit(0);
  }
  if (existing) {
    console.log("SEED_FORCE set: wiping existing seed...");
    await wipeUser(db, SEED.user.email);
  }

  const userId = newId("usr");
  await db.insert("users", {
    id: userId,
    email: SEED.user.email.toLowerCase(),
    name: SEED.user.name,
    password_hash: hashPassword(SEED.user.password),
    role: "owner",
    timezone: "Africa/Nairobi",
    settings_json: toJSON({ theme: "dark" }),
    created_at: nowISO(),
  });
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
  const ctx: ProfileContext = await getProfileContext(userId);
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
      preferredSectors: ctx.preferredSectors,
      preferredGeos: ctx.preferredGeos,
      languages: ctx.languages,
      opportunityTypes: ["job", "programme", "scholarship", "fellowship", "grant"],
      aiProvider: process.env.AI_DEFAULT_PROVIDER || "openai",
    }),
    created_at: nowISO(),
    updated_at: nowISO(),
  });

  // Sample opportunities (real public programmes + a sample job) with scoring
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
    let score;
    if (op.type === "job") {
      score = scoreJob(
        {
          title: op.title,
          description: op.description,
          requirements: structured.requirements || [],
          location: op.location,
          remote: op.remote,
          compensation: op.compensation,
          sector: structured.sector,
          seniority: structured.seniority,
        },
        ctx
      );
    } else {
      score = scoreProgramme(
        {
          title: op.title,
          funding: structured.funding,
          tuitionCovered: structured.tuitionCovered,
          livingAllowance: structured.livingAllowance,
          travelAllowance: structured.travelAllowance,
          englishRequirement: structured.englishRequirement,
          admissionCompetitiveness: structured.admissionCompetitiveness,
          careerRelevance: structured.careerRelevance,
          deadline: op.deadline ?? undefined,
          applicationFee: structured.applicationFee,
          field: structured.field,
        },
        ctx
      );
    }
    await db.insert("opportunity_scores", {
      id: newId("osc"),
      opportunity_id: oid,
      model: "deterministic-v1",
      overall: score.overall,
      dimensions_json: toJSON(score.dimensions),
      explanation: score.explanation.join(" "),
      recommendation: score.recommendation,
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

  console.log(`Seeded Rauell OS for ${SEED.user.email} (id=${userId}).`);
  console.log(`Login password: ${SEED.user.password}`);
  console.log("Run: npm run dev");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
