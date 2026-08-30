import { describe, it, expect } from "vitest";
import { scoreJob, jobLabel } from "@/lib/scoring/job";
import { scoreScholarship } from "@/lib/scoring/scholarship";
import { scoreTaskPriority } from "@/lib/scoring/priority";
import { scoreLead } from "@/lib/scoring/lead";
import { weightedScore } from "@/lib/scoring/types";
import type { ProfileIndex } from "@/lib/scoring/profile-index";

const royIndex: ProfileIndex = {
  skills: [
    { name: "EV Charging Infrastructure", proficiency: 5, years: 2 },
    { name: "Solar PV Systems", proficiency: 4, years: 3 },
    { name: "Energy Systems Modelling", proficiency: 4, years: 2 },
    { name: "Technical Sales", proficiency: 5, years: 3 },
    { name: "Python", proficiency: 3, years: 1 },
    { name: "TypeScript", proficiency: 4, years: 2 },
  ],
  titles: ["Technical Sales and Operations Engineer", "Field Engineer (Boreholes and Pumps)"],
  employers: ["Roam Electric", "Frisco Engineering Ltd", "HomeBiogas Kenya"],
  projects: [
    { name: "SafariCharge", overview: "Solar simulation and EV charging decision platform" },
  ],
  degrees: [
    { degree: "Bachelor of Science", field: "Agricultural and Biosystems Engineering", institution: "JKUAT", grade: "Second Class Honours, Upper Division" },
  ],
  certificates: ["FRED Energy Training Programme", "GIS Training"],
  sectors: ["renewable energy", "solar", "ev charging", "water systems", "energy data"],
  hasBachelor: true,
  gradeLevel: "UPPER_SECOND",
  yearsTotal: 3.2,
  textBlob:
    "solar pv ev charging energy systems modelling technical sales python typescript borehole pumps water stakeholder engagement deployment coordination project coordination partner liaison roam electric safaricharge renewable energy data gis project",
};

describe("weightedScore", () => {
  it("weights factors correctly and clamps to 0..100", () => {
    expect(weightedScore([
      { dimension: "a", score: 100, weight: 1, detail: "" },
      { dimension: "b", score: 0, weight: 1, detail: "" },
    ])).toBe(50);
    expect(weightedScore([
      { dimension: "a", score: 100, weight: 3, detail: "" },
      { dimension: "b", score: 50, weight: 1, detail: "" },
    ])).toBe(88);
    expect(weightedScore([])).toBe(0);
  });
});

describe("job scoring", () => {
  it("scores a well-fitting EV infrastructure role highly with evidence", () => {
    const result = scoreJob(
      {
        title: "EV Charging Infrastructure Engineer",
        requirements: ["EV charging deployment experience", "stakeholder engagement", "project coordination"],
        sectorTags: ["electric mobility", "energy"],
        country: "Kenya",
        deadlineAt: new Date(Date.now() + 20 * 86400000),
      },
      royIndex
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.label).toBe("Strong Apply");
    expect(result.factors.length).toBeGreaterThanOrEqual(6);
    const skills = result.factors.find((f) => f.dimension === "Skills match")!;
    expect(skills.evidence?.length).toBeGreaterThan(0);
  });

  it("scores a misaligned role low without fabricating", () => {
    const result = scoreJob(
      {
        title: "Senior Investment Banking Analyst",
        requirements: ["CFA certification", "M&A deal structuring", "financial derivatives", "portfolio risk management"],
        sectorTags: ["finance"],
        country: "United Kingdom",
        deadlineAt: new Date(Date.now() + 30 * 86400000),
      },
      royIndex
    );
    expect(result.score).toBeLessThan(55);
  });

  it("penalizes passed deadlines", () => {
    const base = { title: "Solar Engineer", country: "Kenya" };
    const future = scoreJob({ ...base, deadlineAt: new Date(Date.now() + 60 * 86400000) }, royIndex);
    const past = scoreJob({ ...base, deadlineAt: new Date(Date.now() - 5 * 86400000) }, royIndex);
    expect(past.score).toBeLessThan(future.score);
  });

  it("labels map to thresholds", () => {
    expect(jobLabel(90)).toBe("Strong Apply");
    expect(jobLabel(72)).toBe("Apply");
    expect(jobLabel(56)).toBe("Consider");
    expect(jobLabel(41)).toBe("Low Priority");
    expect(jobLabel(10)).toBe("Skip");
  });
});

describe("scholarship scoring", () => {
  it("treats a fully funded aligned programme as a priority target", () => {
    const result = scoreScholarship(
      {
        title: "Erasmus Mundus Joint Master in Sustainable Energy Systems",
        fieldRequirements: ["renewable energy", "energy systems", "engineering"],
        degreeRequirement: "Bachelor degree in engineering or related field",
        englishRequirement: "IELTS 6.5",
        fundingType: "FULLY_FUNDED",
        fundingCovers: ["TUITION", "STIPEND", "TRAVEL"],
        deadlineAt: new Date(Date.now() + 45 * 86400000),
        country: "Netherlands",
      },
      royIndex
    );
    expect(result.fundingLabel).toContain("Fully funded");
    expect(result.eligibilityLabel).toBe("Likely eligible");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.nextAction.length).toBeGreaterThan(5);
  });

  it("flags nationality blocks honestly", () => {
    const result = scoreScholarship(
      {
        title: "Domestic Scholarship for EU Citizens Only",
        fieldRequirements: ["energy"],
        fundingType: "FULLY_FUNDED",
        nationalityRestrictions: ["Germany", "France", "Italy"],
        deadlineAt: new Date(Date.now() + 30 * 86400000),
      },
      royIndex
    );
    expect(result.eligibilityLabel).toBe("Likely ineligible");
    expect(result.nextAction.toLowerCase()).toContain("eligible-country");
  });

  it("identifies English requirements as a risk and next action", () => {
    const result = scoreScholarship(
      {
        title: "MSc Renewable Energy",
        fieldRequirements: ["renewable energy"],
        fundingType: "FULLY_FUNDED",
        fundingCovers: ["TUITION", "STIPEND"],
        englishRequirement: "IELTS 7.5",
        englishWaiverPossible: false,
        deadlineAt: new Date(Date.now() + 60 * 86400000),
      },
      royIndex
    );
    expect(result.mainRisk.toLowerCase()).toContain("ielts");
  });
});

describe("task priority", () => {
  it("ranks overdue, application-linked tasks above relaxed ones and explains why", () => {
    const urgent = scoreTaskPriority({
      title: "Submit scholarship letter",
      status: "next",
      source: "scholarship_deadline",
      dueAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      goalId: "g1",
      applicationId: "a1",
    });
    const relaxed = scoreTaskPriority({
      title: "Reorganize bookmarks",
      status: "scheduled",
      source: "manual",
      dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    expect(urgent.score).toBeGreaterThan(relaxed.score);
    expect(urgent.reasons.some((r) => r.includes("Overdue"))).toBe(true);
    expect(urgent.reasons.some((r) => r.includes("goal"))).toBe(true);
  });

  it("zeros out closed tasks", () => {
    const done = scoreTaskPriority({ title: "x", status: "done", source: "manual" });
    expect(done.score).toBe(0);
  });
});

describe("lead scoring", () => {
  it("requires evidence before a lead scores hot", () => {
    const withEvidence = scoreLead({
      organizationName: "Kikao Energies",
      industry: "renewable energy",
      description: "Solar minigrid developer expanding in Kenya",
      solution: "Solar feasibility modelling",
      observedEvidenceCount: 3,
      evidenceSources: 2,
      hasPublicContact: true,
      hasKnownContact: false,
    });
    const noEvidence = scoreLead({
      organizationName: "Mystery Ltd",
      solution: "Solar feasibility modelling",
      observedEvidenceCount: 0,
      evidenceSources: 0,
      hasPublicContact: false,
      hasKnownContact: false,
    });
    expect(withEvidence.score).toBeGreaterThan(noEvidence.score);
    expect(withEvidence.label).toBe("Hot lead");
    expect(noEvidence.factors[0].detail).toContain("No observed evidence");
  });
});
