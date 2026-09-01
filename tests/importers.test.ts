import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseLinkedInZip, parseProfileJson, parsedCount, emptyProfile } from "../src/lib/importers";

describe("parseProfileJson", () => {
  it("reads this application's own export shape", () => {
    const p = parseProfileJson(
      JSON.stringify({
        basics: { headline: "Engineer", summary: "Builds things", location: "Nairobi" },
        skills: [{ name: "Solar PV", category: "Energy" }, { name: "TypeScript" }],
        education: [{ institution: "JKUAT", degree: "BSc", field: "ABE", start_year: 2018, end_year: 2024 }],
        employment: [{ title: "Engineer", organization: "Roam", start_date: "2024-01" }],
        projects: [{ name: "SafariCharge", overview: "EV charging" }],
      })
    );
    expect(p.headline).toBe("Engineer");
    expect(p.location).toBe("Nairobi");
    expect(p.skills.map((s) => s.name)).toEqual(["Solar PV", "TypeScript"]);
    expect(p.education[0]).toMatchObject({ institution: "JKUAT", start_year: 2018, end_year: 2024 });
    expect(p.employment[0]).toMatchObject({ title: "Engineer", organization: "Roam", current: true });
    expect(p.projects[0].name).toBe("SafariCharge");
    expect(p.notes).toHaveLength(0);
  });

  it("reads JSON Resume field names", () => {
    const p = parseProfileJson(
      JSON.stringify({
        basics: { label: "Engineer" },
        work: [{ position: "Analyst", name: "Acme", startDate: "2020", endDate: "2022" }],
        education: [{ school: "JKUAT", studyType: "BSc", area: "Engineering" }],
      })
    );
    expect(p.headline).toBe("Engineer");
    expect(p.employment[0]).toMatchObject({ title: "Analyst", organization: "Acme", current: false });
    expect(p.education[0]).toMatchObject({ institution: "JKUAT", degree: "BSc", field: "Engineering" });
  });

  it("accepts a bare array of skill names", () => {
    const p = parseProfileJson(JSON.stringify(["Solar PV", "GIS"]));
    expect(p.skills.map((s) => s.name)).toEqual(["Solar PV", "GIS"]);
  });

  it("explains invalid JSON instead of reporting an empty success", () => {
    const p = parseProfileJson("{not json");
    expect(parsedCount(p)).toBe(0);
    expect(p.notes.join(" ")).toMatch(/not valid JSON/i);
  });

  it("explains a well-formed file that holds nothing importable", () => {
    const p = parseProfileJson(JSON.stringify({ unrelated: true }));
    expect(parsedCount(p)).toBe(0);
    expect(p.notes.join(" ")).toMatch(/No skills, education, employment or projects/i);
  });
});

describe("parseLinkedInZip", () => {
  async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
    const zip = new JSZip();
    for (const [name, body] of Object.entries(files)) zip.file(name, body);
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  it("reads skills, education, positions and projects", async () => {
    const p = await parseLinkedInZip(
      await zipOf({
        "Skills.csv": "Name\nSolar PV\nGIS\n",
        "Education.csv": "School Name,Degree Name,Start Date,End Date\nJKUAT,BSc,2018,2024\n",
        "Positions.csv": "Company Name,Title,Started On,Finished On,Description\nRoam,Engineer,Jan 2024,,Built things\n",
        "Projects.csv": "Title,Description\nSafariCharge,EV charging\n",
        "Profile.csv": "Headline,Summary,Geo Location\nEngineer,Builds things,Nairobi\n",
      })
    );
    expect(p.skills.map((s) => s.name)).toEqual(["Solar PV", "GIS"]);
    expect(p.education[0]).toMatchObject({ institution: "JKUAT", degree: "BSc", start_year: 2018, end_year: 2024 });
    // No "Finished On" means the role is current.
    expect(p.employment[0]).toMatchObject({ title: "Engineer", organization: "Roam", current: true });
    expect(p.projects[0].name).toBe("SafariCharge");
    expect(p.headline).toBe("Engineer");
    expect(p.location).toBe("Nairobi");
  });

  it("drops duplicate skills", async () => {
    const p = await parseLinkedInZip(await zipOf({ "Skills.csv": "Name\nGIS\ngis\nGIS\n" }));
    expect(p.skills).toHaveLength(1);
  });

  it("finds files nested under an export folder", async () => {
    const p = await parseLinkedInZip(await zipOf({ "Basic_LinkedInDataExport/Skills.csv": "Name\nGIS\n" }));
    expect(p.skills.map((s) => s.name)).toEqual(["GIS"]);
  });

  it("says what was missing rather than reporting an empty success", async () => {
    const p = await parseLinkedInZip(await zipOf({ "Ads.csv": "a\n1\n" }));
    expect(parsedCount(p)).toBe(0);
    expect(p.notes.join(" ")).toMatch(/Skills\.csv/);
  });
});

describe("parsedCount", () => {
  it("counts nothing for a fresh profile", () => {
    expect(parsedCount(emptyProfile())).toBe(0);
  });
});
