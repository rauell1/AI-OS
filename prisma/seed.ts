/**
 * Master Profile seed for Roy Okola Otieno.
 *
 * Every fact here is USER_PROVIDED: imported from Roy's own specification and
 * editable through the app. Nothing is hard-coded into business logic; this
 * file is the import mechanism.
 *
 * Usage: npm run db:seed   (requires DATABASE_URL)
 */
import "dotenv/config";
import { PrismaClient, Verification } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const EMAIL = process.env.SEED_EMAIL ?? "roy@rauell.systems";
const PASSWORD = process.env.SEED_PASSWORD ?? "ChangeMe-RauellOS-2025";

function d(iso: string): Date {
  return new Date(iso);
}

async function main() {
  console.log("Seeding Rauell OS master profile...");

  let user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    const { hashPassword } = await import("../src/lib/auth/password");
    user = await prisma.user.create({
      data: { email: EMAIL, name: "Roy Okola Otieno", passwordHash: hashPassword(PASSWORD) },
    });
    console.log(`  created user ${EMAIL} (password from SEED_PASSWORD env or default)`);
  }
  const userId = user.id;

  // ------------------------- Profile -------------------------
  await prisma.profile.upsert({
    where: { userId },
    create: {
      userId,
      fullName: "Roy Okola Otieno",
      headline:
        "Agricultural & Biosystems Engineer | Renewable Energy, EV Infrastructure & Water Systems | Energy Data and Digital Systems Builder",
      nationality: "Kenyan",
      location: "Nairobi, Kenya",
      email: EMAIL,
      portfolioUrl: "https://rauell.systems",
      links: {
        github: "https://github.com/rauell1",
        safaricharge: "https://solar.rauell.systems",
        aiAcademy: "https://academy.rauell.systems",
        greenwave: "https://greenwavesociety.org",
      },
      summary:
        "Agricultural and Biosystems Engineer (JKUAT, Second Class Upper) working across renewable energy, EV charging infrastructure, water systems and engineering software. Experience spans technical sales and operations at Roam Electric (EV charging deployment), borehole and pump engineering with Frisco Engineering, biogas systems with HomeBiogas Kenya, and building the SafariCharge solar simulation platform. Interested in energy systems modelling, energy access, climate technology and AI-assisted engineering tools.",
      careerPreferences: {
        roles: [
          "Renewable Energy Engineer", "Solar Engineer", "Energy Analyst", "Energy Systems Engineer",
          "Energy Data Analyst", "Technical Operations Engineer", "Project Engineer",
          "EV Infrastructure Engineer", "Charging Infrastructure Specialist",
          "Technical Sales Engineer", "Sustainability Engineer", "Energy Consultant",
          "Research Assistant", "Graduate Engineer", "Project Coordinator",
          "Technical Programme Officer",
        ],
        domains: [
          "renewable energy", "solar", "battery storage", "electric mobility", "ev charging",
          "energy systems", "energy data", "water systems", "climate tech", "engineering software",
          "energy access", "sustainability", "automation", "ai in engineering",
        ],
        locations: ["Kenya", "Nairobi", "Remote", "International (study)"],
        remoteOk: true,
        studyCountries: ["Germany", "Netherlands", "Sweden", "UK", "Italy", "France", "Belgium", "Finland", "Denmark", "Hungary"],
      },
    },
    update: {},
  });

  // ------------------------- Education -------------------------
  if (!(await prisma.education.findFirst({ where: { userId, institution: "Jomo Kenyatta University of Agriculture and Technology" } }))) {
    await prisma.education.create({
      data: {
        userId,
        institution: "Jomo Kenyatta University of Agriculture and Technology (JKUAT)",
        degree: "Bachelor of Science",
        field: "Agricultural and Biosystems Engineering",
        startDate: d("2018-09-01"),
        endDate: d("2024-12-01"),
        classification: "Second Class Honours, Upper Division",
        highlights: [
          "Final-year project: solar evaporative cooling for tomatoes, demonstrating approximately 40 percent shelf-life improvement",
          "Coursework across renewable energy, water systems, irrigation, engineering design and agricultural infrastructure",
        ],
        verification: Verification.USER_PROVIDED,
      },
    });
  }

  // ------------------------- Organizations -------------------------
  const orgs = [
    { name: "Roam Electric", industry: "Electric mobility", country: "Kenya", types: ["EMPLOYER"], description: "Kenyan electric motorcycle and charging company (Roam Park, Roam Air); charging network across Nairobi." },
    { name: "Frisco Engineering Ltd", industry: "Engineering services", country: "Kenya", types: ["EMPLOYER"], description: "Borehole, pump and groundwater engineering works including off-grid sites." },
    { name: "HomeBiogas Kenya", industry: "Renewable energy", country: "Kenya", types: ["EMPLOYER"], description: "Household biogas systems; decentralized clean cooking energy." },
    { name: "Jomo Kenyatta University of Agriculture and Technology", industry: "University", country: "Kenya", types: ["UNIVERSITY"], description: "Roy's alma mater; B.Sc. Agricultural and Biosystems Engineering." },
    { name: "Greenwave Society", industry: "Environment", country: "Kenya", types: ["PARTNER", "STAKEHOLDER"], description: "Youth-led environmental organization; digital systems and coordination." },
    { name: "Kenya Youth Parliament for Water", industry: "Water", country: "Kenya", types: ["PARTNER", "STAKEHOLDER"], description: "Youth water-sector engagement: events, webinars, hackathons and dialogues." },
    { name: "Unicaf / University of East London", industry: "Education", country: "UK", types: ["UNIVERSITY", "TRAINING"], description: "MBA-related studies from 2025: strategy, operations, HRM, Industry 5.0, leadership." },
  ];
  const orgByName: Record<string, { id: string }> = {};
  for (const o of orgs) {
    orgByName[o.name] = await prisma.organization.upsert({
      where: { userId_name: { userId, name: o.name } },
      create: { userId, ...o },
      update: {},
    });
  }

  // ------------------------- Employment -------------------------
  const employments = [
    {
      organization: "Roam Electric",
      title: "Technical Sales and Operations Engineer",
      employmentType: "Full-time",
      location: "Nairobi, Kenya",
      startDate: d("2023-06-01"),
      current: true,
      summary:
        "EV charging infrastructure development and technical sales across Nairobi. Deployed Roam Point and Roam Hub charging infrastructure, coordinated site assessment through energization, and supported investor-facing rollout planning.",
      highlights: [
        "Site vetting, feasibility assessment and deployment coordination for EV charging locations across Nairobi and surrounds",
        "Collected and verified site documentation: title deeds, leases, meter details, KRA records, permits and authorizations",
        "Meter separation processes, electrical infrastructure coordination and stakeholder/permit liaison",
        "Partner engagement and commercial negotiations with sites including Be Energy and Trinity Energy locations",
        "Charging-network planning, CAPEX planning and infrastructure forecasting; investor communication",
        "Areas covered include Utawala, Kayole, Ngong, Gitaru, Kiambu, Ruiru, Makadara, Ridgeways, Ruaka, Kingara Road, Kiserian, Kawangware, Rongai, Kitengela, Umoja, Kariobangi, Industrial Area, Parklands, Lower Kabete, Buruburu, Kasarani, Huruma, Ngara and more",
      ],
    },
    {
      organization: "Frisco Engineering Ltd",
      title: "Field Engineer (Boreholes and Pumps)",
      employmentType: "Contract",
      location: "Kenya (remote field sites)",
      startDate: d("2022-06-01"),
      endDate: d("2023-05-31"),
      current: false,
      summary:
        "Borehole assessment, pump systems and groundwater infrastructure engineering in remote and challenging environments, including Mara off-grid sites, Zuri Prime Farms and Notre Dame borehole works.",
      highlights: [
        "Pump troubleshooting, extraction and fishing operations; pipe recovery and camera inspection",
        "Pump testing, flow-rate and depth assessment; aquifer-performance considerations",
        "Diagnosed worn impellers, worn spacers, misaligned shafts and electrical winding imbalance",
        "Flushing recommendations, costing, site coordination and client communication",
      ],
    },
    {
      organization: "HomeBiogas Kenya",
      title: "Technical Sales Engineer Intern",
      employmentType: "Internship",
      location: "Kenya",
      startDate: d("2022-01-01"),
      endDate: d("2022-05-31"),
      current: false,
      summary: "Household biogas systems: technical sales, customer engagement and decentralized renewable energy adoption.",
      highlights: ["Clean cooking energy solutions and household renewable energy systems"],
    },
  ];
  for (const e of employments) {
    const existing = await prisma.employment.findFirst({
      where: { userId, title: e.title, organizationId: orgByName[e.organization].id },
    });
    if (!existing) {
      await prisma.employment.create({
        data: {
          userId,
          organizationId: orgByName[e.organization].id,
          title: e.title,
          employmentType: e.employmentType,
          location: e.location,
          startDate: e.startDate,
          endDate: e.endDate,
          current: e.current,
          summary: e.summary,
          highlights: e.highlights,
          verification: Verification.USER_PROVIDED,
        },
      });
    }
  }

  // ------------------------- Skills (with evidence) -------------------------
  const skills: {
    name: string;
    category: string;
    proficiency: number;
    years?: number;
    evidence: { refType: string; label: string }[];
  }[] = [
    { name: "EV Charging Infrastructure", category: "Energy", proficiency: 5, years: 2, evidence: [{ refType: "EMPLOYMENT", label: "Roam Electric: Roam Point/Hub deployments" }] },
    { name: "Solar PV Systems", category: "Energy", proficiency: 4, years: 3, evidence: [{ refType: "PROJECT", label: "SafariCharge solar simulation platform" }, { refType: "EDUCATION", label: "Solar evaporative cooling final-year project" }, { refType: "CERTIFICATE", label: "Torchbearer Institute solar training" }] },
    { name: "Energy Systems Modelling", category: "Energy", proficiency: 4, years: 2, evidence: [{ refType: "PROJECT", label: "SafariCharge: deterministic 5-minute interval simulation" }, { refType: "CERTIFICATE", label: "FRED: techno-economic modelling with HOMER and SAM" }] },
    { name: "Battery Storage", category: "Energy", proficiency: 4, evidence: [{ refType: "PROJECT", label: "SafariCharge battery analytics and SOC modelling" }] },
    { name: "Technical Sales", category: "Business", proficiency: 5, years: 3, evidence: [{ refType: "EMPLOYMENT", label: "Roam Electric; HomeBiogas Kenya" }] },
    { name: "Site Assessment & Feasibility", category: "Operations", proficiency: 5, years: 2, evidence: [{ refType: "EMPLOYMENT", label: "Roam Electric site vetting; Frisco borehole assessments" }] },
    { name: "Stakeholder Engagement", category: "Business", proficiency: 4, evidence: [{ refType: "EMPLOYMENT", label: "Permit and partner liaison at Roam Electric" }] },
    { name: "Pump Systems & Boreholes", category: "Water", proficiency: 4, years: 1, evidence: [{ refType: "EMPLOYMENT", label: "Frisco Engineering field works" }, { refType: "CERTIFICATE", label: "Ebara pump technology training" }] },
    { name: "Water Systems", category: "Water", proficiency: 4, evidence: [{ refType: "EMPLOYMENT", label: "Frisco Engineering; KYPW coordination" }] },
    { name: "Python", category: "Software", proficiency: 3, years: 1, evidence: [{ refType: "PROJECT", label: "SafariCharge FastAPI service exploration" }] },
    { name: "TypeScript", category: "Software", proficiency: 4, years: 2, evidence: [{ refType: "PROJECT", label: "Rauell Systems web platforms (Next.js)" }] },
    { name: "React / Next.js", category: "Software", proficiency: 4, years: 2, evidence: [{ refType: "PROJECT", label: "SafariCharge, AI Academy, portfolio" }] },
    { name: "Energy Data Analysis", category: "Data", proficiency: 4, evidence: [{ refType: "CERTIFICATE", label: "FRED: data collection and cleaning techniques" }, { refType: "PROJECT", label: "SafariCharge analytics and forecasting" }] },
    { name: "GIS", category: "Data", proficiency: 3, evidence: [{ refType: "CERTIFICATE", label: "RCMRD GIS training" }] },
    { name: "Project Coordination", category: "Operations", proficiency: 4, evidence: [{ refType: "EMPLOYMENT", label: "Deployment coordination at Roam Electric" }, { refType: "PROJECT", label: "KYPW event coordination" }] },
    { name: "Techno-economic Analysis", category: "Energy", proficiency: 4, evidence: [{ refType: "CERTIFICATE", label: "FRED training programme" }, { refType: "EMPLOYMENT", label: "CAPEX planning at Roam Electric" }] },
    { name: "Automation", category: "Software", proficiency: 3, evidence: [{ refType: "PROJECT", label: "Rauell Systems automation tools" }] },
  ];
  for (const s of skills) {
    const skill = await prisma.skill.upsert({
      where: { userId_name: { userId, name: s.name } },
      create: {
        userId,
        name: s.name,
        category: s.category,
        proficiency: s.proficiency,
        yearsExperience: s.years,
        confidence: 90,
        verification: Verification.USER_PROVIDED,
        summary: `${s.name} at level ${s.proficiency}/5${s.years ? `, ~${s.years} year(s)` : ""}, evidence-verified`,
      },
      update: {},
    });
    for (const ev of s.evidence) {
      const exists = await prisma.skillEvidence.findFirst({
        where: { skillId: skill.id, refType: ev.refType, note: ev.label },
      });
      if (!exists) {
        await prisma.skillEvidence.create({
          data: { skillId: skill.id, refType: ev.refType, refId: ev.refType, note: ev.label },
        });
      }
    }
  }

  // ------------------------- Certificates & training -------------------------
  const certs = [
    { name: "FRED Energy Training Programme", issuer: "FRED", notes: "Energy systems fundamentals; data collection and cleaning; techno-economic modelling (HOMER, SAM); energy systems design; reporting and visualization; technical asset management" },
    { name: "Ebara Pump Technology Training", issuer: "Ebara", notes: "Pump systems and troubleshooting" },
    { name: "Solar Training", issuer: "Torchbearer Institute", notes: "Solar PV fundamentals and installation" },
    { name: "Electric Mobility Training", issuer: "AMC", notes: "E-mobility exposure" },
    { name: "TUMI Mobility Learning", issuer: "TUMI", notes: "Sustainable mobility" },
    { name: "PEM Motion Exposure", issuer: "PEM Motion", notes: "Mobility innovation" },
    { name: "GIS Training", issuer: "RCMRD", notes: "Geospatial information systems" },
    { name: "ESG Training", issuer: "Tech4Good", notes: "Environmental, social and governance" },
    { name: "Asana Workflow and Project Management", issuer: "Asana", notes: "Workflow and project management" },
    { name: "MBA-related Studies (in progress)", issuer: "University of East London via Unicaf", notes: "From 2025: strategy, operations, HRM, Industry 5.0, leadership, business analysis, alliance strategy, executive decision-making" },
  ];
  for (const c of certs) {
    await prisma.certificate.upsert({
      where: { userId_name: { userId, name: c.name } },
      create: { userId, name: c.name, issuer: c.issuer, notes: c.notes, verification: Verification.USER_PROVIDED },
      update: {},
    });
  }

  // ------------------------- Projects -------------------------
  const projects = [
    {
      name: "SafariCharge (Solar Simulation & Energy Planning Platform)",
      slug: "safaricharge",
      category: "Energy software",
      status: "ACTIVE" as const,
      repoUrl: "https://github.com/rauell1",
      urls: [
        { label: "App", url: "https://solar.rauell.systems" },
        { label: "Alt domain", url: "https://safaricharge.rauell.systems" },
      ],
      overview:
        "Engineering platform for solar and EV charging decision-making: describe the site, model demand, compare systems, explain the recommendation, share the decision. Deterministic 5-minute interval simulation over a ~50 kW PV / 48 kW inverter / 60 kWh battery baseline with 20 percent SOC floor and 22 kW EV charger context. Versioned assumptions, immutable simulation runs, tariff-aware energy modelling, NASA POWER solar resource data, financial modelling, scenario comparison and decision-ready reporting. Includes Battery Health Score concepts, telemetry (MQTT/Modbus) and AI insights.",
      goals: ["Decision-ready solar and EV charging modelling", "Transparent, auditable assumptions", "Battery health and telemetry integration"],
      milestones: [
        { title: "Core simulation engine with immutable runs", done: true },
        { title: "Scenario comparison and reporting", done: true },
        { title: "Battery telemetry ingestion (MQTT/Modbus)", done: false },
        { title: "Borehole/groundwater module", done: false },
      ],
      startedAt: d("2023-09-01"),
    },
    {
      name: "Rauell OS (Personal AI Operating System)",
      slug: "rauell-os",
      category: "AI / productivity",
      status: "ACTIVE" as const,
      repoUrl: "https://github.com/rauell1/AI-OS",
      overview:
        "This system: unified personal intelligence platform for opportunities, applications, projects, network, documents and chief-of-staff automation with a strict approval model.",
      goals: ["Become the single operating system for Roy's professional life"],
      milestones: [{ title: "V1 core workflows", done: false }],
      startedAt: d("2025-08-01"),
    },
    {
      name: "AI Academy (Learning Platform)",
      slug: "ai-academy",
      category: "Education software",
      status: "ACTIVE" as const,
      overview:
        "AI learning platform in the Rauell ecosystem: course catalogue, pathways, lesson player, labs and resource library. Planned: authentication, persistent progress, quizzes, certificates, RAG tutor and analytics.",
      goals: ["Practical AI education for African learners"],
      milestones: [{ title: "Course catalogue and lesson player", done: true }, { title: "Persistent progress and RAG tutor", done: false }],
      startedAt: d("2024-06-01"),
    },
    {
      name: "Greenwave Society Digital Systems",
      slug: "greenwave-digital",
      category: "Volunteering",
      status: "ACTIVE" as const,
      urls: [{ label: "Website", url: "https://greenwavesociety.org" }],
      overview:
        "Youth-led environmental organization: digital systems, website development, event coordination, branding and environmental communication.",
      goals: ["Grow youth climate engagement"],
      milestones: [{ title: "Website live", done: true }],
      startedAt: d("2023-01-01"),
    },
    {
      name: "Kenya Youth Parliament for Water Coordination",
      slug: "kypw",
      category: "Volunteering",
      status: "ACTIVE" as const,
      overview:
        "Event coordination for webinars, workshops, hackathons, dialogues and field visits; quarterly and annual planning, communications and partnership coordination.",
      goals: ["Strengthen youth voice in the water sector"],
      milestones: [{ title: "Quarterly event calendar institutionalized", done: true }],
      startedAt: d("2023-03-01"),
    },
  ];
  for (const p of projects) {
    const existing = await prisma.project.findUnique({ where: { userId_slug: { userId, slug: p.slug } } });
    if (!existing) {
      await prisma.project.create({ data: { userId, ...p } });
    }
  }

  // ------------------------- Goals -------------------------
  const goals = [
    { title: "Secure a fully funded Master's programme in renewable energy or energy systems", category: "EDUCATION", targetDate: d("2026-09-01"), description: "Target Erasmus Mundus and European master's programmes in sustainable energy, plus relevant scholarships (e.g. Mastercard Foundation)." },
    { title: "Advance renewable-energy engineering career", category: "CAREER", description: "Grow into energy systems design, EV infrastructure and energy data roles." },
    { title: "Develop SafariCharge into a production platform", category: "PROJECT", description: "Complete telemetry, borehole module and financial reporting." },
    { title: "Generate consulting leads for solar and energy planning", category: "BUSINESS", description: "Use SafariCharge and engineering dashboards as the offering." },
    { title: "Expand professional network in energy and climate", category: "NETWORK" },
    { title: "Deepen AI and software capabilities", category: "SKILLS", description: "Python AI stack, RAG systems, energy analytics." },
  ];
  for (const g of goals) {
    const existing = await prisma.goal.findFirst({ where: { userId, title: g.title } });
    if (!existing) await prisma.goal.create({ data: { userId, ...g } });
  }

  // ------------------------- Memory & preferences -------------------------
  const memories = [
    { category: "WRITING", content: "Roy prefers professional documents that are detailed, evidence-based and clearly structured, with quantified achievements when evidence supports the number. Avoid em dashes and en dashes in generated professional documents. Avoid generic AI filler and excessive buzzwords." },
    { category: "APPLICATIONS", content: "Priority study domains: renewable energy engineering, energy systems, sustainable energy, solar, smart grids, energy data, electric mobility, battery technology, environmental and water engineering. Fully funded programmes strongly preferred." },
    { category: "CAREER", content: "Roy is an Agricultural and Biosystems Engineer (JKUAT, Second Class Upper) targeting renewable energy, EV infrastructure, water systems, climate tech and energy data roles, in Kenya or remote, plus international master's study." },
    { category: "WORKFLOWS", content: "Everything sensitive (sending email, outreach, submissions, deletions, publishing) must pass through the Approval Center. AI prepares; Roy decides." },
  ];
  for (const m of memories) {
    const existing = await prisma.memory.findFirst({ where: { userId, content: m.content } });
    if (!existing) await prisma.memory.create({ data: { userId, ...m, source: "USER" } });
  }

  // ------------------------- Knowledge base seed -------------------------
  const kb = [
    {
      title: "Solar evaporative cooling for tomatoes (final-year project)",
      content: "Bachelor final-year project at JKUAT: designed and evaluated a solar evaporative cooling system for tomato storage. Results indicated greater than approximately 40 percent shelf-life improvement versus ambient storage. Evidence for post-harvest technology, sustainable cooling, climate adaptation and energy access in agriculture.",
      sourceType: "PROFILE",
    },
    {
      title: "Roam Electric charging deployment footprint",
      content: "Charging infrastructure development across Nairobi and surrounds: Utawala, Kayole, Ngong, Gitaru, Kiambu, Ruiru, Makadara, Ridgeways, Ruaka, Kingara Road, Kiserian, Kawangware, Rongai, Kitengela, Adams, Suna Road, Umoja, Kariobangi, Industrial Area, Parklands, Lower Kabete, Point Mall, Buruburu, Kasarani, Huruma, Ngara. Documents handled: title deeds, leases, electricity meter information, account numbers, KRA documentation, ID documents, business permits, trade licences, property authorization.",
      sourceType: "PROFILE",
    },
    {
      title: "SafariCharge engineering principles",
      content: "Transparent assumptions, versioned assumptions, deterministic calculations, immutable simulation runs, reproducibility, scenario comparison, clear financial-model definitions, decision-ready reporting, auditability. Baselines: 50 kW PV, 48 kW inverter, 60 kWh battery, 22 kW EV charger, 20 percent SOC floor, 5-minute intervals. Data: NASA POWER, Meteonorm-related resources.",
      sourceType: "PROFILE",
    },
    {
      title: "Frisco Engineering borehole work contexts",
      content: "Mara off-grid sites, Zuri Prime Farms, Notre Dame borehole works. Issues diagnosed: worn impellers, worn spacers, misaligned shafts, electrical winding imbalance, motor damage, low output, potential aquifer depletion. Capabilities: pump testing, flow-rate assessment, camera inspection, fishing operations, flushing recommendations, costing.",
      sourceType: "PROFILE",
    },
  ];
  for (const k of kb) {
    const existing = await prisma.knowledgeItem.findFirst({ where: { userId, title: k.title } });
    if (!existing) await prisma.knowledgeItem.create({ data: { userId, ...k } });
  }

  await prisma.user.update({ where: { id: userId }, data: { onboardedAt: user.onboardedAt ?? new Date() } });

  console.log("Seed complete. Sign in with:");
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: (SEED_PASSWORD or the default documented in prisma/seed.ts)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
