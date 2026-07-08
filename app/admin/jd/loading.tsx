import { DataTableSkeleton } from "@/components/admin/shell/table-system";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <div className="animate-pulse">
        <div className="h-7 w-48 rounded bg-default-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-default-100" />
      </div>

      <DataTableSkeleton columnsCount={8} rowsCount={5} />
    </div>
  );
}
