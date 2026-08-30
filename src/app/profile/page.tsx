import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getMasterProfile } from "@/lib/profile";
import { parseJSON } from "@/lib/utils";
import { PageHeader, KeyValue } from "@/components/widgets";
import { Badge, Card, CardContent, CardHeader, CardTitle, Button, Input, Label, NativeSelect, Textarea } from "@/components/ui";
import { addSkillForm, addEducationForm, addEmploymentForm } from "@/app/actions/profile";

const profTone: Record<string, any> = { Advanced: "success", Proficient: "accent", Developing: "warning", Basic: "neutral" };

export default async function ProfilePage() {
  const user = await requireUser();
  const mp = await getMasterProfile(user.id);

  return (
    <div>
      <PageHeader title="Master Profile" description="A normalized, evidence-linked profile. Editing here updates every generated CV and application."
        action={
          <div className="flex gap-2">
            <Link href="/profile/import"><Button size="sm" variant="primary">Import Data</Button></Link>
            <Link href="/settings"><Button size="sm" variant="outline">Edit settings</Button></Link>
          </div>
        } />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>{mp.user.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium text-accent">{mp.headline}</p>
              <p className="text-sm text-muted">{mp.summary}</p>
              <div className="grid grid-cols-2 gap-2">
                <KeyValue label="Nationality" value={mp.profile?.nationality} />
                <KeyValue label="Location" value={mp.profile?.location} />
                <KeyValue label="Portfolio" value={mp.profile?.portfolio_url ? <a href={mp.profile.portfolio_url} className="text-accent hover:underline">{mp.profile.portfolio_url}</a> : "—"} />
                <KeyValue label="Email" value={mp.user.email} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Skills & evidence</CardTitle><span className="text-xs text-muted">{mp.skills.length} skills</span></CardHeader>
            <CardContent className="space-y-2">
              {mp.skills.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.name}</span>
                    <Badge tone={profTone[s.proficiency] || "neutral"}>{s.proficiency}</Badge>
                  </div>
                  <p className="text-[11px] text-muted">{s.category} · {s.years ? `${s.years}y` : "—"} · confidence {Math.round((s.confidence || 1) * 100)}% · {s.verification}</p>
                </div>
              ))}
              <form action={addSkillForm} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2">
                <Input name="name" placeholder="Skill name" className="h-8 text-sm" />
                <NativeSelect name="proficiency" defaultValue="Proficient" className="h-8 text-sm">
                  <option>Basic</option><option>Developing</option><option>Proficient</option><option>Advanced</option>
                </NativeSelect>
                <Input name="category" placeholder="Category" className="h-8 text-sm" />
                <Input name="years" placeholder="Years" className="h-8 w-20 text-sm" />
                <Button type="submit" size="sm" variant="primary" className="col-span-2">Add skill</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {mp.employment.map((e) => {
                const resp = parseJSON<string[]>(e.responsibilities_json, []);
                return (
                  <div key={e.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{e.title}</p>
                      <span className="text-[11px] text-muted">{e.current ? "Current" : `${e.start_date || ""} – ${e.end_date || ""}`}</span>
                    </div>
                    <p className="text-xs text-muted">{e.location}</p>
                    <p className="mt-1 text-sm text-muted">{e.summary}</p>
                    {resp.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">{resp.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                  </div>
                );
              })}
              <form action={addEmploymentForm} className="space-y-2 rounded-lg border border-border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input name="title" placeholder="Title" className="h-8 text-sm" />
                  <Input name="organization_id" placeholder="Org id (optional)" className="h-8 text-sm" />
                </div>
                <Input name="summary" placeholder="Summary" className="h-8 text-sm" />
                <div className="flex gap-2">
                  <Input name="start_date" placeholder="Start" className="h-8 text-sm" />
                  <Input name="end_date" placeholder="End" className="h-8 text-sm" />
                  <Button type="submit" size="sm" variant="primary">Add</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Education</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {mp.education.map((e) => {
                const d = parseJSON<any>(e.details_json, {});
                return (
                  <div key={e.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium">{e.degree} · {e.field}</p>
                    <p className="text-xs text-muted">{e.institution} ({e.start_year}–{e.end_year || "present"})</p>
                    {d.classification && <p className="mt-1 text-[11px] text-muted">{d.classification}</p>}
                    {d.finalProject && <p className="mt-1 text-[11px] text-muted">{d.finalProject}</p>}
                  </div>
                );
              })}
              <form action={addEducationForm} className="space-y-2 rounded-lg border border-border p-3">
                <Input name="institution" placeholder="Institution" className="h-8 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <Input name="degree" placeholder="Degree" className="h-8 text-sm" />
                  <Input name="field" placeholder="Field" className="h-8 text-sm" />
                </div>
                <Button type="submit" size="sm" variant="primary">Add education</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Goals</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {mp.goals.map((g) => <li key={g.id} className="flex gap-2"><span className="text-accent">▸</span><div><p className="font-medium">{g.title}</p>{g.description && <p className="text-[11px] text-muted">{g.description}</p>}</div></li>)}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Projects</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {mp.projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="block rounded-lg border border-border p-2.5 text-sm hover:bg-surface-2">
                  <span className="font-medium">{p.name}</span>
                  <p className="text-[11px] text-muted">{p.category}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
