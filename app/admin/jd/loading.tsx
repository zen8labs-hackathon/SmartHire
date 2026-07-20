import { JdHeader } from "@/components/admin/jd/dashboard/jd-header";
import { JdListSkeleton } from "@/components/admin/jd/jd-list-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <JdHeader />

      <JdListSkeleton />
    </div>
  );
}
