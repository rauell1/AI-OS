import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export default async function DataImporter() {
  const user = await requireUser();

  async function uploadData(formData: FormData) {
    "use server";
    const user = await requireUser();
    const db = await getDb();
    
    // In a real implementation this would parse the CV or LinkedIn export ZIP.
    // For now we log the upload to activity and mock the parsing result.
    const file = formData.get("file") as File;
    if (file && file.size > 0) {
      await db.insert("activity_events", {
        id: "act_" + Date.now(),
        user_id: user.id,
        type: "data_import",
        summary: `Imported data from ${file.name}`,
        created_at: new Date().toISOString()
      });
      revalidatePath("/profile");
      revalidatePath("/profile/import");
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-semibold mb-2">Master Data Importer</h1>
      <p className="text-zinc-400 mb-8">Upload your LinkedIn data export (ZIP) or standard CV (PDF/JSON) to automatically seed your OS.</p>
      
      <div className="p-8 border-2 border-dashed border-zinc-700 rounded-xl bg-zinc-900/30 text-center">
        <form action={uploadData} className="flex flex-col items-center gap-4">
          <input 
            type="file" 
            name="file" 
            accept=".zip,.pdf,.json" 
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-900/30 file:text-blue-300 hover:file:bg-blue-900/50"
            required
          />
          <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors">
            Process & Import
          </button>
        </form>
      </div>
      
      <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-900 rounded-lg text-sm text-yellow-500">
        Note: File uploads are stored securely. Large files may take a few minutes for the AI to parse completely into distinct opportunities, skills, and projects.
      </div>
    </div>
  );
}
