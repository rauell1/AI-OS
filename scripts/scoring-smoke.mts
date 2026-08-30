import "dotenv/config";
import { prisma } from "../src/lib/db";
import { buildProfileIndex } from "../src/lib/scoring/profile-index";
import { scoreJob } from "../src/lib/scoring/job";
import { scoreScholarship } from "../src/lib/scoring/scholarship";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "roy@rauell.systems" } });
  const index = await buildProfileIndex(user.id);
  console.log(`profile: ${index.skills.length} skills, ${index.yearsTotal}y experience, grade ${index.gradeLevel}, ${index.projects.length} projects`);

  const job = await prisma.opportunity.create({
    data: {
      userId: user.id,
      type: "JOB",
      title: "Renewable Energy Engineer (EV Charging)",
      organizationName: "Sample Energy Co",
      country: "Kenya",
      sourceName: "smoke-test",
      sourceUrl: "https://example.com/job/1",
      requirements: ["EV charging infrastructure deployment", "solar PV design", "stakeholder engagement", "energy systems modelling", "project coordination"],
      sectorTags: ["renewable energy", "electric mobility"],
      deadlineAt: new Date(Date.now() + 21 * 86400000),
    },
  });
  const scholarship = await prisma.opportunity.create({
    data: {
      userId: user.id,
      type: "SCHOLARSHIP",
      title: "Erasmus Mundus MSc Sustainable Energy Systems",
      organizationName: "EU Consortium",
      country: "Netherlands",
      sourceName: "smoke-test",
      sourceUrl: "https://example.com/msc/1",
      fieldRequirements: ["renewable energy", "energy systems"],
      degreeRequirement: "Bachelor in engineering",
      englishRequirement: "IELTS 6.5",
      fundingType: "FULLY_FUNDED",
      fundingCovers: ["TUITION", "STIPEND", "TRAVEL"],
      deadlineAt: new Date(Date.now() + 60 * 86400000),
    },
  });

  const j = scoreJob({
    title: job.title,
    requirements: job.requirements as string[],
    sectorTags: job.sectorTags as string[],
    country: job.country,
    deadlineAt: job.deadlineAt,
  }, index);
  await prisma.opportunity.update({
    where: { id: job.id },
    data: { fitScore: j.score, fitLabel: j.label, fitBreakdown: j.factors as never, fitExplanation: j.explanation },
  });
  console.log(`JOB  "${job.title}" -> ${j.score}/100 (${j.label})`);
  for (const f of j.factors) console.log(`   - ${f.dimension}: ${f.score} (w${f.weight}) ${f.detail}`);

  const s = scoreScholarship({
    title: scholarship.title,
    fieldRequirements: scholarship.fieldRequirements as string[],
    degreeRequirement: scholarship.degreeRequirement,
    englishRequirement: scholarship.englishRequirement,
    fundingType: scholarship.fundingType,
    fundingCovers: scholarship.fundingCovers as string[],
    deadlineAt: scholarship.deadlineAt,
    country: scholarship.country,
  }, index);
  await prisma.opportunity.update({
    where: { id: scholarship.id },
    data: { fitScore: s.score, fitLabel: s.label, fitBreakdown: s.factors as never, fitExplanation: s.explanation },
  });
  console.log(`EDU  "${scholarship.title}" -> ${s.score}/100 (${s.label}, ${s.fundingLabel}, ${s.eligibilityLabel})`);
  console.log(`   next: ${s.nextAction}`);

  const dup = await prisma.opportunity.count({ where: { userId: user.id, sourceUrl: "https://example.com/job/1?utm_source=x" } });
  console.log(`dedupe probe rows with tracking params: ${dup} (same URL stored once: ${dup === 1})`);
  await prisma.$disconnect();
}
main();
