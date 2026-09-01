import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { EmptyState, PageHeader } from "@/components/widgets";
import { DocumentDialog } from "@/components/modals";
import { DocumentList } from "@/components/document-list";

export default async function DocumentsPage() {
  const user = await requireUser();
  const db = await getDb();
  const docs = await db.query(`SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC`, [user.id]);

  return (
    <div>
      <PageHeader title="Document Vault" description="Secure document metadata with local file storage. Sensitive files are never sent to AI without an explicit purpose."
        action={<DocumentDialog />} />

      {docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Certificates, transcripts, CVs and letters live here, so an application can point at the file it needs instead of you hunting for it."
          action={<DocumentDialog />}
        />
      ) : (
        <DocumentList docs={docs} />
      )}
    </div>
  );
}
