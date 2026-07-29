"use client";

import {
  Button,
  Card,
  Chip,
  Disclosure,
  Drawer,
  ListBox,
  Select,
  Separator,
  Spinner,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CandidateProfileEditSection } from "@/components/admin/candidates/candidate-profile-edit-section";
import { PipelineStatusBadge } from "@/components/admin/candidates/pipeline-status-badge";
import { useToast } from "@/components/admin/toast-provider";
import type { CandidateCvHistoryRow } from "@/lib/candidates/cv-history-types";
import type { CvManagementVersionListItem } from "@/lib/candidates/cv-management-version-list";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";
import { groupSkillsForDisplay } from "@/lib/candidates/group-skills-for-display";
import type { CandidateRow } from "@/lib/candidates/types";
import { formatDisplayDate } from "@/lib/format-date";

type OtherApplicationItem = {
  id: string;
  cvDownloadUrl: string;
  jobTitle: string;
  jobDescriptionId: string | null;
  cvUploadedAt: string | null;
  name: string | null;
  stageLabel: string | null;
  stageColor: string | null;
  subStageCode: string | null;
  subStageLabel: string | null;
  subStageIsPassed: boolean | null;
};

type JobOpening = {
  id: string;
  title: string;
  displayTitle: string;
  createdAt: string | null;
};

/** "Other applications" renders this many entries up front; "View more" reveals the rest. */
const OTHER_APPS_PAGE_SIZE = 5;

function formatDayMonthYear(iso: string | null | undefined): string {
  return formatDisplayDate(iso);
}

type CvCardModel = {
  name: string;
  role: string;
  skills: string[];
  parsed: ReturnType<typeof normalizeParsedResume>;
  cvUploadedAtLabel: string;
};

function CvPreviewCard({ model }: { model: CvCardModel }) {
  const { parsed } = model;
  const skillSections = useMemo(
    () => groupSkillsForDisplay(model.skills),
    [model.skills],
  );
  const credParts: string[] = [];
  if (parsed.degree?.trim()) credParts.push(parsed.degree.trim());
  if (parsed.school?.trim()) credParts.push(parsed.school.trim());
  if (parsed.englishLevel?.trim()) credParts.push(parsed.englishLevel.trim());
  if (parsed.gpa?.trim()) credParts.push(`GPA: ${parsed.gpa.trim()}`);
  const hasCredentials = credParts.length > 0;
  const contactBits: string[] = [];
  if (parsed.email?.trim()) contactBits.push(parsed.email.trim());
  if (parsed.phone?.trim()) contactBits.push(parsed.phone.trim());

  const sectionLabel =
    "text-[10px] font-bold uppercase tracking-[0.2em] text-muted";

  return (
    <Card className="overflow-hidden rounded-2xl border border-divider bg-background shadow-md">
      <Card.Header className="flex flex-col gap-1 border-0 px-5 pb-3 pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:pb-3 sm:pt-5">
        <div className="min-w-0">
          <Card.Title className="truncate text-xl font-bold tracking-tight text-[#0c1e33] dark:text-foreground">
            {model.name}
          </Card.Title>
          <p className="mt-0.5 truncate text-sm font-semibold italic text-accent">
            {model.role}
          </p>
        </div>
        {contactBits.length > 0 ? (
          <p className="min-w-0 shrink-0 break-words text-right text-xs leading-relaxed text-muted sm:max-w-[240px]">
            {contactBits.join(" · ")}
          </p>
        ) : null}
      </Card.Header>
      <Separator className="mx-5 sm:mx-6" />
      <Card.Content className="gap-0 px-5 pb-6 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-6">
            {skillSections.length > 0 ? (
              <div className="space-y-3">
                <p className={sectionLabel}>Core stack</p>
                {skillSections.map((sec) => (
                  <div key={sec.id}>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {sec.label}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {sec.skills.map((s, idx) => (
                        <Chip
                          key={`${sec.id}-${s}-${idx}`}
                          size="sm"
                          variant="soft"
                          color="default"
                          className="border border-slate-200/90 bg-slate-100/95 text-xs font-semibold text-slate-900 shadow-none dark:border-border dark:bg-muted/55 dark:text-foreground"
                        >
                          {s}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {hasCredentials ? (
              <div>
                <p className={sectionLabel}>Certifications</p>
                <ul className="mt-2 max-w-none list-none space-y-1.5 text-sm leading-relaxed text-foreground">
                  {credParts.map((line, idx) => (
                    <li key={`${idx}-${line}`} className="break-words">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-5 lg:col-span-6">
            <div>
              <p className={sectionLabel}>Professional summary</p>
              {parsed.experienceSummary?.trim() ? (
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {parsed.experienceSummary.trim()}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  No structured work history extracted for this upload.
                </p>
              )}
            </div>

            <Separator />

            <div>
              <p className={sectionLabel}>Experience</p>
              <div className="mt-2 space-y-2 text-sm">
                <p className="font-semibold text-foreground">
                  Recent focus —{" "}
                  <span className="font-semibold italic text-accent">
                    {model.role}
                  </span>
                </p>
                {parsed.experienceYears != null &&
                Number.isFinite(parsed.experienceYears) ? (
                  <p className="text-muted">
                    Total experience (parsed):{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {parsed.experienceYears} years
                    </span>
                  </p>
                ) : (
                  <p className="text-muted">
                    Years of experience were not parsed for this file.
                  </p>
                )}
                <p className="text-xs leading-relaxed text-muted">
                  Structured employers and bullet achievements appear here when
                  the CV parser provides them; until then, use the professional
                  summary.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}

export type CvVersionComparisonDrawerProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tableRow: CandidateRow;
  dbRow: CandidateDbRow | null;
  /** Kept for API compatibility; no longer rendered. */
  cvHistoryRows?: CandidateCvHistoryRow[];
  /** Kept for API compatibility; no longer rendered. */
  cvVersions?: CvManagementVersionListItem[];
  /** Kept for API compatibility; no longer rendered. */
  cvHistoryLoading?: boolean;
  /** Kept for API compatibility; no longer rendered. */
  cvHistoryError?: string | null;
  dbLoadState: "loading" | "error" | "ok";
  canEditProfile?: boolean;
  onProfileSaved?: (candidate: CandidateDbRow) => void;
  /** Not currently called by this component -- see the "assign to another
   * job" handler's comment for why a full list refetch while this drawer
   * is open is unsafe under the deduped candidates list. Kept for API
   * compatibility with callers that still pass it. */
  onAfterCvDetailMutation?: () => void | Promise<void>;
};

export function CvVersionComparisonDrawer({
  isOpen,
  onOpenChange,
  tableRow,
  dbRow,
  dbLoadState,
  canEditProfile = true,
  onProfileSaved = () => {},
  onAfterCvDetailMutation = () => {},
}: CvVersionComparisonDrawerProps) {
  const router = useRouter();
  const toast = useToast();
  const [otherApplications, setOtherApplications] = useState<
    OtherApplicationItem[]
  >([]);
  const [otherAppsLoading, setOtherAppsLoading] = useState(false);
  const [otherAppsError, setOtherAppsError] = useState<string | null>(null);

  const [otherAppsExpanded, setOtherAppsExpanded] = useState(false);
  const otherAppsLoadedRef = useRef(false);
  const [otherAppsShowAll, setOtherAppsShowAll] = useState(false);
  /** Scrolled into view once, right after "Add application" creates a new
   * one, so the auto-expanded panel is never left off-screen unnoticed. */
  const otherAppsSectionRef = useRef<HTMLDivElement>(null);

  // CJ4X9M: "Assign to job" -- for an unassigned/pool application, attaches
  // a job in place; for one that already has a job, adds a second, separate
  // application for the newly chosen job instead (see assign-job/route.ts).
  const [assignableJobs, setAssignableJobs] = useState<JobOpening[]>([]);
  const [assignableJobsLoaded, setAssignableJobsLoaded] = useState(false);
  const [assignJobKey, setAssignJobKey] = useState<string | null>(null);
  const [assigningJob, setAssigningJob] = useState(false);
  const [assignJobError, setAssignJobError] = useState<string | null>(null);

  const fetchOtherApps = useCallback(() => {
    if (otherAppsLoadedRef.current) return;
    otherAppsLoadedRef.current = true;
    setOtherAppsLoading(true);
    setOtherAppsError(null);
    fetch(`/api/admin/candidates/${tableRow.id}/other-applications`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then(
        (json: { applications?: OtherApplicationItem[]; error?: string }) => {
          if (json.error) {
            setOtherAppsError(json.error);
          } else {
            setOtherApplications(json.applications ?? []);
          }
        },
      )
      .catch(() => setOtherAppsError("Could not load other applications."))
      .finally(() => setOtherAppsLoading(false));
  }, [tableRow.id]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setOtherApplications([]);
        setOtherAppsError(null);
        otherAppsLoadedRef.current = false;
        setOtherAppsExpanded(false);
        setOtherAppsShowAll(false);
        setAssignableJobs([]);
        setAssignableJobsLoaded(false);
        setAssignJobKey(null);
        setAssignJobError(null);
      }
      onOpenChange(open);
    },
    [onOpenChange],
  );

  const loadAssignableJobs = useCallback(() => {
    if (assignableJobsLoaded) return;
    setAssignableJobsLoaded(true);
    fetch("/api/admin/job-openings?status=Hiring", {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { jobOpenings?: JobOpening[] }) => {
        const list = json.jobOpenings ?? [];
        setAssignableJobs(
          list.map((j) => ({ ...j, displayTitle: j.displayTitle ?? j.title })),
        );
      })
      .catch(() => {
        // best-effort; the picker just stays empty and the user can retry
      });
  }, [assignableJobsLoaded]);

  const handleAssignJob = useCallback(async () => {
    if (!assignJobKey) return;
    const targetJob = assignableJobs.find((j) => j.id === assignJobKey);
    setAssigningJob(true);
    setAssignJobError(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${tableRow.id}/assign-job`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: assignJobKey }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        candidate?: unknown;
        created?: boolean;
      };
      if (!res.ok) {
        throw new Error(
          json.error ?? "Could not assign this candidate to a job.",
        );
      }
      if (json.created) {
        // A brand-new application was created for the additional job (this
        // candidate already had one) -- it has its own id, so there's no
        // "current row" in this drawer to patch in place. Refresh this
        // drawer's own "Other applications" panel only, so the new
        // application shows up there.
        //
        // Deliberately NOT calling onAfterCvDetailMutation() here: the
        // /candidates page list is fetched in "deduped" mode (one row per
        // candidate, picked via `DISTINCT ON (candidate_id) ORDER BY
        // candidate_id, id DESC` -- see listDedupedCandidatesForAdmin).
        // Refetching that list right after creating a second application
        // for this same candidate can make the dedup query pick the
        // brand-new application as this candidate's representative row
        // instead of the one open in this drawer (tableRow.id) -- since
        // dbRows gets replaced wholesale, the currently-open row can vanish
        // from it entirely, and every dbRow-derived section here (CV
        // preview details, "Edit candidate") blanks out mid-session even
        // though nothing about this application actually changed. The list
        // will simply pick up the new application on its own next natural
        // refresh (filter/page change, or reopening the page).
        otherAppsLoadedRef.current = false;
        fetchOtherApps();
        setOtherAppsShowAll(false);
        // Scrolled into view explicitly -- the panel can auto-expand off
        // screen (below the CV preview / job-assignment cards), which reads
        // as "nothing happened" even though it did.
        requestAnimationFrame(() => {
          otherAppsSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
        toast.success(
          targetJob
            ? `Added a new application for ${targetJob.displayTitle}.`
            : "Added a new application for the selected job.",
        );
      } else if (json.candidate) {
        // The route responds with a `CampaignAppliedAdminRow`, not a
        // `CandidateDbRow` -- same shape ambiguity the dashboard's own
        // `onProfileSaved` already normalizes (see its `"candidate_id" in
        // rawC` branch), so this cast mirrors that existing contract.
        onProfileSaved(json.candidate as CandidateDbRow);
        toast.success(
          targetJob ? `Assigned to ${targetJob.displayTitle}.` : "Job assigned.",
        );
      }
      setAssignJobKey(null);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not assign this candidate to a job.";
      setAssignJobError(msg);
      toast.error(msg);
    } finally {
      setAssigningJob(false);
    }
  }, [assignJobKey, assignableJobs, tableRow.id, onProfileSaved, fetchOtherApps, toast]);

  const activeParsed = useMemo(
    () => normalizeParsedResume(dbRow?.parsed_payload),
    [dbRow?.parsed_payload],
  );

  const activeCardModel = useMemo((): CvCardModel => {
    const skills =
      dbRow?.skills && dbRow.skills.length > 0
        ? [...dbRow.skills]
        : activeParsed.skills;
    const name =
      activeParsed.name?.trim() || dbRow?.name?.trim() || tableRow.name || "—";
    const role =
      activeParsed.role?.trim() || dbRow?.role?.trim() || tableRow.role || "—";
    const uploaded = dbRow?.cv_uploaded_at?.trim() || dbRow?.created_at || null;
    return {
      name,
      role,
      skills,
      parsed: activeParsed,
      cvUploadedAtLabel: formatDayMonthYear(uploaded),
    };
  }, [activeParsed, dbRow, tableRow.name, tableRow.role]);

  const currentJobDescriptionId = tableRow.jobDescriptionId;
  const isUnassigned = currentJobDescriptionId == null;
  // Excludes every job this candidate already has a live application for --
  // the current one plus every "Other applications" entry -- so the picker
  // never offers a job that would just bounce off the backend's duplicate-
  // application guard. Requires `otherApplications` to be loaded eagerly
  // (below) rather than only once that panel is expanded.
  const appliedJobIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentJobDescriptionId) ids.add(currentJobDescriptionId);
    for (const app of otherApplications) {
      if (app.jobDescriptionId) ids.add(app.jobDescriptionId);
    }
    return ids;
  }, [currentJobDescriptionId, otherApplications]);
  const jobPickerOptions = assignableJobs.filter(
    (j) => !appliedJobIds.has(j.id),
  );
  const visibleOtherApplications = otherAppsShowAll
    ? otherApplications
    : otherApplications.slice(0, OTHER_APPS_PAGE_SIZE);
  const hiddenOtherApplicationsCount =
    otherApplications.length - visibleOtherApplications.length;

  useEffect(() => {
    if (isOpen) {
      loadAssignableJobs();
      fetchOtherApps();
    }
  }, [isOpen, loadAssignableJobs, fetchOtherApps]);

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="flex h-dvh max-h-dvh w-full max-w-[min(100vw-0.5rem,960px)] flex-col">
          <Drawer.CloseTrigger />
          <Drawer.Header className="shrink-0 border-b border-divider bg-background px-5 py-3.5 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Drawer.Heading className="truncate text-lg font-bold tracking-tight text-[#0c1e33] dark:text-foreground">
                  {tableRow.name}
                </Drawer.Heading>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {tableRow.role}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onPress={() =>
                    router.push(`/admin/candidate-detail/${tableRow.id}`)
                  }
                >
                  View detail
                </Button>
              </div>
            </div>
          </Drawer.Header>

          <Drawer.Body className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-slate-50/90 px-5 py-4 sm:px-6 dark:bg-muted/20">
            <div className="mx-auto w-full max-w-[960px]">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Chip
                      size="sm"
                      variant="soft"
                      color="success"
                      className="h-7 w-fit border border-emerald-300/90 px-2.5 font-bold uppercase tracking-wide shadow-sm dark:border-emerald-700/50"
                    >
                      Active version
                    </Chip>
                    <p className="text-xs text-muted">
                      Last modified: {activeCardModel.cvUploadedAtLabel}
                    </p>
                  </div>
                </div>
                <CvPreviewCard model={activeCardModel} />
              </div>
            </div>

            <div className="mx-auto w-full max-w-[960px]">
              <Card className="p-4 sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Job assignment
                </p>
                <p className="mt-1 text-sm text-muted">
                  {isUnassigned
                    ? "No job assigned yet — this CV is sitting in the candidate pool. Assign a job to move it into that job's pipeline."
                    : "Already applying to a job. Assigning another one adds a separate application for it, copying over the current CV as its starting version."}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Assign to job"
                    placeholder="Select a job…"
                    isDisabled={assigningJob}
                    value={assignJobKey}
                    onChange={(key) => {
                      if (typeof key === "string") setAssignJobKey(key);
                    }}
                    className="w-96"
                  >
                    <Select.Trigger className="h-8 min-h-8 w-full min-w-0 justify-start gap-1 overflow-hidden px-2.5 text-xs">
                      <Select.Value className="min-w-0 truncate pr-2">
                        {({ selectedText }) => selectedText}
                      </Select.Value>
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {jobPickerOptions.map((j) => {
                          const createdLabel = formatDayMonthYear(j.createdAt);
                          const textValue =
                            createdLabel === "—"
                              ? j.displayTitle
                              : `${j.displayTitle} (${createdLabel})`;
                          return (
                            <ListBox.Item
                              key={j.id}
                              id={j.id}
                              textValue={textValue}
                            >
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate pr-2">
                                  {j.displayTitle}
                                </span>
                                <span className="text-xs text-muted">
                                  Created at {createdLabel}
                                </span>
                              </span>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          );
                        })}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <Button
                    size="sm"
                    variant="primary"
                    className="shrink-0"
                    isDisabled={!assignJobKey || assigningJob}
                    onPress={() => void handleAssignJob()}
                  >
                    {assigningJob
                      ? "Assigning…"
                      : isUnassigned
                        ? "Assign"
                        : "Add application"}
                  </Button>
                </div>
                {assignJobError ? (
                  <p
                    className="mt-2 text-xs font-semibold text-rose-500"
                    role="alert"
                  >
                    {assignJobError}
                  </p>
                ) : null}
              </Card>
            </div>

            <div ref={otherAppsSectionRef} className="mx-auto w-full max-w-[960px]">
              <Card className="overflow-hidden p-0">
                <Disclosure
                  isExpanded={otherAppsExpanded}
                  onExpandedChange={(expanded) => {
                    setOtherAppsExpanded(expanded);
                    if (expanded) fetchOtherApps();
                  }}
                >
                  <Disclosure.Heading className="px-4 pb-4 m:px-6 sm:pt-4">
                    <Disclosure.Trigger className="flex w-full max-w-full items-center pl-6 justify-between gap-3 rounded-md py-1 text-left outline-none pressed:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-semibold tracking-tight text-foreground">
                          Other applications
                        </p>
                        <p className="text-sm font-normal text-muted">
                          Other CVs submitted by this candidate to different
                          positions.
                        </p>
                      </div>
                      <Disclosure.Indicator className="size-5 shrink-0 text-muted" />
                    </Disclosure.Trigger>
                  </Disclosure.Heading>
                  <Disclosure.Content>
                    <Disclosure.Body className="border-t border-divider px-4 pb-6 pt-4 sm:px-6">
                      {otherAppsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted">
                          <Spinner size="sm" />
                          Loading…
                        </div>
                      ) : otherAppsError ? (
                        <p className="text-sm text-danger" role="alert">
                          {otherAppsError}
                        </p>
                      ) : otherApplications.length === 0 ? (
                        <p className="text-sm text-muted">
                          No other applications found for this candidate.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {visibleOtherApplications.map((app) => (
                            <div
                              key={app.id}
                              className="flex flex-col gap-1 rounded-xl border border-divider bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {app.jobTitle}
                                </p>
                                {app.cvUploadedAt ? (
                                  <p className="text-xs text-muted">
                                    Uploaded:{" "}
                                    {formatDisplayDate(app.cvUploadedAt)}
                                  </p>
                                ) : null}
                                <div className="mt-1">
                                  <PipelineStatusBadge app={app} />
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <a
                                  href={app.cvDownloadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-8 shrink-0 items-center rounded-xl border border-divider px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-secondary"
                                >
                                  Open CV
                                </a>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  isDisabled={app.jobDescriptionId == null}
                                  onPress={() => {
                                    if (app.jobDescriptionId != null) {
                                      router.push(
                                        `/admin/jd/${app.jobDescriptionId}/pipeline/${app.id}/evaluation`,
                                      );
                                    }
                                  }}
                                >
                                  View detail
                                </Button>
                              </div>
                            </div>
                          ))}
                          {hiddenOtherApplicationsCount > 0 ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="self-start mx-auto"
                              onPress={() => setOtherAppsShowAll(true)}
                            >
                              View more ({hiddenOtherApplicationsCount})
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </Disclosure.Body>
                  </Disclosure.Content>
                </Disclosure>
              </Card>
            </div>

            {canEditProfile ? (
              <div className="mx-auto w-full max-w-[960px]">
                <CandidateProfileEditSection
                  candidateId={tableRow.id}
                  dbRow={dbRow}
                  canEdit={canEditProfile}
                  isPreview={false}
                  dbLoadState={dbLoadState}
                  onSaved={onProfileSaved}
                  hidePipelineAndSource
                />
              </div>
            ) : null}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
