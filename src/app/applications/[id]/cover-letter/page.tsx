import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function CoverLetterWorkspace({ params }: { params: Promise<{ id: string }> }) {
  // Resolved before the server action below closes over it: params is a promise
  // from Next 15 on, and a promise cannot be a bound argument to a server action.
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  
  const app = await db.get(`SELECT * FROM applications WHERE id = ? AND user_id = ?`, [id, user.id]);
  if (!app) return notFound();
  
  const versions = await db.query(`SELECT * FROM application_versions WHERE application_id = ? AND kind = 'cover_letter' ORDER BY version DESC`, [app.id]);
  const activeVersion = versions[0];

  async function saveLetter(formData: FormData) {
    "use server";
    const user = await requireUser();
    const db = await getDb();
    const content = formData.get("content") as string;
    
    const v = await db.query(`SELECT version FROM application_versions WHERE application_id = ? AND kind = 'cover_letter' ORDER BY version DESC LIMIT 1`, [id]);
    const nextVersion = v.length > 0 ? v[0].version + 1 : 1;
    
    await db.insert("application_versions", {
      id: "cvl_" + Date.now(),
      application_id: id,
      kind: "cover_letter",
      version: nextVersion,
      title: `Version ${nextVersion}`,
      content: content,
      model: "manual",
      created_at: new Date().toISOString()
    });
    
    revalidatePath(`/applications/${id}/cover-letter`);
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 grid grid-cols-3 gap-8">
      <div className="col-span-2">
        <h1 className="text-3xl font-semibold mb-2">Cover Letter Workspace</h1>
        <p className="text-zinc-400 mb-6">Tailor your cover letter for {app.title}.</p>
        
        <form action={saveLetter} className="space-y-4">
          <textarea 
            name="content"
            defaultValue={activeVersion?.content || ""}
            className="w-full h-[600px] p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300 font-serif leading-relaxed focus:ring-1 focus:ring-blue-500 outline-none"
            placeholder="Draft your cover letter here..."
          />
          <div className="flex justify-end">
            <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors">
              Save New Version
            </button>
          </div>
        </form>
      </div>
      
      <div className="col-span-1 border-l border-zinc-800 pl-8">
        <h3 className="text-lg font-medium mb-4">Version History</h3>
        {versions.length === 0 ? (
          <p className="text-zinc-500 text-sm">No versions saved yet.</p>
        ) : (
          <ul className="space-y-3">
            {versions.map((v) => (
              <li key={v.id} className="p-3 border border-zinc-800 rounded bg-zinc-900/50">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm text-zinc-300">Version {v.version}</span>
                  <span className="text-xs text-zinc-500">{new Date(v.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-zinc-500">Source: {v.model || 'manual'}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
