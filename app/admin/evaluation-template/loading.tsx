import { PageHeader } from "@/components/admin/shell/page-header";
import { TemplateSkeleton } from "@/components/admin/candidate-evaluation-template/template-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <PageHeader
        title="Evaluation Template"
        description="Upload and manage the PDF document used as each job's candidate interview evaluation form."
      />

      <TemplateSkeleton />
    </div>
  );
}
