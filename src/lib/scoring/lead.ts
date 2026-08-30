import { buildExplanation, weightedScore, type Factor, type ScoreResult } from "./types";

export type LeadScoreInput = {
  organizationName: string;
  industry?: string | null;
  location?: string | null;
  description?: string | null;
  solution: string;
  observedEvidenceCount: number;
  evidenceSources: number;
  hasPublicContact: boolean;
  hasKnownContact: boolean; // a person in the CRM already
  strategicSectors?: string[];
};

const SOLUTION_SIGNALS: Record<string, string[]> = {
  "Solar feasibility modelling": ["solar", "energy", "pv", "electricity", "power", "hospital", "school", "farm", "hotel", "county"],
  "Energy planning": ["energy", "county", "utility", "planning", "development", "industrial"],
  "EV charging planning": ["mobility", "transport", "logistics", "fleet", "parking", "fuel", "real estate", "mall"],
  "Water infrastructure systems": ["water", "borehole", "irrigation", "farm", "county", "utility"],
  "Borehole monitoring": ["water", "borehole", "farm", "utility", "drilling"],
  "Engineering data systems": ["engineering", "data", "operations", "monitoring", "energy", "water"],
  "Institutional websites": ["organization", "ngo", "society", "association", "institution", "company"],
  "Automation": ["operations", "manual", "process", "admin", "reporting"],
  "Technical dashboards": ["operations", "monitoring", "data", "reporting", "energy", "water"],
  "AI-enhanced operational tools": ["operations", "data", "reports", "process"],
};

/**
 * Lead scoring separates observed evidence from inference: the score reflects
 * evidence quality and reachability, never invented pain points.
 */
export function scoreLead(input: LeadScoreInput): ScoreResult {
  const factors: Factor[] = [];

  // Evidence quality (weight 25)
  const evScore = Math.min(100, input.observedEvidenceCount * 25 + input.evidenceSources * 10);
  factors.push({
    dimension: "Evidence quality",
    score: evScore,
    weight: 25,
    detail: input.observedEvidenceCount
      ? `${input.observedEvidenceCount} observed fact(s) from ${input.evidenceSources} source(s)`
      : "No observed evidence yet; research needed before outreach",
  });

  // Solution-signal alignment (weight 25)
  const signals = SOLUTION_SIGNALS[input.solution] ?? ["energy", "data", "operations"];
  const text = `${input.industry ?? ""} ${input.description ?? ""}`.toLowerCase();
  const hits = signals.filter((s) => text.includes(s));
  factors.push({
    dimension: "Solution alignment",
    score: Math.min(100, hits.length * 22 + (text ? 8 : 0)),
    weight: 25,
    detail: hits.length ? `Signals found: ${hits.slice(0, 3).join(", ")}` : "No public signals for this solution yet (hypothesis only)",
  });

  // Strategic fit (weight 20)
  const sectors = (input.strategicSectors ?? ["renewable energy", "water", "engineering", "climate"]);
  const sectorHit = sectors.some((s) => text.includes(s.toLowerCase().split(" ")[0]));
  factors.push({
    dimension: "Strategic fit",
    score: sectorHit ? 85 : text ? 45 : 30,
    weight: 20,
    detail: sectorHit ? "Operates in Roy's core sectors" : "Outside core sectors but reachable",
  });

  // Reachability (weight 20)
  let reach = 20;
  const reachBits: string[] = [];
  if (input.hasPublicContact) { reach += 40; reachBits.push("public contact available"); }
  if (input.hasKnownContact) { reach += 40; reachBits.push("warm contact exists in network"); }
  factors.push({
    dimension: "Reachability",
    score: reach,
    weight: 20,
    detail: reachBits.length ? reachBits.join("; ") : "No contact path identified",
  });

  // Kenya practicality (weight 10)
  const inKenya = (input.location ?? "").toLowerCase().includes("kenya") ||
    (input.location ?? "").toLowerCase().includes("nairobi");
  factors.push({
    dimension: "Practicality",
    score: inKenya ? 100 : input.location ? 50 : 60,
    weight: 10,
    detail: inKenya ? "Kenya-based: easy site visits and delivery" : "Remote or unknown location",
  });

  const score = weightedScore(factors);
  const label = score >= 70 ? "Hot lead" : score >= 55 ? "Warm lead" : score >= 40 ? "Nurture" : "Backlog";
  return { score, label, factors, explanation: buildExplanation(factors, score) };
}
