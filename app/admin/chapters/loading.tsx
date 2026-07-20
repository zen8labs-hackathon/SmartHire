import { PageHeader } from "@/components/admin/shell/page-header";
import { ChaptersListSkeleton } from "@/components/admin/chapters-list-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Chapters & Departments"
        description="Define recruiting chapters to organize roles, users, and viewer permissions."
      />

      <ChaptersListSkeleton />
    </div>
  );
}
