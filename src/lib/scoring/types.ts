// Shared types for the evidence-based scoring engines.
//
// Every score is a weighted sum of named factors, and every factor carries a
// human-readable detail plus optional evidence pointers back into the master
// profile. Nothing here invents facts: a factor with no evidence says so.

export type EvidencePointer = { label: string; refType?: string; refId?: string };

export type Factor = {
  dimension: string;
  score: number; // 0..100 for this dimension
  weight: number; // relative weight
  detail: string; // human-readable explanation of this factor
  evidence?: EvidencePointer[];
};

export type ScoreResult = {
  score: number; // weighted 0..100
  label: string;
  factors: Factor[];
  explanation: string;
};

export function weightedScore(factors: Factor[]): number {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  if (totalWeight === 0) return 0;
  const raw = factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function buildExplanation(factors: Factor[], score: number): string {
  const sorted = [...factors].sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score));
  const strengths = sorted.filter((f) => f.score >= 70).slice(0, 2);
  const gaps = sorted.filter((f) => f.score < 50).slice(0, 2);
  const parts: string[] = [];
  if (strengths.length) parts.push(`Strengths: ${strengths.map((f) => f.dimension.toLowerCase()).join(", ")}.`);
  if (gaps.length) parts.push(`Gaps: ${gaps.map((f) => f.dimension.toLowerCase()).join(", ")}.`);
  if (!parts.length) parts.push("Balanced profile against this opportunity.");
  parts.push(`Overall weighted score ${score}/100.`);
  return parts.join(" ");
}
