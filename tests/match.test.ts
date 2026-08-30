import { describe, it, expect } from "vitest";
import { matchRequirement, extractRequirementTerms } from "@/lib/scoring/match";
import { extractRequirements, mapEvidence, analyzeCvFit } from "@/lib/engines/cv";
import type { ProfileIndex } from "@/lib/scoring/profile-index";

const index: ProfileIndex = {
  skills: [
    { name: "EV Charging Infrastructure", proficiency: 5, years: 2 },
    { name: "Solar PV Systems", proficiency: 4, years: 3 },
    { name: "Python", proficiency: 3, years: 1 },
  ],
  titles: ["Technical Sales and Operations Engineer"],
  employers: ["Roam Electric"],
  projects: [{ name: "SafariCharge", overview: "Solar EV charging simulation platform with battery analytics" }],
  degrees: [{ degree: "BSc", field: "Agricultural and Biosystems Engineering", institution: "JKUAT", grade: "Second Class Upper" }],
  certificates: ["GIS Training"],
  sectors: [],
  hasBachelor: true,
  gradeLevel: "UPPER_SECOND",
  yearsTotal: 3,
  textBlob: "solar pv ev charging roam electric safaricharge python typescript gis borehole",
};

describe("matchRequirement", () => {
  it("finds STRONG evidence via synonyms and employer history", () => {
    const m = matchRequirement("Experience deploying EV charging networks", index);
    expect(m.strength).toBe("STRONG");
    expect(m.evidence.length).toBeGreaterThan(0);
  });

  it("never upgrades developing skills to expert", () => {
    const m = matchRequirement("Advanced Python software development (5+ years)", index);
    expect(m.strength === "STRONG" ? m.score : 0).toBeLessThanOrEqual(80);
    expect(["MODERATE", "DEVELOPING", "STRONG"]).toContain(m.strength);
  });

  it("returns MISSING with no evidence for unknown requirements", () => {
    const m = matchRequirement("Registered dental practitioner licence", index);
    expect(m.strength).toBe("MISSING");
    expect(m.score).toBeLessThanOrEqual(15);
    expect(m.evidence.length).toBe(0);
  });
});

describe("extractRequirements", () => {
  it("extracts requirement-like lines from a job description", () => {
    const jd = `About the role
We are seeking an engineer.
Requirements
- Bachelor's degree in engineering (required)
- 3+ years experience in renewable energy projects
- Experience with solar PV design tools
- Strong communication and stakeholder management skills
- French language skills (preferred)
Benefits: health insurance and pension.`;
    const reqs = extractRequirements(jd);
    expect(reqs.length).toBeGreaterThanOrEqual(3);
    expect(reqs.some((r) => /degree/i.test(r.text))).toBe(true);
    expect(reqs.every((r) => !/Benefits/i.test(r.text))).toBe(true);
  });
});

describe("cv evidence mapping", () => {
  it("labels developing evidence honestly and flags gaps", () => {
    const reqs = extractRequirements(
      "Requirements:\n- Solar PV design experience\n- EV charging knowledge\n- Registered architect licence\n"
    );
    const matches = mapEvidence(reqs, index);
    const licence = matches.find((m) => /architect/i.test(m.requirement));
    expect(licence?.strength).toBe("MISSING");
    expect(licence?.advice).toBeTruthy();
  });

  it("produces an overall analysis with emphasize and gaps", () => {
    const analysis = analyzeCvFit(
      "Requirements: solar PV systems experience; EV charging deployment; stakeholder engagement; unknown deep sea diving certification",
      index
    );
    expect(analysis.matches.length).toBeGreaterThan(0);
    expect(analysis.emphasize.length + analysis.gaps.length).toBeGreaterThan(0);
    expect(analysis.summary).toMatch(/\d+\/\d+|No requirements/);
  });
});

describe("term extraction", () => {
  it("strips stopwords and noise", () => {
    const terms = extractRequirementTerms("At least 3 years of experience with the Python programming language");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("with");
    expect(terms).toContain("python");
  });
});
