import { getDb, runAsUser } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { aiEnabled } from "@/lib/ai";
import {
  emptyProfile,
  parseCvText,
  parseLinkedInZip,
  parseProfileJson,
  parsedCount,
  type ParsedProfile,
} from "@/lib/importers";
import { newId, nowISO } from "@/lib/utils";
// Split out so the result of the last upload renders without a page navigation.
import { ImportForm, type ImportResult } from "@/components/import-form";

export const dynamic = "force-dynamic";

/** Writes a parsed profile, skipping anything already on the account. */
async function persist(userId: string, parsed: ParsedProfile) {
  const db = await getDb();
  const counts = { skills: 0, education: 0, employment: 0, projects: 0 };

  const existingSkills = new Set(
    (await db.query<{ name: string }>(`SELECT name FROM skills WHERE user_id = ?`, [userId])).map((r) =>
      r.name.toLowerCase()
    )
  );
  for (const s of parsed.skills) {
    if (existingSkills.has(s.name.toLowerCase())) continue;
    existingSkills.add(s.name.toLowerCase());
    await db.insert("skills", {
      id: newId("skl"),
      user_id: userId,
      name: s.name,
      category: s.category || "Imported",
      proficiency: "Proficient",
      verification: "user_provided",
      created_at: nowISO(),
    });
    counts.skills++;
  }

  const existingEdu = new Set(
    (await db.query<{ institution: string }>(`SELECT institution FROM education WHERE user_id = ?`, [userId])).map(
      (r) => r.institution.toLowerCase()
    )
  );
  for (const e of parsed.education) {
    if (existingEdu.has(e.institution.toLowerCase())) continue;
    existingEdu.add(e.institution.toLowerCase());
    await db.insert("education", {
      id: newId("edu"),
      user_id: userId,
      institution: e.institution,
      degree: e.degree || null,
      field: e.field || null,
      start_year: e.start_year ?? null,
      end_year: e.end_year ?? null,
      status: e.end_year ? "graduated" : "in_progress",
      details_json: "{}",
      verification: "user_provided",
      created_at: nowISO(),
    });
    counts.education++;
  }

  const existingEmp = new Set(
    (await db.query<{ title: string }>(`SELECT title FROM employment WHERE user_id = ?`, [userId])).map((r) =>
      r.title.toLowerCase()
    )
  );
  for (const w of parsed.employment) {
    if (existingEmp.has(w.title.toLowerCase())) continue;
    existingEmp.add(w.title.toLowerCase());
    await db.insert("employment", {
      id: newId("emp"),
      user_id: userId,
      organization_id: null,
      title: w.title,
      role_category: null,
      start_date: w.start_date || null,
      end_date: w.end_date || null,
      current: w.current ? 1 : 0,
      location: null,
      summary: w.summary || (w.organization ? `At ${w.organization}.` : null),
      responsibilities_json: "[]",
      verification: "user_provided",
      created_at: nowISO(),
    });
    counts.employment++;
  }

  const existingProjects = new Set(
    (await db.query<{ name: string }>(`SELECT name FROM projects WHERE user_id = ?`, [userId])).map((r) =>
      r.name.toLowerCase()
    )
  );
  for (const p of parsed.projects) {
    if (existingProjects.has(p.name.toLowerCase())) continue;
    existingProjects.add(p.name.toLowerCase());
    await db.insert("projects", {
      id: newId("prj"),
      user_id: userId,
      name: p.name,
      category: "imported",
      status: "active",
      overview: p.overview || null,
      goals_json: "[]",
      decisions_json: "[]",
      risks_json: "[]",
      next_actions_json: "[]",
      github_json: "[]",
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    counts.projects++;
  }

  // The profile row is a single record, so fill only the blanks rather than
  // overwriting something the owner has already written by hand.
  if (parsed.headline || parsed.summary || parsed.location) {
    const current = await db.get<{ user_id: string; headline: string; summary: string; location: string }>(
      `SELECT user_id, headline, summary, location FROM profiles WHERE user_id = ?`,
      [userId]
    );
    if (!current) {
      await db.insert("profiles", {
        user_id: userId,
        headline: parsed.headline || "",
        summary: parsed.summary || "",
        location: parsed.location || "",
        nationality: "",
        linkedin_url: "",
        portfolio_url: "",
        resume_url: "",
        updated_at: nowISO(),
      });
    } else {
      await db.run(
        `UPDATE profiles SET headline = COALESCE(NULLIF(headline, ''), ?), summary = COALESCE(NULLIF(summary, ''), ?), location = COALESCE(NULLIF(location, ''), ?), updated_at = ? WHERE user_id = ?`,
        [parsed.headline || "", parsed.summary || "", parsed.location || "", nowISO(), userId]
      );
    }
  }

  return counts;
}

export default async function DataImporter() {
  await requireUser();
  const aiOn = aiEnabled();

  async function uploadData(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
    "use server";
    const user = await requireUser();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { ok: false, message: "Choose a file first." };
    }

    return runAsUser(user.id, async () => {
      const name = file.name.toLowerCase();
      let parsed: ParsedProfile = emptyProfile();

      try {
        if (name.endsWith(".zip")) {
          parsed = await parseLinkedInZip(await file.arrayBuffer());
        } else if (name.endsWith(".json")) {
          parsed = parseProfileJson(await file.text());
        } else if (name.endsWith(".pdf")) {
          const buffer = Buffer.from(await file.arrayBuffer());
          let text = "";
          try {
            const pdf = (await import("pdf-parse")).default;
            text = (await pdf(buffer)).text.replace(/\0/g, "").trim();
          } catch (err: any) {
            return {
              ok: false,
              message: "That PDF could not be opened.",
              notes: [String(err?.message || err)],
            };
          }
          parsed = await parseCvText(text, user.id);
        } else {
          return {
            ok: false,
            message: `${file.name} is not a supported format.`,
            notes: ["Upload a LinkedIn ZIP export, a CV as PDF, or a JSON profile."],
          };
        }
      } catch (err: any) {
        console.error(`[rauell-os] Profile import failed for ${file.name}: ${err?.message || err}`);
        return { ok: false, message: "The file could not be read.", notes: [String(err?.message || err)] };
      }

      if (parsedCount(parsed) === 0) {
        // Nothing was imported, so nothing is recorded as imported. This used to
        // write a "Imported data from X" activity entry either way, which made a
        // silent no-op look like a success.
        return {
          ok: false,
          message: `Nothing was imported from ${file.name}.`,
          notes: parsed.notes,
        };
      }

      const counts = await persist(user.id, parsed);
      const total = counts.skills + counts.education + counts.employment + counts.projects;

      if (total > 0) {
        const db = await getDb();
        await db.insert("activity_events", {
          id: newId("act"),
          user_id: user.id,
          type: "data_import",
          summary: `Imported ${total} record(s) from ${file.name}`,
          created_at: nowISO(),
        });
      }

      revalidatePath("/profile");
      revalidatePath("/profile/import");

      const notes = [...parsed.notes];
      const skipped = parsedCount(parsed) - total;
      if (skipped > 0) notes.push(`${skipped} record(s) were already on your profile and were left alone.`);

      return {
        ok: true,
        message: total > 0 ? `Imported ${total} record(s) from ${file.name}.` : `Everything in ${file.name} was already on your profile.`,
        counts: [
          { label: "Skills", value: counts.skills },
          { label: "Education", value: counts.education },
          { label: "Employment", value: counts.employment },
          { label: "Projects", value: counts.projects },
        ].filter((c) => c.value > 0),
        notes,
      };
    });
  }

  return <ImportForm action={uploadData} aiOn={aiOn} />;
}
