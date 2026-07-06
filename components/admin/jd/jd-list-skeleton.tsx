import { DataTableSkeleton } from "@/components/admin/shell/table-system";

export function JdListSkeleton() {
  return (
    <div className="flex flex-col gap-6 font-sans">
      <DataTableSkeleton columnsCount={8} rowsCount={5} />
    </div>
  );
}
