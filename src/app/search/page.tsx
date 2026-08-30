import { PageHeader } from "@/components/widgets";
import { SearchBox } from "@/components/search-box";

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" description="One search across projects, tasks, opportunities, applications, people, organizations and documents." />
      <SearchBox />
    </div>
  );
}
