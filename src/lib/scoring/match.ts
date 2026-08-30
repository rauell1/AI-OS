import type { EvidencePointer } from "./types";
import type { ProfileIndex } from "./profile-index";

export type RequirementStrength = "STRONG" | "MODERATE" | "DEVELOPING" | "MISSING";

/** Domain synonym expansion: maps requirement words onto Roy's vocabulary. */
const SYNONYMS: Record<string, string[]> = {
  solar: ["solar", "pv", "photovoltaic", "safaricharge"],
  photovoltaic: ["solar", "pv", "photovoltaic"],
  pv: ["solar", "pv"],
  ev: ["ev", "electric vehicle", "e-mobility", "emobility", "charging", "roam"],
  "electric vehicle": ["ev", "electric vehicle", "charging", "e-mobility"],
  charging: ["charging", "ev", "charge point", "roam"],
  emobility: ["ev", "e-mobility", "electric", "mobility"],
  "e-mobility": ["ev", "e-mobility", "electric", "mobility"],
  energy: ["energy", "renewable", "power", "solar", "electricity"],
  renewable: ["renewable", "solar", "energy", "clean energy"],
  battery: ["battery", "storage", "bess", "soc"],
  storage: ["battery", "storage", "bess"],
  water: ["water", "borehole", "hydro", "groundwater", "pump", "irrigation"],
  borehole: ["borehole", "groundwater", "water", "pump", "frisco"],
  pump: ["pump", "borehole", "water", "ebara"],
  gis: ["gis", "geospatial", "mapping", "rcmrd", "arcgis", "qgis"],
  python: ["python", "fastapi", "pandas", "scripting", "ai"],
  typescript: ["typescript", "javascript", "node", "react", "next.js"],
  javascript: ["javascript", "typescript", "react"],
  data: ["data", "analytics", "analysis", "dashboard", "modelling"],
  modeling: ["modeling", "modelling", "simulation", "homer", "sam"],
  modelling: ["modelling", "modeling", "simulation", "homer", "sam"],
  simulation: ["simulation", "modelling", "safaricharge", "homer"],
  communication: ["communication", "stakeholder", "engagement", "liaison"],
  stakeholder: ["stakeholder", "engagement", "partner", "liaison", "coordination"],
  engagement: ["engagement", "stakeholder", "partner", "outreach"],
  sales: ["sales", "business development", "technical sales", "commercial"],
  "business development": ["business development", "sales", "lead", "outreach", "partnership"],
  "project management": ["project management", "coordination", "planning", "asana", "deployment"],
  coordination: ["coordination", "planning", "logistics", "deployment"],
  "site assessment": ["site assessment", "site", "feasibility", "vetting", "assessment"],
  feasibility: ["feasibility", "assessment", "site", "techno-economic"],
  automation: ["automation", "workflow", "scripting", "integration"],
  ai: ["ai", "artificial intelligence", "machine learning", "llm"],
  "machine learning": ["machine learning", "ai", "ml", "model"],
  climate: ["climate", "sustainability", "green", "environment"],
  sustainability: ["sustainability", "climate", "esg", "environment"],
  engineering: ["engineering", "engineer", "technical"],
  maintenance: ["maintenance", "operations", "troubleshooting", "repair"],
  operations: ["operations", "ops", "deployment", "technical operations"],
  ielts: ["ielts", "english"],
  research: ["research", "analysis", "thesis", "project"],
  dashboard: ["dashboard", "analytics", "visualization", "reporting"],
  mqtt: ["mqtt", "iot", "telemetry", "modbus"],
  iot: ["iot", "mqtt", "telemetry", "sensors"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s\-\+\.]/g, " ").replace(/\s+/g, " ").trim();
}

/** Whole-word/phrase match, so "practitioner" does not match "ai". */
function phraseIn(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(haystack);
}

function expand(term: string): string[] {
  const direct = SYNONYMS[term];
  if (direct) return [term, ...direct];
  for (const [key, syn] of Object.entries(SYNONYMS)) {
    if (phraseIn(term, key) || syn.some((s) => phraseIn(term, s))) return [term, key, ...syn];
  }
  return [term];
}

const STOPWORDS = new Set([
  "the", "and", "or", "of", "to", "a", "an", "in", "with", "for", "on", "at", "is",
  "are", "be", "will", "we", "you", "our", "their", "have", "has", "as", "by", "from",
  "that", "this", "it", "strong", "good", "excellent", "knowledge", "experience",
  "years", "year", "at least", "plus", "ability", "skills", "skill", "desired",
  "required", "requirements", "preferred", "minimum", "role", "candidate",
]);

export function extractRequirementTerms(requirement: string): string[] {
  return normalize(requirement)
    .split(" ")
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export type RequirementMatch = {
  strength: RequirementStrength;
  score: number; // 0..100
  evidence: EvidencePointer[];
  matchedOn: string[];
};

/**
 * Match a single job requirement against the profile index.
 * STRONG: direct skill with proficiency >= 4, or employer/title/project hit.
 * MODERATE: skill present with lower proficiency, or multiple synonym hits.
 * DEVELOPING: partial keyword overlap only.
 * MISSING: nothing found.
 */
export function matchRequirement(requirement: string, index: ProfileIndex): RequirementMatch {
  const req = normalize(requirement);
  if (!req) return { strength: "MISSING", score: 0, evidence: [], matchedOn: [] };

  // Direct skill hits (whole-phrase matching on skill name and synonyms)
  const skillHits = index.skills.filter((s) => {
    const n = normalize(s.name);
    if (n.length <= 2) return false;
    if (phraseIn(req, n)) return true;
    return expand(n).some((syn) => syn.length > 2 && phraseIn(req, syn));
  });

  const evidence: EvidencePointer[] = [];
  const matchedOn: string[] = [];

  let best = 0;
  let bestFromWeakSkill = false; // best hit was a skill below proficiency 4
  for (const skill of skillHits) {
    const score = Math.min(100, 55 + skill.proficiency * 9 + (skill.years && skill.years >= 2 ? 8 : 0));
    if (score > best) {
      best = score;
      bestFromWeakSkill = skill.proficiency < 4;
    }
    matchedOn.push(skill.name);
    evidence.push({
      label: `Skill: ${skill.name} (level ${skill.proficiency}/5${skill.years ? `, ${skill.years}y` : ""})`,
      refType: "SKILL",
    });
  }

  // Employer / title hits (e.g. "EV charging experience" -> Roam Electric)
  for (const employer of index.employers) {
    const n = normalize(employer);
    if (n.length > 2 && phraseIn(req, n)) {
      if (75 > best) { best = 75; bestFromWeakSkill = false; }
      matchedOn.push(employer);
      evidence.push({ label: `Work at ${employer}`, refType: "EMPLOYMENT" });
    }
  }
  for (const title of index.titles) {
    const tokens = extractRequirementTerms(title);
    const overlap = tokens.filter((t) => phraseIn(req, t)).length;
    if (overlap >= 2) {
      if (70 > best) { best = 70; bestFromWeakSkill = false; }
      matchedOn.push(title);
      evidence.push({ label: `Role history: ${title}`, refType: "EMPLOYMENT" });
    }
  }

  // Project hits
  for (const project of index.projects) {
    const p = normalize(`${project.name} ${project.overview ?? ""}`);
    const reqTerms = extractRequirementTerms(req);
    const hits = reqTerms.filter((t) => expand(t).some((syn) => phraseIn(p, syn)));
    if (hits.length >= 2 || (hits.length === 1 && project.overview && phraseIn(p, req))) {
      const projectScore = hits.length >= 2 ? 72 : 60;
      if (projectScore > best) { best = projectScore; bestFromWeakSkill = false; }
      matchedOn.push(project.name);
      evidence.push({ label: `Project: ${project.name}`, refType: "PROJECT" });
    }
  }

  // Certificate hits
  for (const cert of index.certificates) {
    const n = normalize(cert);
    if (n.length > 3 && expand(n).some((syn) => syn.length > 3 && (phraseIn(req, syn) || phraseIn(syn, req)))) {
      if (65 > best) { best = 65; bestFromWeakSkill = false; }
      matchedOn.push(cert);
      evidence.push({ label: `Certificate: ${cert}`, refType: "CERTIFICATE" });
    }
  }

  // STRONG requires concrete history (employer/project/title hit) or a
  // high-proficiency skill. A low-proficiency skill alone is MODERATE at best:
  // never upgrade developing skills to expert.
  if (best >= 70 && !bestFromWeakSkill) {
    return { strength: "STRONG", score: Math.max(best, 74), evidence, matchedOn };
  }
  if (best >= 65) {
    return { strength: "MODERATE", score: best, evidence, matchedOn };
  }

  // Text-blob based fallback
  const terms = extractRequirementTerms(req);
  if (!terms.length) return { strength: "MISSING", score: 0, evidence, matchedOn };
  const blobHits = terms.filter((t) => expand(t).some((syn) => phraseIn(index.textBlob, syn)));
  const ratio = blobHits.length / terms.length;
  if (ratio >= 0.6) {
    return {
      strength: skillHits.length ? "MODERATE" : "MODERATE",
      score: Math.max(best, Math.round(45 + ratio * 25)),
      evidence,
      matchedOn,
    };
  }
  if (ratio >= 0.3) {
    return { strength: "DEVELOPING", score: Math.max(best, Math.round(25 + ratio * 30)), evidence, matchedOn };
  }
  return { strength: "MISSING", score: Math.min(best, 15), evidence, matchedOn };
}
