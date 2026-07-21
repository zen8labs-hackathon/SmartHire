"use client";

import {
  Button,
  Card,
  Chip,
  cn,
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
import type { CandidateCvHistoryRow } from "@/lib/candidates/cv-history-types";
import type { CvManagementVersionListItem } from "@/lib/candidates/cv-management-version-list";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";
import { groupSkillsForDisplay } from "@/lib/candidates/group-skills-for-display";
import type { CandidateRow } from "@/lib/candidates/types";
import { formatDisplayDate } from "@/lib/format-date";
import {
  getStageColorClasses,
  getStageColorStyles,
  getSubStageTextColorClass,
  getSubStageTextColorStyle,
} from "@/lib/candidates/pipeline-status-styles";
import { stageSubStageOptionKey } from "@/lib/pipelines/jd-pipeline-row-helpers";
import type { StageMapping, SubStage } from "@/lib/pipelines/transition-validator";
import type { ResolvedActivePipeline } from "@/components/admin/candidates/use-candidate-pipeline-state";

type OtherApplicationItem = {
  id: string;
  cvDownloadUrl: string;
  jobTitle: string;
  jobDescriptionId: string | null;
  cvUploadedAt: string | null;
  name: string | null;
};

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
          <Card.Title className="text-xl font-bold tracking-tight text-[#0c1e33] dark:text-foreground">
            {model.name}
          </Card.Title>
          <p className="mt-0.5 text-sm font-semibold italic text-accent">
            {model.role}
          </p>
        </div>
        {contactBits.length > 0 ? (
          <p className="shrink-0 text-right text-xs leading-relaxed text-muted sm:max-w-[240px]">
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

function PipelineStageBadge({
  stageMapping,
  subStage,
  orphaned,
}: {
  stageMapping: StageMapping;
  subStage: SubStage;
  orphaned: boolean;
}) {
  const stageColor = stageMapping.pipeline_stages?.color ?? null;
  const surfaceClass = getStageColorClasses(stageColor, "badge");
  const surfaceStyle = getStageColorStyles(stageColor, "badge");
  const detailClass = getSubStageTextColorClass(
    subStage.code,
    subStage.is_passed,
    subStage.is_default,
    stageColor,
  );
  const detailStyle = getSubStageTextColorStyle(
    subStage.code,
    subStage.is_passed,
    subStage.is_default,
    stageColor,
  );
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 font-medium",
        surfaceClass,
      )}
      style={surfaceStyle}
    >
      <span className="text-sm text-foreground">
        {stageMapping.pipeline_stages?.label ?? stageMapping.pipeline_stages?.code}
      </span>
      <span className="text-sm text-muted">·</span>
      <span className={cn("text-sm", detailClass)} style={detailStyle}>
        {subStage.label}
      </span>
      {orphaned ? (
        <span
          className="text-sm leading-none"
          title="Previous pipeline stage was removed — this status may be inaccurate"
        >
          ⚠
        </span>
      ) : null}
    </span>
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
  /** The application's current (stage, sub-stage), resolved against its job's pipeline config; `null` while that config is still loading. */
  resolvedStage: ResolvedActivePipeline | null;
  /** Valid next (stage, sub-stage) targets from the current position. Empty while `resolvedStage` is `null`. */
  stageOptions: Array<{ stageMapping: StageMapping; subStage: SubStage }>;
  stageUpdateBusy: boolean;
  stageUpdateError: string | null;
  dbLoadState: "loading" | "error" | "ok";
  onStageChange: (target: { toStageMappingId: string; toSubStateId: string }) => void;
  canEditProfile?: boolean;
  onProfileSaved?: (candidate: CandidateDbRow) => void;
  onAfterCvDetailMutation?: () => void | Promise<void>;
};

export function CvVersionComparisonDrawer({
  isOpen,
  onOpenChange,
  tableRow,
  dbRow,
  resolvedStage,
  stageOptions,
  stageUpdateBusy,
  stageUpdateError,
  dbLoadState,
  onStageChange,
  canEditProfile = true,
  onProfileSaved = () => {},
}: CvVersionComparisonDrawerProps) {
  const router = useRouter();
  const [otherApplications, setOtherApplications] = useState<
    OtherApplicationItem[]
  >([]);
  const [otherAppsLoading, setOtherAppsLoading] = useState(false);
  const [otherAppsError, setOtherAppsError] = useState<string | null>(null);

  const [otherAppsExpanded, setOtherAppsExpanded] = useState(false);
  const otherAppsLoadedRef = useRef(false);

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
      }
      onOpenChange(open);
    },
    [onOpenChange],
  );

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

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="flex h-dvh max-h-dvh w-full max-w-[min(100vw-0.5rem,960px)] flex-col">
          <Drawer.CloseTrigger />
          <Drawer.Header className="shrink-0 border-b border-divider bg-background px-5 py-3.5 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Drawer.Heading className="text-lg font-bold tracking-tight text-[#0c1e33] dark:text-foreground">
                  {tableRow.name}
                </Drawer.Heading>
                <p className="mt-0.5 text-sm text-muted">{tableRow.role}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {currentJobDescriptionId != null ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onPress={() =>
                      router.push(
                        `/admin/jd/${currentJobDescriptionId}/pipeline/${tableRow.id}/evaluation`,
                      )
                    }
                  >
                    View detail
                  </Button>
                ) : null}
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
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      isDisabled={currentJobDescriptionId == null}
                      onPress={() => {
                        if (currentJobDescriptionId != null) {
                          router.push(
                            `/admin/jd/${currentJobDescriptionId}/pipeline/${tableRow.id}/evaluation`,
                          );
                        }
                      }}
                    >
                      View detail
                    </Button>
                  </div>
                </div>
                <CvPreviewCard model={activeCardModel} />
              </div>
            </div>

            <div className="mx-auto w-full max-w-[960px]">
              <Card className="p-4 sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                  Pipeline stage
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {resolvedStage?.stageMapping && resolvedStage.subStage ? (
                    <PipelineStageBadge
                      stageMapping={resolvedStage.stageMapping}
                      subStage={resolvedStage.subStage}
                      orphaned={resolvedStage.orphaned}
                    />
                  ) : (
                    <span className="text-sm text-muted">
                      {dbRow ? "Loading pipeline config…" : "—"}
                    </span>
                  )}
                  {stageOptions.length > 0 ? (
                    <Select
                      aria-label="Move to pipeline stage"
                      isDisabled={stageUpdateBusy}
                      onChange={(key) => {
                        if (typeof key !== "string") return;
                        const [toStageMappingId, toSubStateId] = key.split(":");
                        if (toStageMappingId && toSubStateId) {
                          onStageChange({ toStageMappingId, toSubStateId });
                        }
                      }}
                    >
                      <Select.Trigger className="h-8 min-h-8 min-w-[10rem] justify-start gap-1 px-2.5 text-xs">
                        <span className="text-muted">Move to…</span>
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {stageOptions.map(({ stageMapping, subStage }) => {
                            const key = stageSubStageOptionKey(stageMapping.id, subStage.id);
                            return (
                              <ListBox.Item
                                key={key}
                                id={key}
                                textValue={`${stageMapping.pipeline_stages?.label ?? stageMapping.pipeline_stages?.code} - ${subStage.label}`}
                              >
                                {stageMapping.pipeline_stages?.label ?? stageMapping.pipeline_stages?.code}
                                {" · "}
                                {subStage.label}
                              </ListBox.Item>
                            );
                          })}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  ) : null}
                </div>
                {stageUpdateError ? (
                  <p className="mt-2 text-xs font-semibold text-rose-500" role="alert">
                    {stageUpdateError}
                  </p>
                ) : null}
              </Card>
            </div>

            <div className="mx-auto w-full max-w-[960px]">
              <Card className="overflow-hidden p-0">
                <Disclosure
                  isExpanded={otherAppsExpanded}
                  onExpandedChange={(expanded) => {
                    setOtherAppsExpanded(expanded);
                    if (expanded) fetchOtherApps();
                  }}
                >
                  <Disclosure.Heading className="px-4 pb-4 m:px-6 sm:pt-4">
                    <Disclosure.Trigger className="flex w-full max-w-full items-center justify-between gap-3 rounded-md py-1 text-left outline-none hover:bg-muted/50 pressed:bg-muted/50">
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
                          {otherApplications.map((app) => (
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
                />
              </div>
            ) : null}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
