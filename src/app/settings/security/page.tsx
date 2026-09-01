import { requireUser } from "@/lib/auth";
import { getMfaStatus } from "@/lib/mfa";
import { PageHeader } from "@/components/widgets";
import { SecuritySettings } from "@/components/security-settings";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();
  const status = await getMfaStatus(user.id);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Security"
        description="One account, one password. A second factor is what stands between a leaked password and everything in here."
      />
      <SecuritySettings status={status} email={user.email} />
    </div>
  );
}
