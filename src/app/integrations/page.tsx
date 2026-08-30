import { requireUser } from "@/lib/auth";
import { getIntegrationStatus } from "@/app/actions/integrations";
import { PageHeader } from "@/components/widgets";
import { IntegrationCard } from "@/components/integration-controls";

export default async function IntegrationsPage() {
  await requireUser();
  const items = await getIntegrationStatus();

  return (
    <div>
      <PageHeader title="Integrations" description="Secure, permission-scoped connections. OAuth tokens are encrypted at rest and never exposed to the browser." />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => <IntegrationCard key={item.key} item={item} />)}
      </div>
    </div>
  );
}
