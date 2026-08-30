import { matchRequirement } from "./match";
import { buildExplanation, weightedScore, type Factor, type ScoreResult } from "./types";
import type { ProfileIndex } from "./profile-index";
import { daysUntil } from "@/lib/utils";

export type ScholarshipFitInput = {
  title: string;
  fieldRequirements?: string[] | null;
  degreeRequirement?: string | null;
  englishRequirement?: string | null;
  englishWaiverPossible?: boolean | null;
  greRequired?: boolean | null;
  fundingType?: string | null;
  fundingCovers?: string[] | null;
  stipend?: string | null;
  applicationFee?: number | null;
  feeCurrency?: string | null;
  nationalityRestrictions?: string[] | null;
  eligibilityNotes?: string | null;
  deadlineAt?: Date | null;
  durationMonths?: number | null;
  country?: string | null;
};

export type ScholarshipVerdict = ScoreResult & {
  fundingLabel: string;
  eligibilityLabel: "Likely eligible" | "Check requirements" | "Possibly eligible" | "Likely ineligible";
  mainStrength: string;
  mainRisk: string;
  nextAction: string;
};

export const ROY_NATIONALITY = "kenya";
const ROY_FIELDS = [
  "renewable energy", "energy systems", "sustainable energy", "solar", "electrical energy",
  "energy markets", "smart grid", "energy data", "electric mobility", "battery",
  "environmental engineering", "water engineering", "sustainable infrastructure",
  "climate", "energy economics", "hydrogen", "energy technology", "engineering",
];

/**
 * Education scoring model. Deliberately separate from the job scorer because
 * the decision drivers differ: funding quality, eligibility rules and
 * admission competitiveness matter more than salary or remote work.
 */
export function scoreScholarship(input: ScholarshipFitInput, index: ProfileIndex): ScholarshipVerdict {
  const factors: Factor[] = [];

  // 1. Field fit (weight 20)
  const fieldText = (input.fieldRequirements ?? []).join(" ") + " " + input.title;
  const fieldHits = ROY_FIELDS.filter((f) => fieldText.toLowerCase().includes(f));
  factors.push({
    dimension: "Field fit",
    score: Math.min(100, fieldHits.length * 35 + (fieldHits.length ? 25 : 0)),
    weight: 20,
    detail: fieldHits.length
      ? `Matches Roy's target fields: ${fieldHits.slice(0, 4).join(", ")}`
      : "Field not clearly aligned with energy, water or engineering targets",
  });

  // 2. Degree compatibility (weight 15)
  const degreeReq = (input.degreeRequirement ?? "").toLowerCase();
  let degreeScore = 80;
  let degreeDetail = "Bachelor in Agricultural & Biosystems Engineering, Second Class Upper";
  if (/first class|distinction|gpa 3\.7|gpa 3\.8/i.test(degreeReq)) {
    degreeScore = 55;
    degreeDetail = "Programme hints at first-class/GPA expectation; Roy has Second Class Upper";
  } else if (/bachelor|undergraduate|bsc/i.test(degreeReq)) {
    degreeScore = 95;
  } else if (/master.*bachelor|relevant degree/i.test(degreeReq)) {
    degreeScore = 85;
  }
  factors.push({ dimension: "Degree compatibility", score: degreeScore, weight: 15, detail: degreeDetail });

  // 3. Funding quality (weight 20)
  const ft = (input.fundingType ?? "").toUpperCase();
  const covers = (input.fundingCovers ?? []).map((c) => c.toUpperCase());
  let fundScore = 40;
  let fundingLabel = "Unknown funding";
  if (ft === "FULLY_FUNDED" || (covers.includes("TUITION") && (covers.includes("STIPEND") || covers.includes("LIVING")))) {
    fundScore = 100;
    fundingLabel = "Fully funded";
    if (covers.includes("TRAVEL")) fundingLabel = "Fully funded (incl. travel)";
  } else if (ft === "PARTIAL" || covers.includes("TUITION")) {
    fundScore = 55;
    fundingLabel = "Partial funding";
  } else if (ft === "TUITION_ONLY") {
    fundScore = 45;
    fundingLabel = "Tuition only";
  } else if (ft === "SELF_FUNDED") {
    fundScore = 10;
    fundingLabel = "Self funded";
  }
  if (input.stipend) fundScore = Math.min(100, fundScore + 5);
  if (input.applicationFee && input.applicationFee > 100) fundScore -= 5;
  factors.push({
    dimension: "Funding quality",
    score: Math.max(0, fundScore),
    weight: 20,
    detail:
      fundingLabel +
      (input.applicationFee ? `, application fee ${input.applicationFee} ${input.feeCurrency ?? ""}`.trimEnd() : ""),
  });

  // 4. Eligibility: nationality + work experience + academic record (weight 15)
  const restrictions = (input.nationalityRestrictions ?? []).map((c) => c.toLowerCase());
  const nationalityBlocked =
    restrictions.length > 0 &&
    !restrictions.some((c) => c.includes(ROY_NATIONALITY) || c.includes("african") || c.includes("international") || c.includes("all"));
  const notes = (input.eligibilityNotes ?? "").toLowerCase();
  const wantsWorkExp = /work experience|professional experience/i.test(notes + " " + (input.degreeRequirement ?? ""));
  const eligMatch = wantsWorkExp ? matchRequirement("renewable energy work experience", index) : null;
  let eligScore = nationalityBlocked ? 15 : 85;
  if (index.gradeLevel === "UPPER_SECOND" || index.gradeLevel === "FIRST") eligScore += 5;
  if (eligMatch && eligMatch.score >= 60) eligScore += 5;
  factors.push({
    dimension: "Eligibility likelihood",
    score: Math.min(100, eligScore),
    weight: 15,
    detail: nationalityBlocked
      ? "Nationality restrictions may exclude Kenya; verify the eligible-country list"
      : wantsWorkExp
        ? "Eligibility mentions work experience, which Roy has in energy roles"
        : "No blocking restrictions identified (verify on the official page)",
  });

  // 5. English / test requirements (weight 10)
  const english = (input.englishRequirement ?? "").toLowerCase();
  let engScore = 70;
  let engDetail = "English requirement unclear; verify waiver rules";
  if (input.englishWaiverPossible) { engScore = 95; engDetail = "Waiver possible (verify prior-English-instruction policy)"; }
  else if (/ielts\s*([5-8](\.\d)?)/.test(english)) {
    const band = parseFloat(english.match(/ielts\s*([5-8](\.\d)?)/)![1]);
    engScore = band <= 6.5 ? 85 : band <= 7 ? 70 : 45;
    engDetail = `Requires IELTS ${band}; plan test early`;
  } else if (!english) { engScore = 70; }

  factors.push({ dimension: "English requirements", score: engScore, weight: 10, detail: engDetail });

  // 6. Competitiveness (weight 10)
  let compScore = 55;
  if (index.yearsTotal >= 2) compScore += 15;
  if (index.projects.length >= 2) compScore += 10;
  if (index.gradeLevel === "UPPER_SECOND" || index.gradeLevel === "FIRST") compScore += 10;
  factors.push({
    dimension: "Admission competitiveness",
    score: Math.min(95, compScore),
    weight: 10,
    detail: `${index.yearsTotal}y energy-sector experience, ${index.projects.length} documented projects, ${index.gradeLevel === "UNKNOWN" ? "academic record on file" : index.gradeLevel.replace("_", " ").toLowerCase()}`,
  });

  // 7. Effort & deadline feasibility (weight 10)
  const days = daysUntil(input.deadlineAt ?? null);
  let effortScore = 70;
  let effortDetail = "Standard application effort";
  if (days !== null && days < 0) { effortScore = 0; effortDetail = "Deadline passed"; }
  else if (days !== null && days <= 7) { effortScore = 25; effortDetail = `Only ${days} day(s): references and transcripts unlikely to be ready`; }
  else if (days !== null && days <= 21) { effortScore = 50; effortDetail = `Deadline in ${days} days`; }
  factors.push({ dimension: "Deadline feasibility", score: effortScore, weight: 10, detail: effortDetail });

  const score = weightedScore(factors);

  // Verdicts
  const sorted = [...factors].sort((a, b) => b.score - a.score);
  const mainStrength = sorted[0]?.detail ?? "Engineering background";
  const risks = sorted.filter((f) => f.score < 60);
  const mainRisk = risks[0]?.detail ?? "No major risks identified";
  let nextAction = "Open the official page and verify requirements";
  if (nationalityBlocked) nextAction = "Verify whether Kenya is on the eligible-country list";
  else if (engScore < 80) nextAction = "Verify English-language waiver rules or book an IELTS date";
  else if (days !== null && days <= 21) nextAction = "Request references and transcripts this week";
  else if ((input.applicationFee ?? 0) > 0) nextAction = `Budget the ${input.applicationFee} application fee and prepare documents`;

  const eligibilityLabel: ScholarshipVerdict["eligibilityLabel"] =
    nationalityBlocked ? "Likely ineligible" : eligScore >= 85 ? "Likely eligible" : eligScore >= 60 ? "Check requirements" : "Possibly eligible";

  return {
    score,
    label: score >= 85 ? "Priority target" : score >= 70 ? "Strong candidate" : score >= 55 ? "Worth researching" : score >= 40 ? "Long shot" : "Skip",
    factors,
    explanation: buildExplanation(factors, score),
    fundingLabel,
    eligibilityLabel,
    mainStrength,
    mainRisk,
    nextAction,
  };
}
