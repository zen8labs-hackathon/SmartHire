"use client";

import React, { useCallback, useState } from "react";
import { Button, Chip, Disclosure, Spinner } from "@heroui/react";
import { RefreshCw, Sparkles } from "lucide-react";

type Importance = "must_have" | "nice_to_have" | "bonus";

/** `manual` only shows up on rows left over from the old editing flow. */
type Origin = "jd" | "criteria" | "ai_inferred" | "manual";

type JobRequirement = {
  id: string;
  requirement: string;
  importance: Importance;
  origin: Origin;
};

const IMPORTANCE_LABEL: Record<Importance, string> = {
  must_have: "Must have",
  nice_to_have: "Nice to have",
  bonus: "Bonus",
};

const IMPORTANCE_COLOR: Record<Importance, "danger" | "warning" | "default"> = {
  must_have: "danger",
  nice_to_have: "warning",
  bonus: "default",
};

const ORIGIN_LABEL: Record<Origin, string> = {
  jd: "From JD",
  criteria: "From criteria",
  ai_inferred: "AI inferred",
  manual: "Manual",
};

/**
 * Read-only view of the checklist `lib/ai/jd-cv-match.ts` scores every candidate
 * on this job against -- it exists so a recruiter can see *what the AI is
 * actually matching CVs on*, not to hand-edit it.
 *
 * The list is owned by the extractor: it is rebuilt from the JD + evaluation
 * criteria whenever either is saved, and can be rebuilt on demand here. Fixing a
 * wrong line therefore means fixing the JD text it came from, which keeps the
 * checklist and the JD from drifting apart.
 */
export function JdRequirementsSection({
  jobId,
  canManage,
}: {
  jobId: string;
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<JobRequirement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [staleCount, setStaleCount] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/job-descriptions/${jobId}/requirements`,
        { credentials: "include", cache: "no-store" },
      );
      const json = (await res.json()) as {
        requirements?: JobRequirement[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load requirements.");
      setRows(json.requirements ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requirements.");
      setRows([]);
    }
  }, [jobId]);

  /* Fetched on first expand rather than on mount: the panel sits inside the JD
     edit modal, which most saves never open it for. */
  const onExpandedChange = (next: boolean) => {
    setExpanded(next);
    if (next && rows === null) void load();
  };

  /** Runs the LLM extraction in-request, so this can take a few seconds. */
  const reExtract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/job-descriptions/${jobId}/requirements/re-extract`,
        { method: "POST", credentials: "include" },
      );
      const json = (await res.json()) as {
        staleApplications?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not re-extract.");
      if (typeof json.staleApplications === "number") {
        setStaleCount((prev) => prev + json.staleApplications!);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-extract.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Disclosure
      isExpanded={expanded}
      onExpandedChange={onExpandedChange}
      className="rounded-md border border-default-200"
    >
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left outline-none pressed:bg-muted/50">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Match requirements
              {rows !== null && (
                <span className="ml-2 font-normal text-muted">
                  ({rows.length})
                </span>
              )}
            </p>
            <p className="text-xs font-normal text-muted">
              The checklist every CV on this job is scored against.
            </p>
          </div>
          <Disclosure.Indicator className="size-4 shrink-0 text-muted" />
        </Disclosure.Trigger>
      </Disclosure.Heading>

      <Disclosure.Content>
        <Disclosure.Body className="space-y-3 border-t border-divider px-3 py-3">
          {rows === null ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size="sm" />
              Loading…
            </div>
          ) : (
            <RequirementsBody
              rows={rows}
              canManage={canManage}
              error={error}
              extracting={extracting}
              staleCount={staleCount}
              reExtract={reExtract}
            />
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

function RequirementsBody({
  rows,
  canManage,
  error,
  extracting,
  staleCount,
  reExtract,
}: {
  rows: JobRequirement[];
  canManage: boolean;
  error: string | null;
  extracting: boolean;
  staleCount: number;
  reExtract: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted">
          Extracted by AI from the requirement fields above and the evaluation
          criteria, and refreshed whenever the job description is saved. To
          change what candidates are scored on, edit that text — this list is not
          edited directly.
        </p>
        {canManage && (
          <Button
            size="sm"
            variant="ghost"
            onPress={reExtract}
            isDisabled={extracting}
          >
            {extracting ? (
              <Spinner size="sm" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {extracting ? "Extracting…" : "Re-extract"}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {staleCount > 0 && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-700">
          The checklist changed — {staleCount} scored{" "}
          {staleCount === 1 ? "application needs" : "applications need"} a
          re-run to reflect it.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No requirements extracted yet. Candidates are scored against a
          checklist the model derives per CV until this list is filled in.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-md border border-default-200 px-3 py-2"
            >
              <p className="text-sm leading-relaxed text-foreground">
                {row.requirement}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip
                  size="sm"
                  variant="soft"
                  color={IMPORTANCE_COLOR[row.importance]}
                >
                  {IMPORTANCE_LABEL[row.importance]}
                </Chip>
                <Chip size="sm" variant="soft">
                  {row.origin === "ai_inferred" && (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {ORIGIN_LABEL[row.origin]}
                </Chip>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
