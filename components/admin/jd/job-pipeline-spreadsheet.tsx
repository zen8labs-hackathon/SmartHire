"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import {
  AddCandidateModal,
  type JdPipelineCampaignOption,
} from "@/components/admin/candidates/add-candidate-modal";
import { JdAppliedCandidatesPipeline } from "@/components/admin/jd/jd-applied-candidates-pipeline";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

import { Breadcrumbs, Button, Card } from "@heroui/react";

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

type Props = {
  jobDescriptionId: number;
  jobId: string;
  jobTitle: string;
  initialPipelineCandidates: CandidateDbRow[];
  initialPipelineFetchFailed: boolean;
  linkedJobOpeningId: string | null;
  linkedJobOpeningTitle: string | null;
};

export function JobPipelineSpreadsheet({
  jobDescriptionId,
  jobId,
  jobTitle,
  initialPipelineCandidates,
  initialPipelineFetchFailed,
  linkedJobOpeningId,
  linkedJobOpeningTitle,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [addCandidatesOpen, setAddCandidatesOpen] = useState(false);
  const [pipelineRows, setPipelineRows] = useState(initialPipelineCandidates);
  const [pipelineLoadState, setPipelineLoadState] = useState<
    "idle" | "loading" | "error" | "ok"
  >(() => (initialPipelineFetchFailed ? "error" : "ok"));

  const jdPipelineCampaign: JdPipelineCampaignOption | undefined = useMemo(() => {
    if (linkedJobOpeningId && linkedJobOpeningTitle) {
      return { jobOpeningId: linkedJobOpeningId, title: linkedJobOpeningTitle };
    }
    return "no_opening_linked";
  }, [linkedJobOpeningId, linkedJobOpeningTitle]);

  const refetchPipeline = useCallback(async () => {
    setPipelineLoadState("loading");
    try {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch(
        `/api/admin/candidates?jobDescriptionId=${jobDescriptionId}`,
        { credentials: "include", headers: { ...h } },
      );
      if (!res.ok) {
        setPipelineLoadState("error");
        return;
      }
      const json = (await res.json()) as { candidates?: CandidateDbRow[] };
      setPipelineRows(json.candidates ?? []);
      setPipelineLoadState("ok");
    } catch {
      setPipelineLoadState("error");
    }
  }, [jobDescriptionId, supabase]);

  return (
    <div className="relative flex flex-col gap-6 pb-20">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Breadcrumbs className="text-xs text-muted">
            <Breadcrumbs.Item href="/admin/jd">Job descriptions</Breadcrumbs.Item>
            <Breadcrumbs.Item>{jobTitle}</Breadcrumbs.Item>
          </Breadcrumbs>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {jobTitle} pipeline
          </h1>
          <p className="max-w-2xl text-sm text-muted">
            Stages: New → Interview → Offer → Failed. JD match scores match the
            Candidates page. Select candidates to schedule interviews, set
            onboarding, or mark failed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {pipelineLoadState === "error" ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void refetchPipeline()}
            >
              Retry load
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            className="gap-2 bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
            onPress={() => setAddCandidatesOpen(true)}
          >
            <UserPlusIcon className="size-4" />
            Add candidates
          </Button>
          <Button variant="secondary" size="sm" className="gap-2">
            <DownloadIcon className="size-4" />
            Export to Excel
          </Button>
        </div>
      </header>

      <Card>
        <Card.Content className="p-4 sm:p-6">
          <JdAppliedCandidatesPipeline
            jobDescriptionId={jobDescriptionId}
            jobId={jobId}
            dbRows={pipelineRows}
            loadState={pipelineLoadState}
            onRefetch={() => void refetchPipeline()}
          />
        </Card.Content>
      </Card>

      <Button
        variant="primary"
        size="lg"
        className="fixed bottom-8 right-8 z-20 size-14 min-w-0 rounded-full p-0 shadow-lg"
        aria-label="Add candidates to this job"
        onPress={() => setAddCandidatesOpen(true)}
      >
        <UserPlusIcon className="size-6" />
      </Button>

      <AddCandidateModal
        open={addCandidatesOpen}
        onOpenChange={setAddCandidatesOpen}
        jdPipelineCampaign={jdPipelineCampaign}
        onCandidatesChanged={() => void refetchPipeline()}
      />

      <p className="text-center text-xs text-muted">
        <Link href="/admin/jd" className="text-accent hover:underline">
          Back to job descriptions
        </Link>
        <span className="mx-2">·</span>
        <span>Job ID: {jobId}</span>
      </p>
    </div>
  );
}
