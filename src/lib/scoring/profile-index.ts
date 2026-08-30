import { prisma } from "@/lib/db";

/**
 * A normalized, searchable index over Roy's Master Profile.
 * Built per scoring run (cheap at personal scale) and shared by the job,
 * scholarship and lead engines so all engines reason over the same facts.
 */
export type ProfileIndex = {
  skills: { name: string; category?: string; proficiency: number; years?: number | null }[];
  titles: string[];
  employers: string[];
  projects: { name: string; overview?: string | null }[];
  degrees: { degree: string; field?: string | null; institution: string; grade?: string | null }[];
  certificates: string[];
  sectors: string[];
  hasBachelor: boolean;
  gradeLevel: "FIRST" | "UPPER_SECOND" | "LOWER_SECOND" | "PASS" | "UNKNOWN";
  yearsTotal: number;
  textBlob: string;
};

export async function buildProfileIndex(userId: string): Promise<ProfileIndex> {
  const [profile, skills, employments, projects, educations, certificates] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.skill.findMany({ where: { userId } }),
    prisma.employment.findMany({ where: { userId }, include: { organization: true } }),
    prisma.project.findMany({ where: { userId } }),
    prisma.education.findMany({ where: { userId } }),
    prisma.certificate.findMany({ where: { userId } }),
  ]);

  const titles = employments.map((e) => e.title);
  const employers = employments.map((e) => e.organization?.name ?? "");
  const yearsTotal = employments.reduce((sum, e) => {
    const start = e.startDate ? e.startDate.getTime() : Date.parse("2021-01-01");
    const end = e.current ? Date.now() : e.endDate ? e.endDate.getTime() : start;
    return sum + Math.max(0, (end - start) / (365.25 * 86400000));
  }, 0);

  let gradeLevel: ProfileIndex["gradeLevel"] = "UNKNOWN";
  for (const ed of educations) {
    const g = `${ed.grade ?? ""} ${ed.classification ?? ""}`.toLowerCase();
    if (g.includes("first class") && !g.includes("second")) gradeLevel = "FIRST";
    else if (g.includes("upper")) gradeLevel = gradeLevel === "FIRST" ? "FIRST" : "UPPER_SECOND";
    else if (g.includes("lower")) gradeLevel = gradeLevel === "UNKNOWN" ? "LOWER_SECOND" : gradeLevel;
  }

  const prefs = (profile?.careerPreferences ?? {}) as { domains?: string[] };
  const sectors = prefs.domains ?? [];

  const textBlob = [
    skills.map((s) => `${s.name} ${s.category ?? ""}`).join(" "),
    titles.join(" "),
    employers.join(" "),
    projects.map((p) => `${p.name} ${p.overview ?? ""} ${p.category ?? ""}`).join(" "),
    educations.map((e) => `${e.degree} ${e.field ?? ""} ${e.institution}`).join(" "),
    certificates.map((c) => `${c.name} ${c.issuer ?? ""}`).join(" "),
    sectors.join(" "),
    employments.flatMap((e) => ((e.highlights as string[] | null) ?? []).join(" ")).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return {
    skills: skills.map((s) => ({
      name: s.name,
      category: s.category ?? undefined,
      proficiency: s.proficiency,
      years: s.yearsExperience,
    })),
    titles,
    employers: employers.filter(Boolean),
    projects: projects.map((p) => ({ name: p.name, overview: p.overview })),
    degrees: educations.map((e) => ({
      degree: e.degree,
      field: e.field,
      institution: e.institution,
      grade: e.grade ?? e.classification,
    })),
    certificates: certificates.map((c) => c.name),
    sectors,
    hasBachelor: educations.some((e) => /bachelor|b\.sc|bsc|beng|b\.eng/i.test(`${e.degree} ${e.field ?? ""}`)),
    gradeLevel,
    yearsTotal: Math.round(yearsTotal * 10) / 10,
    textBlob,
  };
}
