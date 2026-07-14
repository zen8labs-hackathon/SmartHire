import { Breadcrumbs } from "@heroui/react";

import { SectionCard } from "@/components/admin/shell/cards";

function FieldSkeleton() {
  return (
    <div className="animate-pulse bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
      <div className="h-2.5 w-16 rounded bg-default-200 mb-2" />
      <div className="h-4 w-24 rounded bg-default-100" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 font-sans">
      <Breadcrumbs className="text-xs text-muted">
        <Breadcrumbs.Item href="/admin/jd">Jobs list</Breadcrumbs.Item>
        <Breadcrumbs.Item>
          <span className="inline-block h-3 w-24 animate-pulse rounded bg-default-200 align-middle" />
        </Breadcrumbs.Item>
        <Breadcrumbs.Item>Evaluation</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className="flex gap-6 items-start">
        {/* Left: CV viewer */}
        <div className="w-5/12 shrink-0 sticky top-6">
          <div className="mb-2 h-3 w-32 animate-pulse rounded bg-default-200" />
          <div
            className="w-full animate-pulse rounded-xl border border-divider bg-surface-secondary/40"
            style={{ height: "calc(100vh - 120px)" }}
          />
        </div>

        {/* Right: Evaluation info */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div>
            <div className="h-7 w-48 animate-pulse rounded bg-default-200" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-default-100" />
          </div>

          <SectionCard
            title="Candidate Details"
            description="Personal profile, academic background, and timeline records."
          >
            <div className="grid gap-3 sm:grid-cols-2 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <FieldSkeleton key={i} />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Pre-interview note"
            description="Write questions or topics to cover with the candidate during the interview. This is saved per candidate for this role and is included when you generate the evaluation PDF."
          >
            <div className="pt-2">
              <div className="h-32 w-full animate-pulse rounded-xl border border-divider bg-surface-secondary/20" />
            </div>
          </SectionCard>

          <SectionCard
            title="Saved interview notes"
            description="Everyone on the hiring team can add notes. The PDF uses the combined notes in chronological order."
          >
            <div className="pt-2 flex flex-col gap-3">
              <div className="h-16 w-full animate-pulse rounded-xl border border-divider bg-surface-secondary/20" />
              <div className="h-16 w-full animate-pulse rounded-xl border border-divider bg-surface-secondary/20" />
            </div>
          </SectionCard>

          <SectionCard
            title="Add a note after interview"
            description={
              'Write in Vietnamese or English; the evaluation follows your language. Save a note on its own, or type and use “Regenerate” to save that text and create the PDF in one step.'
            }
          >
            <div className="pt-2">
              <div className="h-40 w-full animate-pulse rounded-xl border border-divider bg-surface-secondary/20" />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
