import { PageHeader } from "@/components/admin/shell/page-header";
import { DataTableSkeleton } from "@/components/admin/shell/table-system";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Active Candidates"
        description="Search, filter, and screen candidate resume profiles."
      />

      <DataTableSkeleton columnsCount={6} rowsCount={5} />
    </div>
  );
}
