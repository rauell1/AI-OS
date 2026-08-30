import type { MasterProfile } from "./profile";
import { matchRequirement } from "./scoring/match";
import { proficiencyToLevel, type ProfileIndex } from "./scoring/profile-index";
import { parseJSON } from "./utils";

export interface RequirementMatch {
  requirement: string;
  evidence: string[];
  strength: "strong" | "developing" | "partial" | "missing";
  note: string;
}

/** Build a scoring-engine ProfileIndex from an already-loaded MasterProfile (no extra queries). */
export function profileIndexFromMasterProfile(profile: MasterProfile): ProfileIndex {
  const yearsTotal = profile.employment.reduce((sum: number, e: any) => {
    const start = e.start_date ? new Date(e.start_date).getTime() : Date.parse("2021-01-01");
    const end = e.current ? Date.now() : e.end_date ? new Date(e.end_date).getTime() : start;
    return sum + Math.max(0, (end - start) / (365.25 * 86400000));
  }, 0);

  const employers = profile.organizations.length
    ? profile.organizations.map((o: any) => o.name)
    : [];

  const textBlob = [
    profile.skills.map((s: any) => `${s.name} ${s.category ?? ""}`).join(" "),
    profile.employment.map((e: any) => e.title).join(" "),
    employers.join(" "),
    profile.projects.map((p: any) => `${p.name} ${p.overview ?? ""} ${p.category ?? ""}`).join(" "),
    profile.education.map((e: any) => `${e.degree ?? ""} ${e.field ?? ""} ${e.institution}`).join(" "),
    profile.employment.flatMap((e: any) => parseJSON<string[]>(e.responsibilities_json, [])).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return {
    skills: profile.skills.map((s: any) => ({
      name: s.name,
      category: s.category ?? undefined,
      proficiency: proficiencyToLevel(s.proficiency),
      years: s.years ?? null,
    })),
    titles: profile.employment.map((e: any) => e.title),
    employers,
    projects: profile.projects.map((p: any) => ({ name: p.name, overview: p.overview })),
    degrees: profile.education.map((e: any) => ({
      degree: e.degree || "",
      field: e.field,
      institution: e.institution,
      grade: parseJSON<{ grade?: string; classification?: string }>(e.details_json, {}).grade
        || parseJSON<{ grade?: string; classification?: string }>(e.details_json, {}).classification,
    })),
    certificates: [],
    sectors: [],
    hasBachelor: profile.education.some((e: any) => /bachelor|b\.sc|bsc|beng|b\.eng/i.test(`${e.degree ?? ""} ${e.field ?? ""}`)),
    gradeLevel: "UNKNOWN",
    yearsTotal: Math.round(yearsTotal * 10) / 10,
    textBlob,
  };
}

const STRENGTH_MAP: Record<string, RequirementMatch["strength"]> = {
  STRONG: "strong",
  MODERATE: "partial",
  DEVELOPING: "developing",
  MISSING: "missing",
};

const NOTE_MAP: Record<RequirementMatch["strength"], string> = {
  strong: "Supported by verified experience.",
  partial: "Referenced through employment, projects, or a moderate skill match.",
  developing: "Partial signal only — present as developing exposure, not expertise.",
  missing: "No direct evidence found in the master profile.",
};

/**
 * Evidence-based requirement matching: synonym-aware, honesty-invariant
 * (a developing skill is never labelled strong). See src/lib/scoring/match.ts.
 */
export function matchRequirements(profile: MasterProfile, requirements: string[]): RequirementMatch[] {
  const index = profileIndexFromMasterProfile(profile);
  return requirements.map((req) => {
    const m = matchRequirement(req, index);
    const strength = STRENGTH_MAP[m.strength];
    return {
      requirement: req,
      evidence: Array.from(new Set(m.evidence.map((e) => e.label))).slice(0, 4),
      strength,
      note: NOTE_MAP[strength],
    };
  });
}

export function generateCV(profile: MasterProfile, roleTitle?: string): string {
  const name = profile.user?.name || "Roy Okola Otieno";
  const lines: string[] = [];
  lines.push(name.toUpperCase());
  lines.push(profile.headline || "");
  lines.push(`Email: ${profile.user?.email || ""}  |  Location: ${profile.profile?.location || "Nairobi, Kenya"}`);
  lines.push("");
  lines.push("PROFESSIONAL SUMMARY");
  lines.push("--------------------");
  lines.push(profile.summary || "");
  lines.push("");
  lines.push("CORE COMPETENCIES");
  lines.push("------------------");
  const byCat: Record<string, string[]> = {};
  for (const s of profile.skills) {
    const cat = s.category || "General";
    byCat[cat] = byCat[cat] || [];
    byCat[cat].push(`${s.name} (${s.proficiency || "experienced"})`);
  }
  for (const [cat, items] of Object.entries(byCat)) lines.push(`${cat}: ${items.join(", ")}`);
  lines.push("");
  lines.push("PROFESSIONAL EXPERIENCE");
  lines.push("-----------------------");
  for (const e of profile.employment) {
    const dates = `${e.start_date || ""} to ${e.current ? "Present" : e.end_date || ""}`;
    lines.push(`${e.title} — ${e.location || ""} (${dates})`);
    const resp = parseJSON<string[]>(e.responsibilities_json, []);
    for (const r of resp.slice(0, 6)) lines.push(`  - ${r}`);
    lines.push("");
  }
  lines.push("EDUCATION");
  lines.push("---------");
  for (const ed of profile.education) {
    lines.push(`${ed.degree} in ${ed.field} — ${ed.institution} (${ed.start_year || ""}-${ed.end_year || "present"})`);
    const d = parseJSON<{ classification?: string; finalProject?: string }>(ed.details_json, {});
    if (d?.classification) lines.push(`  ${d.classification}`);
    if (d?.finalProject) lines.push(`  Final project: ${d.finalProject}`);
  }
  lines.push("");
  lines.push("SELECTED PROJECTS");
  lines.push("-----------------");
  for (const p of profile.projects.slice(0, 5)) {
    lines.push(`${p.name} (${p.category})`);
    if (p.overview) lines.push(`  ${p.overview}`);
  }
  if (roleTitle) {
    lines.push("");
    lines.push(`This CV is tailored toward: ${roleTitle}`);
  }
  return lines.join("\n");
}

export function generateCoverLetter(profile: MasterProfile, roleTitle: string, orgName?: string, notes?: string): string {
  const name = profile.user?.name || "Roy Okola Otieno";
  const headline = profile.headline || "";
  const org = orgName || "your organization";
  const para: string[] = [];
  para.push(`Dear Hiring Team at ${org},`);
  para.push("");
  para.push(
    `I am writing to express my interest in the ${roleTitle} position at ${org}. I am a Kenyan Agricultural and Biosystems Engineer with hands-on experience across renewable energy, electric mobility infrastructure, and water systems. My background combines field engineering, technical operations, and product building, which I believe is a strong fit for this role.`
  );
  para.push("");
  para.push(
    `At Roam Electric I contributed to EV charging infrastructure deployment, site assessment, and technical sales and operations, working across fast and slow charging, partner engagement, and rollout coordination. At Frisco Engineering I delivered off-grid borehole and groundwater engineering in remote environments, including pump troubleshooting, rehabilitation, and client communication. These roles gave me practical experience with the kind of infrastructure and stakeholder work this position requires.`
  );
  para.push("");
  para.push(
    `Beyond field work, I build decision-support engineering software. My SafariCharge platform models solar PV, batteries, and EV charging with transparent, reproducible simulations, which has sharpened my energy modelling, data analysis, and product skills. I also hold a BSc in Agricultural and Biosystems Engineering from JKUAT, where my final-year project on solar evaporative cooling for tomatoes demonstrated more than 40 percent improvement in produce shelf life.`
  );
  if (notes) {
    para.push("");
    para.push(notes);
  }
  para.push("");
  para.push(
    `I am motivated by work that connects engineering, energy access, and practical impact. I would welcome the chance to discuss how my experience with ${headline.toLowerCase()} can contribute to ${org}. Thank you for your consideration.`
  );
  para.push("");
  para.push(`Sincerely,`);
  para.push(name);
  return para.join("\n");
}
