import { PageHeader } from "@/components/widgets";
import { Chat } from "@/components/chat";

export default function AIPage() {
  return (
    <div>
      <PageHeader title="AI Assistant" description="A Chief of Staff that queries your structured data before answering. No fabrication, evidence-based." />
      <Chat />
    </div>
  );
}
