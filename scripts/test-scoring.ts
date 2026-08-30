import { scoreJob, scoreProgramme, scorePriority, type ProfileContext } from "../src/lib/scoring";

const ctx: ProfileContext = {
  skillNames: ["Solar PV", "Battery Storage", "EV Charging Infrastructure", "Technical Sales", "Water Systems", "Energy Modelling", "Python"],
  skillMap: { "solar pv": { years: 4, proficiency: "Advanced" } },
  sectors: ["renewable energy", "EV infrastructure", "water systems"],
  employmentTitles: ["Technical Sales & Operations Engineer", "Field Engineer", "Technical Sales Engineer Intern"],
  employmentOrgs: [],
  locations: ["Nairobi, Kenya"],
  hasEngineeringDegree: true,
  yearsExperience: 4,
  preferredGeos: ["kenya", "nairobi", "europe", "remote"],
  preferredSectors: ["renewable energy", "solar", "ev", "water", "energy", "data", "software"],
  languages: ["English"],
  tools: [],
};

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); failures++; }
  else console.log("ok  :", msg);
}

const job = scoreJob(
  { title: "Renewable Energy Engineer", requirements: ["solar pv", "battery storage", "technical sales"], location: "Nairobi, Kenya", sector: "renewable energy" },
  ctx
);
assert(job.overall >= 60 && job.overall <= 100, `job score in range (${job.overall})`);
assert(job.dimensions.length === 7, "job has 7 dimensions");
assert(job.recommendation !== "Skip", `job recommendation not skip (${job.recommendation})`);

const prog = scoreProgramme(
  { title: "Erasmus Mundus Renewable Energy", funding: "fully funded", livingAllowance: true, travelAllowance: true, englishRequirement: "waiver possible", admissionCompetitiveness: "high", careerRelevance: 95 },
  ctx
);
assert(prog.overall >= 70, `programme score high (${prog.overall})`);
assert(prog.dimensions.some((d) => d.key === "funding"), "programme has funding dimension");

const pri = scorePriority({ dueDate: new Date(Date.now() + 2 * 86400000).toISOString(), basePriority: 4, strategic: true, effortMinutes: 20 });
assert(pri.score > 70, `priority high for urgent strategic task (${pri.score})`);
const priFar = scorePriority({ dueDate: new Date(Date.now() + 30 * 86400000).toISOString(), basePriority: 2 });
const priOverdue = scorePriority({ dueDate: new Date(Date.now() - 86400000).toISOString(), basePriority: 2 });
assert(priOverdue.score > priFar.score, "overdue raises score above a far-future task");

if (failures) { console.error(`\n${failures} test(s) failed.`); process.exit(1); }
console.log("\nAll scoring tests passed.");
