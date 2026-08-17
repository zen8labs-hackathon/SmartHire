import { PageHeader } from "@/components/admin/shell/page-header";
import { DataTableSkeleton } from "@/components/admin/shell/table-system";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Email Config"
        description="Manage email templates, general send settings, and view sent email logs."
      />

      <DataTableSkeleton />
    </div>
  );
}
