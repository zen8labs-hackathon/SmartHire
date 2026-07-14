import { PageHeader } from "@/components/admin/shell/page-header";
import { DataTableSkeleton } from "@/components/admin/shell/table-system";

export default function UsersLoading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Users & Access"
        description="Manage member logins, access permissions, and roles."
      />

      <DataTableSkeleton columnsCount={2} rowsCount={4} />
    </div>
  );
}
