import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/widgets";

export default async function OnboardingWizard() {
  const user = await requireUser();
  const db = await getDb();
  
  // Check if they already have a profile
  const existing = await db.get(`SELECT id FROM profiles WHERE user_id = ?`, [user.id]);
  
  async function completeOnboarding(formData: FormData) {
    "use server";
    const user = await requireUser();
    const db = await getDb();
    const { newId, nowISO } = await import("@/lib/utils");
    
    if (!existing) {
      await db.insert("profiles", {
        id: newId("prf"),
        user_id: user.id,
        headline: String(formData.get("headline")),
        summary: String(formData.get("summary")),
        location: String(formData.get("location")),
        created_at: nowISO(),
        updated_at: nowISO()
      });
    }
    redirect("/");
  }

  return (
    <div className="max-w-xl mx-auto py-12">
      <h1 className="text-3xl font-semibold mb-2">Welcome to Rauell OS</h1>
      <p className="text-zinc-400 mb-8">Let's set up your master profile. You can always update this later.</p>
      
      <form action={completeOnboarding} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Professional Headline</label>
          <input name="headline" required placeholder="e.g. Senior Software Engineer" className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Location</label>
          <input name="location" placeholder="e.g. London, UK" className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Brief Summary</label>
          <textarea name="summary" required rows={4} placeholder="A short bio..." className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm"></textarea>
        </div>
        <div className="pt-4 flex items-center justify-between">
          <Link href="/profile/import" className="text-sm text-blue-400 hover:underline">Import from LinkedIn instead?</Link>
          <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-500 transition-colors">
            Save Profile
          </button>
        </div>
      </form>
    </div>
  );
}
