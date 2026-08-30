import type { MasterProfile } from "./profile";

export interface RequirementMatch {
  requirement: string;
  evidence: string[];
  strength: "strong" | "developing" | "partial" | "missing";
  note: string;
}

function collectEvidence(profile: MasterProfile): { text: string; proficiency?: string }[] {
  const out: { text: string; proficiency?: string }[] = [];
  for (const s of profile.skills) out.push({ text: s.name, proficiency: s.proficiency });
  for (const e of profile.employment) {
    out.push({ text: e.title });
    const resp = Array.isArray(e.responsibilities_json) ? e.responsibilities_json : [];
    for (const r of resp as string[]) out.push({ text: r });
  }
  for (const ed of profile.education) out.push({ text: `${ed.institution} ${ed.degree} ${ed.field}` });
  for (const p of profile.projects) out.push({ text: `${p.name} ${p.overview || ""}` });
  return out;
}

export function matchRequirements(profile: MasterProfile, requirements: string[]): RequirementMatch[] {
  const corpus = collectEvidence(profile);
  return requirements.map((req) => {
    const needle = req.toLowerCase();
    const hits = corpus.filter((c) => c.text.toLowerCase().includes(needle) || needle.includes(c.text.toLowerCase()));
    const skillHit = profile.skills.find((s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase()));
    let strength: RequirementMatch["strength"] = "missing";
    let note = "No direct evidence found in the master profile.";
    if (skillHit) {
      const prof = (skillHit.proficiency || "").toLowerCase();
      if (prof.includes("develop")) { strength = "developing"; note = "Listed as a developing skill, present but not yet expert."; }
      else if (prof.includes("advanced") || prof.includes("proficient")) { strength = "strong"; note = "Supported by verified experience."; }
      else { strength = "partial"; note = "Mentioned in profile."; }
    } else if (hits.length) {
      strength = "partial";
      note = "Referenced through employment or projects.";
    }
    return {
      requirement: req,
      evidence: Array.from(new Set(hits.slice(0, 4).map((h) => h.text))).slice(0, 4),
      strength,
      note,
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
    const resp = Array.isArray(e.responsibilities_json) ? (e.responsibilities_json as string[]) : [];
    for (const r of resp.slice(0, 6)) lines.push(`  - ${r}`);
    lines.push("");
  }
  lines.push("EDUCATION");
  lines.push("---------");
  for (const ed of profile.education) {
    lines.push(`${ed.degree} in ${ed.field} — ${ed.institution} (${ed.start_year || ""}-${ed.end_year || "present"})`);
    const d = ed.details_json;
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
