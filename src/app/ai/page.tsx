import { PageHeader } from "@/components/widgets";
import { Chat } from "@/components/chat";

export default function AIPage() {
  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[32rem] flex-col">
      <PageHeader title="AI Assistant" description="A Chief of Staff that queries your structured data before answering. No fabrication, evidence-based." />
      <div className="flex-1 overflow-hidden">
        <Chat />
      </div>
    </div>
  );
}
