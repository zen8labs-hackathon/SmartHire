import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/admin/shell/page-header";
import { SectionCard } from "@/components/admin/shell/cards";
import {
  StatsGridSkeleton,
  SectionListSkeleton,
  TimelineSkeleton,
} from "./dashboard-skeletons";

export default function Loading() {
  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Admin Control Panel"
        description="Monitor system metrics, active pipelines, recent uploads, and account changes."
      />

      <StatsGridSkeleton />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <SectionCard
            title="Recent Jobs"
            description="Newly created or updated job openings."
            actions={
              <Link
                href="/admin/jd"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            <SectionListSkeleton rows={5} />
          </SectionCard>
        </div>

        <div className="lg:col-span-6">
          <SectionCard
            title="Recent Candidates"
            description="Latest applicant CV uploads and parses."
            actions={
              <Link
                href="/admin/candidates"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5"
              >
                View pool <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            <SectionListSkeleton rows={5} />
          </SectionCard>
        </div>

        <div className="lg:col-span-12">
          <SectionCard
            title="Recent Activities"
            description="Audit events recorded for candidate CV updates and restorations."
          >
            <TimelineSkeleton />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
