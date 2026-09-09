import { PageHeader } from "@/components/admin/shell/page-header";
import { TemplateSkeleton } from "@/components/admin/candidate-evaluation-template/template-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Evaluation Template"
        description="Build a library of reusable interview evaluation templates -- attach one to a job when you create it."
      />

      <TemplateSkeleton />
    </div>
  );
}
