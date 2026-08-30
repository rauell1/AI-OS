import { matchRequirement } from "./match";
import { buildExplanation, weightedScore, type Factor, type ScoreResult } from "./types";
import type { ProfileIndex } from "./profile-index";
import { daysUntil } from "@/lib/utils";

export type JobFitInput = {
  title: string;
  requirements?: string[] | null;
  sectorTags?: string[] | null;
  location?: string | null;
  country?: string | null;
  remoteMode?: string | null;
  deadlineAt?: Date | null;
  minQualifications?: string[] | null;
  wantsDegree?: boolean;
};

export const JOB_LABELS = ["Strong Apply", "Apply", "Consider", "Low Priority", "Skip"] as const;

export function jobLabel(score: number): (typeof JOB_LABELS)[number] {
  if (score >= 85) return "Strong Apply";
  if (score >= 70) return "Apply";
  if (score >= 55) return "Consider";
  if (score >= 40) return "Low Priority";
  return "Skip";
}

export const ROY_HOME_COUNTRY = "Kenya";

/**
 * Transparent, deterministic job fit score.
 * Every factor carries its own sub-score, weight, and evidence pointers so the
 * UI can always answer "why does this job match me?".
 */
export function scoreJob(input: JobFitInput, index: ProfileIndex): ScoreResult {
  const factors: Factor[] = [];

  // 1. Skills match (weight 30)
  const reqs = (input.requirements ?? []).filter(Boolean);
  if (reqs.length) {
    const matches = reqs.map((r) => ({ req: r, m: matchRequirement(r, index) }));
    const avg = matches.reduce((s, m) => s + m.m.score, 0) / matches.length;
    const strong = matches.filter((m) => m.m.strength === "STRONG").length;
    const missing = matches.filter((m) => m.m.strength === "MISSING").map((m) => m.req);
    factors.push({
      dimension: "Skills match",
      score: Math.round(avg),
      weight: 30,
      detail: `${strong}/${matches.length} requirements strongly evidenced${missing.length ? `; missing: ${missing.slice(0, 3).join(", ")}` : ""}`,
      evidence: matches.flatMap((m) => m.m.evidence.slice(0, 1)),
    });
  } else {
    const titleMatch = matchRequirement(input.title, index);
    factors.push({
      dimension: "Skills match",
      score: titleMatch.score,
      weight: 30,
      detail: titleMatch.matchedOn.length
        ? `Inferred from title against: ${titleMatch.matchedOn.slice(0, 3).join(", ")}`
        : "No requirements listed; matched on title only",
      evidence: titleMatch.evidence,
    });
  }

  // 2. Experience match (weight 20)
  const seniority = /senior|lead|principal|manager|head of/i.test(input.title) ? "senior"
    : /junior|graduate|intern|assistant|entry/i.test(input.title) ? "junior" : "mid";
  const needYears = seniority === "senior" ? 5 : seniority === "mid" ? 2 : 0;
  const expScore = index.yearsTotal >= needYears ? Math.min(100, 55 + index.yearsTotal * 8) : index.yearsTotal * 18;
  const titleOverlap = index.titles.some((t) => {
    const tt = t.toLowerCase();
    return input.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && (tt.includes(w))).length >= 1;
  });
  factors.push({
    dimension: "Experience match",
    score: Math.min(100, Math.round(expScore) + (titleOverlap ? 10 : 0)),
    weight: 20,
    detail: `${index.yearsTotal}y total experience vs ~${needYears}y expected for ${seniority} level${titleOverlap ? "; similar role history" : ""}`,
    evidence: index.titles.slice(0, 3).map((t) => ({ label: `Role: ${t}`, refType: "EMPLOYMENT" })),
  });

  // 3. Education match (weight 15)
  const eduText = `${(input.minQualifications ?? []).join(" ")} ${input.title}`;
  const wantsEngineering = /engineer|engineering|technical|stem|science/i.test(eduText);
  const wantsBachelors = /bachelor|b\.sc|bsc|degree|undergraduate/i.test(eduText) || input.wantsDegree === true;
  let eduScore = 70;
  let eduDetail = "Engineering degree satisfies typical technical requirements";
  if (wantsBachelors || wantsEngineering) {
    eduScore = index.hasBachelor ? 95 : 30;
    eduDetail = index.hasBachelor
      ? `B.Sc. ${index.degrees[0]?.field ?? ""} (${index.degrees[0]?.grade ?? "earned"})`.trim()
      : "No bachelor degree recorded in profile";
  }
  if (/master|m\.sc|msc/i.test(eduText)) {
    eduScore = Math.min(eduScore, 60);
    eduDetail += "; posting mentions master-level preference";
  }
  factors.push({
    dimension: "Education match",
    score: eduScore,
    weight: 15,
    detail: eduDetail,
    evidence: index.degrees.map((d) => ({
      label: `${d.degree}, ${d.institution}${d.grade ? ` (${d.grade})` : ""}`,
      refType: "EDUCATION",
    })),
  });

  // 4. Sector match (weight 15)
  const jobTags = (input.sectorTags ?? []).map((t) => t.toLowerCase());
  const jobText = `${input.title} ${reqs.join(" ")}`.toLowerCase();
  const roySectors = index.sectors.length
    ? index.sectors
    : ["renewable energy", "solar", "ev charging", "electric mobility", "water systems", "energy data", "climate tech", "engineering software"];
  const sectorHits = roySectors.filter((s) =>
    jobTags.some((t) => t.includes(s.toLowerCase()) || s.toLowerCase().includes(t)) ||
    jobText.includes(s.toLowerCase().split(" ")[0])
  );
  factors.push({
    dimension: "Sector match",
    score: Math.min(100, sectorHits.length * 34 + (jobTags.length ? 10 : 25)),
    weight: 15,
    detail: sectorHits.length
      ? `Aligned with: ${sectorHits.slice(0, 4).join(", ")}`
      : "Outside core sectors (energy, water, mobility, data)",
  });

  // 5. Location & remote suitability (weight 8)
  const remote = (input.remoteMode ?? "").toUpperCase();
  const inKenya = (input.country ?? "").toLowerCase().includes("kenya") ||
    (input.location ?? "").toLowerCase().includes("nairobi");
  const remoteOk = (index.sectors.includes("remote-ok") || true) && remote === "REMOTE";
  let locScore = 50;
  let locDetail = "Location unspecified";
  if (remote === "REMOTE") { locScore = 100; locDetail = "Fully remote"; }
  else if (remote === "HYBRID") { locScore = inKenya ? 95 : 45; locDetail = inKenya ? "Hybrid in Kenya" : "Hybrid abroad (visa needed)"; }
  else if (inKenya) { locScore = 100; locDetail = "Based in Kenya"; }
  else if (input.country) { locScore = 35; locDetail = `${input.country}: relocation or visa required`; }
  void remoteOk;
  factors.push({ dimension: "Location suitability", score: locScore, weight: 8, detail: locDetail });

  // 6. Application effort & deadline feasibility (weight 7)
  const days = daysUntil(input.deadlineAt ?? null);
  let effortScore = 70;
  let effortDetail = "Standard application effort";
  if (days !== null && days < 0) { effortScore = 0; effortDetail = "Deadline already passed"; }
  else if (days !== null && days <= 3) { effortScore = 30; effortDetail = `Only ${days} day(s) to deadline`; }
  else if (days !== null && days <= 10) { effortScore = 55; effortDetail = `Deadline in ${days} days`; }
  else if (days === null) { effortScore = 60; effortDetail = "No deadline captured"; }
  factors.push({ dimension: "Deadline feasibility", score: effortScore, weight: 7, detail: effortDetail });

  // 7. Eligibility probability (weight 5)
  const eligibilityHits = (input.minQualifications ?? []).map((q) => matchRequirement(q, index));
  const missingElig = eligibilityHits.filter((m) => m.strength === "MISSING").length;
  const eligScore = Math.max(20, 100 - missingElig * 30);
  factors.push({
    dimension: "Eligibility likelihood",
    score: eligScore,
    weight: 5,
    detail: missingElig
      ? `${missingElig} stated requirement(s) not evidenced`
      : "Stated requirements appear satisfied",
  });

  const score = weightedScore(factors);
  return {
    score,
    label: jobLabel(score),
    factors,
    explanation: buildExplanation(factors, score),
  };
}
