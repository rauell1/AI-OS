// Transparent, deterministic scoring engines.
//
// Every score is computed from structured data and is fully explainable.
// AI may later *enhance* these (e.g. semantic requirement matching) but the
// baseline logic below always works, even with no AI provider configured.

export interface ScoreDimension {
  key: string;
  label: string;
  score: number; // 0..100
  weight: number; // 0..1
  note: string;
}

export interface ScoreResult {
  overall: number; // 0..100
  dimensions: ScoreDimension[];
  explanation: string[]; // human-readable reasons
  recommendation: "Strong Apply" | "Apply" | "Consider" | "Low Priority" | "Skip";
}

export type ProfileContext = {
  skillNames: string[];
  skillMap: Record<string, { years?: number; proficiency?: string }>;
  sectors: string[];
  employmentTitles: string[];
  employmentOrgs: string[];
  locations: string[];
  hasEngineeringDegree: boolean;
  yearsExperience: number;
  preferredGeos: string[];
  preferredSectors: string[];
  languages: string[];
  tools: string[];
};

function fuzzyHas(list: string[], needle: string): boolean {
  const n = needle.toLowerCase();
  return list.some((x) => {
    const t = x.toLowerCase();
    return t.includes(n) || n.includes(t);
  });
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function weighted(dimensions: ScoreDimension[]): number {
  const totalW = dimensions.reduce((s, d) => s + d.weight, 0) || 1;
  const sum = dimensions.reduce((s, d) => s + d.score * d.weight, 0);
  return clamp(sum / totalW);
}

function recommend(score: number): ScoreResult["recommendation"] {
  if (score >= 85) return "Strong Apply";
  if (score >= 70) return "Apply";
  if (score >= 55) return "Consider";
  if (score >= 35) return "Low Priority";
  return "Skip";
}

// ---------------------------------------------------------------------------
// Job / role scoring
// ---------------------------------------------------------------------------

export interface JobInput {
  title: string;
  description?: string;
  requirements?: string[]; // required skills / competencies
  location?: string;
  remote?: boolean;
  compensation?: string;
  sector?: string;
  seniority?: string;
}

export function scoreJob(job: JobInput, profile: ProfileContext): ScoreResult {
  const reqs = (job.requirements || []).map((r) => r.toLowerCase());
  const title = (job.title || "").toLowerCase();
  const desc = (job.description || "").toLowerCase();

  // Skills match
  let matched = 0;
  const evidence: string[] = [];
  if (reqs.length) {
    for (const r of reqs) {
      const hit = profile.skillNames.find((s) => s.toLowerCase().includes(r) || r.includes(s.toLowerCase()));
      if (hit) {
        matched++;
        evidence.push(hit);
      }
    }
  } else {
    // infer from description keywords vs known skills
    for (const s of profile.skillNames) {
      if (desc.includes(s.toLowerCase())) {
        matched++;
        evidence.push(s);
      }
    }
  }
  const denom = Math.max(reqs.length || Math.min(profile.skillNames.length, 5), 1);
  const skillsScore = clamp((matched / denom) * 100);

  // Experience match: titles in employment that overlap with role domain
  const expKeywords = ["engineer", "sales", "operations", "technical", "energy", "mobility", "water", "project", "analyst", "consultant"];
  const expOverlap = expKeywords.filter((k) => title.includes(k) && profile.employmentTitles.some((t) => t.toLowerCase().includes(k))).length;
  const experienceScore = clamp(40 + expOverlap * 18 + Math.min(profile.yearsExperience * 3, 30));

  // Education match
  const eduRelevant = /engineer|energy|renewable|solar|water|electric|mobility|sustainab|climate|infrastructure|data|software|systems/i.test(title + " " + (job.sector || ""));
  const educationScore = profile.hasEngineeringDegree && eduRelevant ? 92 : profile.hasEngineeringDegree ? 70 : 45;

  // Sector match
  const sector = (job.sector || title || "").toLowerCase();
  const sectorHit = profile.preferredSectors.some((s) => sector.includes(s) || s.includes(sector)) || profile.sectors.some((s) => sector.includes(s));
  const sectorScore = sectorHit ? 95 : /engineer|energy|renewable|solar|water|electric|mobility|sustainab|climate|infrastructure|data|software|systems|operations/i.test(sector) ? 78 : 50;

  // Location fit
  const loc = (job.location || "").toLowerCase();
  let locationScore = 60;
  if (job.remote) locationScore = 90;
  else if (/kenya|nairobi|east africa|remote|africa/i.test(loc)) locationScore = 95;
  else if (loc && !/kenya|nairobi/i.test(loc)) locationScore = 55;
  const geoPreference = profile.preferredGeos.some((g) => loc.includes(g.toLowerCase()));
  if (geoPreference) locationScore = 88;

  // Growth potential
  const growthKeywords = ["lead", "senior", "principal", "manager", "head", "architect", "strategy", "innovation", "research"];
  const growthScore = growthKeywords.some((k) => title.includes(k)) ? 85 : 65;

  // Application effort (inverse): more requirements = more effort = lower
  const effortScore = clamp(95 - Math.min((reqs.length || 4) * 6, 45));

  const dimensions: ScoreDimension[] = [
    { key: "skills", label: "Skills match", score: skillsScore, weight: 0.28, note: `${matched} of ${denom} requirements matched by evidence.` },
    { key: "experience", label: "Experience match", score: experienceScore, weight: 0.2, note: `${profile.yearsExperience} years across relevant engineering and operations roles.` },
    { key: "education", label: "Education match", score: educationScore, weight: 0.15, note: profile.hasEngineeringDegree ? "BSc Agricultural & Biosystems Engineering (JKUAT)." : "Degree not detected." },
    { key: "sector", label: "Sector alignment", score: sectorScore, weight: 0.17, note: sectorHit ? "Sector aligns with Roy's focus areas." : "Adjacent to focus areas." },
    { key: "location", label: "Location / remote fit", score: locationScore, weight: 0.1, note: job.remote ? "Remote-friendly." : loc || "Location unspecified." },
    { key: "growth", label: "Growth potential", score: growthScore, weight: 0.05, note: "Based on role seniority signals." },
    { key: "effort", label: "Application effort", score: effortScore, weight: 0.05, note: `${(reqs.length || 4)} requirements to address.` },
  ];

  const overall = weighted(dimensions);
  const explanation = [
    `Skills match ${skillsScore}% (${evidence.slice(0, 4).join(", ") || "none directly mapped"}).`,
    `Sector alignment ${sectorScore}%, location fit ${locationScore}%.`,
    `Education ${educationScore}%, experience ${experienceScore}%.`,
  ];
  return { overall, dimensions, explanation, recommendation: recommend(overall) };
}

// ---------------------------------------------------------------------------
// Scholarship / Master's / programme scoring
// ---------------------------------------------------------------------------

export interface ProgrammeInput {
  title: string;
  funding?: string; // e.g. "fully funded"
  tuitionCovered?: boolean;
  livingAllowance?: boolean;
  travelAllowance?: boolean;
  englishRequirement?: string; // "required" | "waiver possible" | "none"
  admissionCompetitiveness?: "low" | "moderate" | "high" | "very high";
  careerRelevance?: number; // 0..100
  deadline?: string;
  applicationFee?: number;
  field?: string;
}

export function scoreProgramme(p: ProgrammeInput, profile: ProfileContext): ScoreResult {
  const fundingText = (p.funding || "").toLowerCase();
  let fundingScore = 50;
  if (/fully funded|full funding|fully-funded/.test(fundingText)) fundingScore = 98;
  else if (/partial|scholarship/.test(fundingText)) fundingScore = 70;
  else if (p.tuitionCovered && p.livingAllowance) fundingScore = 95;
  else if (p.tuitionCovered) fundingScore = 80;

  const livingScore = p.livingAllowance ? 95 : p.travelAllowance ? 70 : 50;
  const travelScore = p.travelAllowance ? 90 : 55;

  const engRelevant = /renewable|energy|solar|electric|mobility|sustainab|climate|water|smart grid|infrastructure|environment|data|ai|engineering|systems|hydrogen|battery|power/i.test(p.title + " " + (p.field || ""));
  const academicFit = profile.hasEngineeringDegree ? (engRelevant ? 90 : 70) : 50;

  const eligCompetMap: Record<string, number> = { "low": 90, "moderate": 75, "high": 55, "very high": 38 };
  const competitivenessScore = eligCompetMap[p.admissionCompetitiveness || "moderate"] ?? 70;

  const english = (p.englishRequirement || "").toLowerCase();
  let englishScore = 70;
  if (english.includes("none")) englishScore = 98;
  else if (english.includes("waiver")) englishScore = 80;
  else if (english.includes("required")) englishScore = 60;

  const careerScore = p.careerRelevance ?? (engRelevant ? 85 : 60);

  const deadlineDays = p.deadline ? Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000) : null;
  let deadlineScore = 70;
  if (deadlineDays == null) deadlineScore = 60;
  else if (deadlineDays < 0) deadlineScore = 5;
  else if (deadlineDays < 14) deadlineScore = 30;
  else if (deadlineDays < 45) deadlineScore = 65;
  else if (deadlineDays < 120) deadlineScore = 90;
  else deadlineScore = 80;

  const effortScore = clamp(95 - Math.min((p.applicationFee || 0) > 0 ? 10 : 0, 30) - (p.englishRequirement?.includes("required") ? 8 : 0));

  const dimensions: ScoreDimension[] = [
    { key: "funding", label: "Funding quality", score: fundingScore, weight: 0.24, note: p.funding || (p.tuitionCovered ? "Tuition covered" : "Funding unspecified.") },
    { key: "living", label: "Living-cost coverage", score: livingScore, weight: 0.12, note: p.livingAllowance ? "Living allowance included." : "Not specified." },
    { key: "travel", label: "Travel funding", score: travelScore, weight: 0.08, note: p.travelAllowance ? "Travel allowance included." : "Not specified." },
    { key: "academic", label: "Academic fit", score: academicFit, weight: 0.16, note: engRelevant ? "Engineering programme, degree compatible." : "Degree partially compatible." },
    { key: "competitiveness", label: "Admission competitiveness", score: competitivenessScore, weight: 0.12, note: p.admissionCompetitiveness || "Unknown." },
    { key: "english", label: "English requirement", score: englishScore, weight: 0.08, note: p.englishRequirement || "Unknown." },
    { key: "career", label: "Career relevance", score: careerScore, weight: 0.12, note: "Relevance to energy/sustainability career." },
    { key: "deadline", label: "Deadline feasibility", score: deadlineScore, weight: 0.05, note: deadlineDays == null ? "No deadline set." : `${deadlineDays} days remaining.` },
    { key: "effort", label: "Application effort", score: effortScore, weight: 0.03, note: "Fee and language burden." },
  ];

  const overall = weighted(dimensions);
  return { overall, dimensions, explanation: [
    `Funding ${fundingScore}% (${p.funding || "unspecified"}).`,
    `Academic fit ${academicFit}%, competitiveness ${competitivenessScore}%.`,
    `Deadline feasibility ${deadlineScore}%.`,
  ], recommendation: recommend(overall) };
}

// ---------------------------------------------------------------------------
// Task / action prioritization (for the Daily Brief)
// ---------------------------------------------------------------------------

export interface PriorityInput {
  dueDate?: string;
  basePriority?: number; // 1..5 (5 highest)
  strategic?: boolean; // linked to a goal
  effortMinutes?: number;
  category?: string;
  overdueToleranceDays?: number;
}

export function scorePriority(t: PriorityInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 30;

  const base = t.basePriority ?? 3;
  score += base * 6; // up to +30
  reasons.push(`Base priority ${base}/5.`);

  if (t.dueDate) {
    const days = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / 86400000);
    if (days < 0) { score += 35; reasons.push(`Overdue by ${Math.abs(days)} day(s).`); }
    else if (days === 0) { score += 30; reasons.push("Due today."); }
    else if (days <= 2) { score += 22; reasons.push(`Due in ${days} day(s).`); }
    else if (days <= 7) { score += 12; reasons.push(`Due in ${days} day(s).`); }
    else if (days <= 30) { score += 4; }
  } else {
    reasons.push("No deadline set.");
  }

  if (t.strategic) { score += 14; reasons.push("Linked to a strategic goal."); }
  if (t.effortMinutes && t.effortMinutes <= 30) { score += 6; reasons.push("Quick win (<30 min)."); }

  return { score: clamp(score), reasons };
}
