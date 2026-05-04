"use client";

import type { Key } from "@heroui/react";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Disclosure,
  Drawer,
  Label,
  ListBox,
  Select,
  Separator,
  Spinner,
} from "@heroui/react";
import { useCallback, useMemo, useState } from "react";

import {
  candidateDisplayInitials,
  candidateStatusChipColor,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import type { CandidateCvHistoryRow } from "@/lib/candidates/cv-history-types";
import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";
import type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";

function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDayMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function parseTs(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function earliestCvMs(
  dbRow: CandidateDbRow | null,
  history: CandidateCvHistoryRow[],
): number | null {
  const cands: number[] = [];
  for (const t of [
    parseTs(dbRow?.created_at),
    parseTs(dbRow?.cv_uploaded_at ?? undefined),
  ]) {
    if (t != null) cands.push(t);
  }
  for (const h of history) {
    const u = parseTs(
      h.previousCvUploadedAt ?? h.previousSnapshot?.cvUploadedAt ?? undefined,
    );
    if (u != null) cands.push(u);
  }
  if (cands.length === 0) return null;
  return Math.min(...cands);
}

function buildEditorInsight(
  history: CandidateCvHistoryRow[],
  currentRoleLine: string,
): string {
  const n = history.length;
  if (n === 0) {
    return "No earlier CV versions are on file. When this candidate uploads a replacement CV, timeline notes will appear here.";
  }
  const asc = [...history].sort((a, b) => {
    const ta = parseTs(a.replacedAt) ?? 0;
    const tb = parseTs(b.replacedAt) ?? 0;
    return ta - tb;
  });
  const roleLabels = asc.map((h) => h.previousSnapshot?.role?.trim() || "—");
  roleLabels.push(currentRoleLine.trim() || "—");
  const changes: string[] = [];
  for (let i = 1; i < roleLabels.length; i++) {
    if (roleLabels[i] !== roleLabels[i - 1]) {
      changes.push(`“${roleLabels[i - 1]}” → “${roleLabels[i]}”`);
    }
  }
  const head =
    n === 1
      ? "This candidate has one earlier CV version on file."
      : `This candidate has ${n} earlier CV versions on file.`;
  if (changes.length === 0) {
    return `${head} Parsed job titles stayed consistent across uploads.`;
  }
  return `${head} Notable title changes: ${changes.join("; ")}.`;
}

function ClockIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

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
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
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
            {model.skills.length > 0 ? (
              <div>
                <p className={sectionLabel}>Core stack</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {model.skills.map((s) => (
                    <Chip
                      key={s}
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
  cvHistoryRows: CandidateCvHistoryRow[];
  cvHistoryLoading: boolean;
  cvHistoryError: string | null;
  drawerStatusOptions: CandidateStatus[];
  statusUpdateBusy: boolean;
  statusUpdateError: string | null;
  dbLoadState: "loading" | "error" | "ok";
  onStatusChange: (next: CandidateStatus) => void;
};

export function CvVersionComparisonDrawer({
  isOpen,
  onOpenChange,
  tableRow,
  dbRow,
  cvHistoryRows,
  cvHistoryLoading,
  cvHistoryError,
  drawerStatusOptions,
  statusUpdateBusy,
  statusUpdateError,
  dbLoadState,
  onStatusChange,
}: CvVersionComparisonDrawerProps) {
  const [previewPreviousId, setPreviewPreviousId] = useState<string | null>(
    null,
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) setPreviewPreviousId(null);
      onOpenChange(open);
    },
    [onOpenChange],
  );

  const activeParsed = useMemo(
    () => normalizeParsedResume(dbRow?.parsed_payload),
    [dbRow?.parsed_payload],
  );

  const previewHistoryRow = useMemo(() => {
    if (!previewPreviousId) return null;
    return (
      cvHistoryRows.find((h) => h.previousCandidateId === previewPreviousId) ??
      null
    );
  }, [cvHistoryRows, previewPreviousId]);

  const previewParsed = useMemo(() => {
    if (!previewHistoryRow?.previousSnapshot) return null;
    return normalizeParsedResume(
      previewHistoryRow.previousSnapshot.parsedPayload,
    );
  }, [previewHistoryRow]);

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

  const previewCardModel = useMemo((): CvCardModel | null => {
    if (!previewHistoryRow?.previousSnapshot || !previewParsed) return null;
    const snap = previewHistoryRow.previousSnapshot;
    const parsed = previewParsed;
    const skills =
      parsed.skills.length > 0
        ? parsed.skills
        : dbRow?.skills && dbRow.skills.length > 0
          ? [...dbRow.skills]
          : [];
    const name = parsed.name?.trim() || snap.name?.trim() || "—";
    const role = parsed.role?.trim() || snap.role?.trim() || "—";
    const uploaded = snap.cvUploadedAt;
    return {
      name,
      role,
      skills,
      parsed,
      cvUploadedAtLabel: formatDayMonthYear(uploaded),
    };
  }, [previewHistoryRow, previewParsed, dbRow]);

  const displayCard = previewCardModel ?? activeCardModel;
  const isPreview = Boolean(previewCardModel && previewPreviousId);

  const totalVersions = 1 + cvHistoryRows.length;
  const totalVersionsLabel = String(totalVersions).padStart(2, "0");

  const firstSeenMs = earliestCvMs(dbRow, cvHistoryRows);
  const firstSeenLabel =
    firstSeenMs != null
      ? new Date(firstSeenMs).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : "—";

  const latestUpdateIso =
    dbRow?.cv_uploaded_at?.trim() || dbRow?.updated_at || null;
  const latestUpdateLabel = formatMonthYear(latestUpdateIso);

  const currentRoleForInsight =
    activeParsed.role?.trim() || dbRow?.role?.trim() || tableRow.role || "—";

  const insightText = useMemo(
    () => buildEditorInsight(cvHistoryRows, currentRoleForInsight),
    [cvHistoryRows, currentRoleForInsight],
  );

  const onStatusChangeCb = useCallback(
    (key: Key | null) => {
      if (key == null || typeof key !== "string") return;
      onStatusChange(key as CandidateStatus);
    },
    [onStatusChange],
  );

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="flex h-dvh max-h-dvh w-full max-w-[min(100vw-0.5rem,960px)] flex-col">
          <Drawer.CloseTrigger />
          <Drawer.Header className="shrink-0 border-b border-divider bg-background px-5 py-3.5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <Drawer.Heading className="text-lg font-bold tracking-tight text-[#0c1e33] dark:text-foreground">
                  CV Version Comparison
                </Drawer.Heading>
                <p className="mt-1.5 text-sm text-muted">
                  Candidate:{" "}
                  <span className="font-semibold text-foreground">
                    {tableRow.name}
                  </span>{" "}
                  — {tableRow.role}
                </p>
              </div>
              <section className="w-full shrink-0 lg:max-w-md">
                <dl className="grid grid-cols-3 gap-3 sm:gap-6 lg:gap-8">
                  <div className="text-center lg:text-right">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                      Total versions
                    </dt>
                    <dd className="mt-1.5 text-base font-bold tabular-nums text-[#0c1e33] dark:text-foreground">
                      {totalVersionsLabel}
                    </dd>
                  </div>
                  <div className="text-center lg:text-right">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                      First seen
                    </dt>
                    <dd className="mt-1.5 text-base font-bold text-[#0c1e33] dark:text-foreground">
                      {firstSeenLabel}
                    </dd>
                  </div>
                  <div className="text-center lg:text-right">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                      Latest update
                    </dt>
                    <dd className="mt-1.5 text-base font-bold text-accent">
                      {latestUpdateLabel}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </Drawer.Header>

          <Drawer.Body className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-slate-50/90 px-5 py-4 sm:px-6 dark:bg-muted/20">
            <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:items-start lg:gap-6">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Chip
                    size="sm"
                    variant="soft"
                    color={isPreview ? "warning" : "default"}
                    className={
                      isPreview
                        ? "h-7 px-2.5 font-bold uppercase tracking-wide"
                        : "h-7 border-0 bg-gradient-to-br from-[#002542] to-[#1b3b5a] px-2.5 font-bold uppercase tracking-wide !text-white shadow-sm dark:from-[#0a2540] dark:to-[#143a5a]"
                    }
                  >
                    {isPreview ? "Preview" : "Active version"}
                  </Chip>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted">
                      Last modified: {displayCard.cvUploadedAtLabel}
                    </span>
                    {isPreview ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => setPreviewPreviousId(null)}
                      >
                        Back to active
                      </Button>
                    ) : null}
                  </div>
                </div>
                <CvPreviewCard model={displayCard} />
              </div>

              <aside className="flex min-w-0 flex-col gap-4">
                <div className="flex items-center gap-2">
                  <ClockIcon className="size-4 shrink-0 text-[#0c1e33] dark:text-muted" />
                  <h3 className="text-sm font-bold tracking-tight text-[#0c1e33] dark:text-foreground">
                    Version history
                  </h3>
                </div>

                {cvHistoryLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Spinner size="sm" />
                    Loading history…
                  </div>
                ) : cvHistoryError ? (
                  <p className="text-sm text-danger" role="alert">
                    {cvHistoryError}
                  </p>
                ) : cvHistoryRows.length === 0 ? (
                  <p className="text-sm text-muted">
                    No earlier CV versions. This upload is the only version on
                    file.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {cvHistoryRows.map((item, i) => {
                      const versionNum = totalVersions - 1 - i;
                      const roleAt = item.previousSnapshot?.role?.trim() || "—";
                      const when = formatMonthYear(
                        item.previousCvUploadedAt ??
                          item.previousSnapshot?.cvUploadedAt ??
                          item.replacedAt,
                      );
                      const isCardPreview =
                        previewPreviousId === item.previousCandidateId;
                      return (
                        <Card
                          key={item.id}
                          className={`overflow-hidden rounded-xl border border-divider bg-background shadow-sm ${
                            isCardPreview
                              ? "ring-2 ring-accent ring-offset-2"
                              : ""
                          }`}
                        >
                          <Card.Content className="gap-0 p-0">
                            <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                                Version {versionNum}
                              </p>
                              <a
                                href={`/api/admin/candidates/${item.previousCandidateId}/cv-download`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted outline-none ring-offset-background transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
                                aria-label="Download this CV file"
                              >
                                <DownloadIcon className="size-4" />
                              </a>
                            </div>
                            <div className="px-3 pb-3">
                              <p className="text-sm font-bold text-[#0c1e33] dark:text-foreground">
                                {when}
                              </p>
                              <p className="mt-0.5 text-xs italic text-accent">
                                {roleAt}
                              </p>
                            </div>
                            <Separator />
                            <div className="p-2.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full font-semibold"
                                onPress={() =>
                                  setPreviewPreviousId(item.previousCandidateId)
                                }
                                isDisabled={isCardPreview}
                              >
                                {isCardPreview ? "Previewing" : "View"}
                              </Button>
                            </div>
                          </Card.Content>
                        </Card>
                      );
                    })}
                  </div>
                )}

                <Card className="overflow-hidden rounded-xl border-0 border-t-4 border-t-emerald-500 bg-emerald-50/95 shadow-sm dark:border-t-emerald-600 dark:bg-emerald-950/40">
                  <Card.Content className="gap-1.5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-200">
                      Editor insight
                    </p>
                    <p className="text-xs leading-relaxed text-emerald-950 dark:text-emerald-50">
                      {insightText}
                    </p>
                  </Card.Content>
                </Card>
              </aside>
            </div>

            <Card className="mx-auto w-full max-w-[960px] overflow-hidden p-0">
              <Disclosure defaultExpanded={false}>
                <Disclosure.Heading className="px-4 pt-4 sm:px-6 sm:pt-5">
                  <Disclosure.Trigger className="flex w-full max-w-full items-start justify-between gap-3 rounded-md py-1 text-left outline-none hover:bg-muted/50 pressed:bg-muted/50">
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-lg font-semibold tracking-tight text-foreground">
                        Pipeline, sourcing &amp; JD match
                      </span>
                      <span className="block text-sm font-normal text-muted">
                        Pipeline status, table snapshot, applied role, source,
                        and AI job-description match for this candidate.
                      </span>
                    </span>
                    <Disclosure.Indicator className="mt-1 size-5 shrink-0 text-muted" />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="flex flex-col gap-6 border-t border-divider px-4 pb-6 pt-4 sm:px-6">
                    <div className="flex flex-col gap-6 lg:flex-row">
                      <div className="flex min-w-0 flex-1 flex-col gap-6">
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">
                            Candidate
                          </h3>
                          <div className="mt-2 flex items-center gap-3">
                            <Avatar className="size-10 shrink-0" size="md">
                              {tableRow.avatarUrl ? (
                                <Avatar.Image alt="" src={tableRow.avatarUrl} />
                              ) : null}
                              <Avatar.Fallback className="text-xs">
                                {candidateDisplayInitials(tableRow.name)}
                              </Avatar.Fallback>
                            </Avatar>
                            <Chip
                              size="sm"
                              variant="soft"
                              color={candidateStatusChipColor(tableRow.status)}
                              className="w-fit uppercase"
                            >
                              {tableRow.status}
                            </Chip>
                          </div>
                        </section>
                        <Separator />
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">
                            Status
                          </h3>
                          <div className="mt-2 max-w-xs">
                            <Select
                              value={tableRow.status}
                              isDisabled={
                                statusUpdateBusy || dbLoadState === "error"
                              }
                              onChange={onStatusChangeCb}
                            >
                              <Label className="sr-only">Pipeline status</Label>
                              <Select.Trigger className="w-full">
                                <Select.Value />
                                <Select.Indicator />
                              </Select.Trigger>
                              <Select.Popover>
                                <ListBox>
                                  {drawerStatusOptions.map((s) => (
                                    <ListBox.Item key={s} id={s} textValue={s}>
                                      {s}
                                      <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                  ))}
                                </ListBox>
                              </Select.Popover>
                            </Select>
                            {statusUpdateBusy ? (
                              <p className="mt-1.5 text-xs text-muted">
                                Updating…
                              </p>
                            ) : null}
                            {statusUpdateError ? (
                              <p
                                className="mt-1.5 text-xs text-danger"
                                role="alert"
                              >
                                {statusUpdateError}
                              </p>
                            ) : null}
                          </div>
                        </section>
                        <Separator />
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">
                            Experience
                          </h3>
                          <p className="mt-1 text-sm text-muted">
                            {tableRow.experienceYears} years
                          </p>
                        </section>
                        <Separator />
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">
                            Key skills
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {tableRow.skills.map((s) => (
                              <Chip
                                key={s}
                                size="sm"
                                variant="soft"
                                color="accent"
                              >
                                {s}
                              </Chip>
                            ))}
                            {tableRow.moreSkills ? (
                              <Chip size="sm" variant="soft" color="accent">
                                +{tableRow.moreSkills} more
                              </Chip>
                            ) : null}
                          </div>
                        </section>
                        <Separator />
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">
                            Education
                          </h3>
                          <p className="mt-1 text-sm text-foreground">
                            {tableRow.degree}
                          </p>
                          <p className="text-xs font-bold uppercase text-muted">
                            {tableRow.school}
                          </p>
                        </section>
                        <Separator />
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">
                            Applied JD
                          </h3>
                          <p className="mt-1 text-sm text-muted">
                            {tableRow.jdCampaignLabel}
                          </p>
                        </section>
                        <Separator />
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">
                            Sourced from
                          </h3>
                          <p className="mt-1 text-sm text-muted">
                            {tableRow.sourceLabel}
                          </p>
                        </section>
                      </div>
                      <div className="min-w-0 flex-1">
                        <section>
                          <h3 className="text-sm font-semibold text-foreground">
                            JD match (AI)
                          </h3>
                          <div className="mt-2 flex items-center gap-2">
                            <Chip
                              size="sm"
                              variant="soft"
                              color={jdMatchChipColor(tableRow)}
                              className="text-sm font-bold tabular-nums"
                            >
                              {tableRow.jdMatchLabel}
                            </Chip>
                            {tableRow.jdMatchScore != null ? (
                              <span className="text-xs text-muted">/ 100</span>
                            ) : null}
                          </div>
                          {tableRow.jdMatchError ? (
                            <p
                              className="mt-2 text-sm text-danger"
                              role="alert"
                            >
                              {tableRow.jdMatchError}
                            </p>
                          ) : tableRow.jdMatchRationale ? (
                            <p className="mt-2 text-sm leading-relaxed text-muted">
                              {tableRow.jdMatchRationale}
                            </p>
                          ) : (
                            <p className="mt-2 text-sm text-muted">
                              No rationale yet. Match runs after the CV is
                              parsed and a job description is available for the
                              campaign.
                            </p>
                          )}
                        </section>
                      </div>
                    </div>
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            </Card>
          </Drawer.Body>

          <Drawer.Footer className="shrink-0 border-t border-divider bg-background px-4 py-3 sm:px-6">
            <div className="flex flex-wrap justify-end gap-2">
              <Button slot="close" variant="secondary">
                Close
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
