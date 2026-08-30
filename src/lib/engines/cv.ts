import { matchRequirement, extractRequirementTerms } from "@/lib/scoring/match";
import type { ProfileIndex } from "@/lib/scoring/profile-index";

export type ExtractedRequirement = {
  text: string;
  category: "TECHNICAL" | "EXPERIENCE" | "EDUCATION" | "SOFT" | "OTHER";
  priority: "REQUIRED" | "PREFERRED";
};

export type EvidenceMatch = {
  requirement: string;
  strength: "STRONG" | "MODERATE" | "DEVELOPING" | "MISSING";
  score: number;
  evidence: { label: string; refType?: string }[];
  advice?: string;
};

export type CvMatchAnalysis = {
  requirements: ExtractedRequirement[];
  matches: EvidenceMatch[];
  overallScore: number;
  emphasize: string[];
  gaps: string[];
  summary: string;
};

const REQUIRED_MARKERS = /required|must have|minimum|essential|at least|\d\+?\s*years?/i;
const TECH_HINTS = /python|gis|autocad|matlab|homer|sam|pv\s*syst|excel|sql|typescript|react|node|modelling|modeling|simulation|energy|solar|battery|water|pump|data|dashboard|mqtt|iot|analytics|scada|etap|dialux|arcgis|qgis|java|c\+\+|r\s|power ?bi/i;
const EDU_HINTS = /degree|bachelor|master|b\.sc|bsc|m\.sc|msc|phd|diploma|certif|registered|ebk|engineers? board/i;
const SOFT_HINTS = /communication|leadership|team|stakeholder|presentation|writing|negotiation|management|coordination|organized|proactive/i;
const EXP_HINTS = /experience|background|track record|worked|years? (in|of)|portfolio|proven/i;

/**
 * Deterministic requirement extraction from a job/programme description.
 * Heuristics first (works with zero AI), AI refinement optional upstream.
 */
export function extractRequirements(text: string): ExtractedRequirement[] {
  if (!text.trim()) return [];
  const lines = text
    .split(/\n|(?<=\.)\s(?=[A-Z])|;|•|·|-\s(?=[A-Z])/)
    .map((l) => l.replace(/^[\s\-*•·\d.]+/, "").trim())
    .filter((l) => l.length > 8 && l.length < 400);

  const seen = new Set<string>();
  const out: ExtractedRequirement[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!/require|experience|skill|degree|knowledge|familiar|proficien|ability|years|qualification|responsib|must|should have|ideal|licen[cs]|certif|registered/i.test(lower)) continue;
    const isPreferred = /preferred|nice to have|desirable|plus|advantageous/i.test(lower);
    const isRequired = REQUIRED_MARKERS.test(line) && !isPreferred;
    let category: ExtractedRequirement["category"] = "OTHER";
    if (TECH_HINTS.test(line)) category = "TECHNICAL";
    else if (EDU_HINTS.test(line)) category = "EDUCATION";
    else if (SOFT_HINTS.test(line)) category = "SOFT";
    else if (EXP_HINTS.test(line)) category = "EXPERIENCE";
    const cleaned = line.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: cleaned, category, priority: isPreferred ? "PREFERRED" : isRequired ? "REQUIRED" : "PREFERRED" });
    if (out.length >= 20) break;
  }
  // Fallback: sentence split when the posting is prose-style
  if (out.length === 0) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 15 && s.length < 300);
    for (const s of sentences.slice(0, 12)) {
      out.push({ text: s.trim(), category: "OTHER", priority: "PREFERRED" });
    }
  }
  return out;
}

/**
 * Map each extracted requirement to Roy's evidence, honestly.
 * DEVELOPING skills are labelled developing; never upgraded.
 */
export function mapEvidence(requirements: ExtractedRequirement[], index: ProfileIndex): EvidenceMatch[] {
  return requirements.map((req) => {
    const m = matchRequirement(req.text, index);
    let advice: string | undefined;
    if (m.strength === "MISSING") {
      advice = `No evidence on file for this. Address via learning, a project, or leave honestly unclaimed.`;
    } else if (m.strength === "DEVELOPING") {
      advice = `Partial signals only. Present as developing exposure, not expertise.`;
    } else if (m.strength === "STRONG") {
      advice = `Lead with this. Strong evidence: ${m.evidence.slice(0, 2).map((e) => e.label).join("; ")}`;
    } else {
      advice = `Support with concrete examples rather than claiming deep expertise.`;
    }
    return {
      requirement: req.text,
      strength: m.strength,
      score: m.score,
      evidence: m.evidence,
      advice,
    };
  });
}

export function analyzeCvFit(description: string, index: ProfileIndex): CvMatchAnalysis {
  const requirements = extractRequirements(description);
  const matches = mapEvidence(requirements, index);
  const requiredMatches = matches.filter((m) => requirements.find((r) => r.text === m.requirement)?.priority === "REQUIRED");
  const pool = requiredMatches.length ? requiredMatches : matches;
  const overallScore = pool.length
    ? Math.round(pool.reduce((s, m) => s + m.score, 0) / pool.length)
    : 0;
  const emphasize = matches
    .filter((m) => m.strength === "STRONG")
    .slice(0, 6)
    .map((m) => m.requirement);
  const gaps = matches
    .filter((m) => m.strength === "MISSING" || m.strength === "DEVELOPING")
    .map((m) => m.requirement);
  const strongCount = matches.filter((m) => m.strength === "STRONG").length;
  const summary = matches.length
    ? `${strongCount}/${matches.length} requirements strongly evidenced from your master profile. ${gaps.length ? `${gaps.length} gap(s) flagged and must not be fabricated.` : "No critical gaps detected."}`
    : "No requirements could be extracted from the provided text.";
  return { requirements, matches, overallScore, emphasize, gaps, summary };
}

/** Section keywords used to order CV content for a target role. */
export function cvEmphasisKeywords(description: string): string[] {
  const terms = extractRequirementTerms(description);
  const counts = new Map<string, number>();
  for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t);
}
