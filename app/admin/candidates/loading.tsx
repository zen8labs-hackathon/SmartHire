import { DataTableSkeleton } from "@/components/admin/shell/table-system";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 font-sans">
      <div className="animate-pulse">
        <div className="h-7 w-40 rounded bg-default-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-default-100" />
      </div>

      <DataTableSkeleton columnsCount={6} rowsCount={5} />
    </div>
  );
}
