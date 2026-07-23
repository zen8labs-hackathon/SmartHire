"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Breadcrumbs,
  Button,
  Chip,
  cn,
  Disclosure,
  useOverlayState,
} from "@heroui/react";

import { SectionCard } from "@/components/admin/shell/cards";
import { EditCandidateModal } from "@/components/admin/jd/jd-pipeline-modals";
import { PipelineStatusBadge } from "@/components/admin/candidates/pipeline-status-badge";
import type { CandidateDetailRow } from "@/lib/candidates/campaign-applied-to-candidate-detail-row";
import type { CvManagementVersionListItem } from "@/lib/candidates/cv-management-version-list";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/format-date";

type Props = {
  candidate: CandidateDetailRow;
};

type ApplicationListItem = {
  id: string;
  jobTitle: string;
  jobId: string;
  appliedAt: string;
  cvUploadedAt: string;
  stageLabel: string | null;
  stageColor: string | null;
  subStageCode: string | null;
  subStageLabel: string | null;
  subStageIsPassed: boolean | null;
};

type SelectedVersion = {
  applicationId: string;
  /** `null` means "this application's active version". */
  versionId: string | null;
};

type DiffField = { label: string; value: string; wide?: boolean };

const APPLICATIONS_PAGE_SIZE = 5;

function versionEventLabel(item: CvManagementVersionListItem): string {
  if (item.kind === "active") return "Active";
  if (item.eventType === "profile_edit") return "Manual edit";
  if (item.eventType === "full_restore") return "Restored";
  return "Uploaded";
}

function fmtOrDash(v: string | null | undefined): string {
  const t = v?.trim();
  return t ? t : "—";
}

function Field({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
        {label}
      </span>
      <p className="font-semibold text-foreground text-sm">{value}</p>
    </div>
  );
}

export function CandidateDetailClient({ candidate }: Props) {
  const router = useRouter();
  const editProfileModal = useOverlayState();

  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<string | null>(
    null,
  );
  const applicationsFetchedRef = useRef(false);
  const [visibleAppCount, setVisibleAppCount] = useState(
    APPLICATIONS_PAGE_SIZE,
  );

  const [expandedAppIds, setExpandedAppIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [appVersionsById, setAppVersionsById] = useState<
    Record<string, CvManagementVersionListItem[]>
  >({});
  const [appVersionsLoadingById, setAppVersionsLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [appVersionsErrorById, setAppVersionsErrorById] = useState<
    Record<string, string | null>
  >({});
  const fetchedAppVersionIdsRef = useRef<Set<string>>(new Set());

  const [selectedVersion, setSelectedVersion] =
    useState<SelectedVersion | null>(null);

  const loadApplications = useCallback(async () => {
    if (applicationsFetchedRef.current) return;
    applicationsFetchedRef.current = true;
    setApplicationsLoading(true);
    setApplicationsError(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${candidate.id}/applications`,
        { credentials: "include" },
      );
      const json = (await res.json()) as {
        applications?: ApplicationListItem[];
        error?: string;
      };
      if (!res.ok) {
        setApplicationsError(json.error ?? "Could not load applications.");
        return;
      }
      setApplications(json.applications ?? []);
    } catch {
      setApplicationsError("Could not load applications.");
    } finally {
      setApplicationsLoading(false);
    }
  }, [candidate.id]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const loadAppVersions = useCallback(async (appId: string) => {
    if (fetchedAppVersionIdsRef.current.has(appId)) return;
    fetchedAppVersionIdsRef.current.add(appId);
    setAppVersionsLoadingById((m) => ({ ...m, [appId]: true }));
    setAppVersionsErrorById((m) => ({ ...m, [appId]: null }));
    try {
      const res = await fetch(`/api/admin/candidates/${appId}/cv-history`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        versions?: CvManagementVersionListItem[];
        error?: string;
      };
      if (!res.ok) {
        setAppVersionsErrorById((m) => ({
          ...m,
          [appId]: json.error ?? "Could not load CV versions.",
        }));
        return;
      }
      setAppVersionsById((m) => ({ ...m, [appId]: json.versions ?? [] }));
    } catch {
      setAppVersionsErrorById((m) => ({
        ...m,
        [appId]: "Could not load CV versions.",
      }));
    } finally {
      setAppVersionsLoadingById((m) => ({ ...m, [appId]: false }));
    }
  }, []);

  // The CV iframe defaults to showing this page's own application (its
  // active version) before the user picks anything -- load and select that
  // version up front so "Version details" reflects the CV actually on
  // screen from the first render/reload instead of staying empty until the
  // user happens to expand and click it themselves.
  useEffect(() => {
    setExpandedAppIds((prev) =>
      prev.has(candidate.id) ? prev : new Set(prev).add(candidate.id),
    );
    setSelectedVersion((prev) =>
      prev ? prev : { applicationId: candidate.id, versionId: null },
    );
    void loadAppVersions(candidate.id);
  }, [candidate.id, loadAppVersions]);

  const setApplicationExpanded = useCallback(
    (appId: string, expanded: boolean) => {
      setExpandedAppIds((prev) => {
        const next = new Set(prev);
        if (expanded) next.add(appId);
        else next.delete(appId);
        return next;
      });
      if (expanded) void loadAppVersions(appId);
    },
    [loadAppVersions],
  );

  const selectedVersionItem = useMemo(() => {
    if (!selectedVersion) return null;
    const versions = appVersionsById[selectedVersion.applicationId] ?? [];
    if (selectedVersion.versionId == null) {
      return versions.find((v) => v.kind === "active") ?? null;
    }
    return (
      versions.find((v) => v.versionEventId === selectedVersion.versionId) ??
      null
    );
  }, [selectedVersion, appVersionsById]);

  const selectedApp = useMemo(
    () => applications.find((a) => a.id === selectedVersion?.applicationId),
    [applications, selectedVersion],
  );

  const cvUrl = selectedVersion
    ? selectedVersion.versionId
      ? `/api/admin/candidates/${selectedVersion.applicationId}/cv-download?versionId=${encodeURIComponent(selectedVersion.versionId)}`
      : `/api/admin/candidates/${selectedVersion.applicationId}/cv-download`
    : `/api/admin/candidates/${candidate.id}/cv-download`;

  const diffFields = useMemo((): DiffField[] => {
    const snapshot = selectedVersionItem?.snapshot;
    if (!snapshot) return [];
    const parsed = normalizeParsedResume(snapshot.parsed_payload);

    const versionEmail = fmtOrDash(parsed.email);
    const versionPhone = fmtOrDash(parsed.phone);
    const versionDob = formatDisplayDate(snapshot.date_of_birth);
    const versionEnglish = fmtOrDash(snapshot.english_level);
    const versionGpa = fmtOrDash(snapshot.gpa);
    const versionEducation =
      [snapshot.degree, snapshot.school].filter((s) => s?.trim()).join(" · ") ||
      "—";
    const versionSkills =
      snapshot.skills && snapshot.skills.length > 0
        ? snapshot.skills.join(", ")
        : "—";

    const rows: DiffField[] = [];
    if (versionEmail !== candidate.email)
      rows.push({ label: "Email", value: versionEmail });
    if (versionPhone !== candidate.mobile)
      rows.push({ label: "Phone", value: versionPhone });
    if (versionDob !== candidate.dateOfBirth)
      rows.push({ label: "D.O.B.", value: versionDob });
    if (versionEnglish !== candidate.english)
      rows.push({ label: "English", value: versionEnglish });
    if (versionGpa !== candidate.gpa)
      rows.push({ label: "GPA", value: versionGpa });
    if (versionEducation !== candidate.majorSchool)
      rows.push({ label: "Education", value: versionEducation, wide: true });
    if (versionSkills !== candidate.relatedSkills)
      rows.push({ label: "Skills", value: versionSkills, wide: true });
    return rows;
  }, [selectedVersionItem, candidate]);

  // Switching CV versions re-navigates the same iframe. Setting `src` as a
  // normal React prop does a push-style navigation each time, which joins
  // the tab's session history -- the navbar's "Go back" button then steps
  // through past CV versions before ever leaving this page. Driving the
  // navigation imperatively via `location.replace()` instead replaces the
  // iframe's history entry in place, so browsing CV versions here never
  // shows up in the page's own back/forward history. `replace()` is one of
  // the few Location members still callable across origins, so this keeps
  // working once the iframe has followed the storage redirect off-origin.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.location.replace(cvUrl);
        return;
      }
    } catch {
      // Fall through to a plain `src` assignment below.
    }
    iframe.src = cvUrl;
  }, [cvUrl]);

  return (
    <div className="flex flex-col gap-4 font-sans">
      <Breadcrumbs className="text-xs text-muted">
        <Breadcrumbs.Item href="/admin/candidates">Candidates</Breadcrumbs.Item>
        <Breadcrumbs.Item>{candidate.name}</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className="flex gap-6 items-start">
        {/* Left: CV viewer */}
        <div className="w-5/12 shrink-0 sticky top-6">
          <p className="mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
            CV — {candidate.name}
            {selectedVersionItem
              ? ` · ${selectedApp?.jobTitle ?? candidate.jobTitle} · ${versionEventLabel(selectedVersionItem)}`
              : ` · ${candidate.jobTitle}`}
          </p>
          <iframe
            ref={iframeRef}
            title={`CV - ${candidate.name}`}
            className="w-full rounded-xl border border-divider bg-surface-secondary/40 shadow-sm"
            style={{ height: "calc(100vh - 120px)" }}
          />
        </div>

        {/* Right: candidate info */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {candidate.name}
            </h1>
            <p className="mt-1 text-sm text-muted font-medium">
              Applied for {candidate.jobTitle}
            </p>
          </div>

          <SectionCard
            title="Candidate Details"
            description="Personal profile and academic background."
            actions={
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
                onPress={() => editProfileModal.open()}
              >
                Edit profile
              </Button>
            }
          >
            <div className="grid gap-3 text-xs sm:grid-cols-2 pt-2">
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
                  Email
                </span>
                <p className="font-semibold text-foreground text-sm truncate">
                  {candidate.email}
                </p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
                  Phone
                </span>
                <p className="font-semibold text-foreground text-sm">
                  {candidate.mobile}
                </p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
                  D.O.B.
                </span>
                <p className="font-semibold text-foreground text-sm">
                  {candidate.dateOfBirth}
                </p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
                  English
                </span>
                <p className="font-semibold text-foreground text-sm">
                  {candidate.english}
                </p>
              </div>
              <div className="sm:col-span-2 bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
                  Education
                </span>
                <p className="font-semibold text-foreground text-sm">
                  {candidate.studentYears} · {candidate.majorSchool} · GPA{" "}
                  {candidate.gpa}
                </p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
                  Source
                </span>
                <p className="font-semibold text-foreground text-sm">
                  {candidate.sourceLabel}
                </p>
              </div>
              {candidate.expectedSalary ? (
                <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                  <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
                    Expected Salary
                  </span>
                  <p className="font-semibold text-foreground text-sm">
                    {candidate.expectedSalary}
                  </p>
                </div>
              ) : null}
              <div className="sm:col-span-2 bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">
                  Skills
                </span>
                <p className="font-semibold text-foreground text-sm">
                  {candidate.relatedSkills}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={
              <div className="flex items-center gap-2">
                <span>CV Versions</span>
                {applications.length > 0 ? (
                  <span className="text-xs font-normal text-muted tabular-nums">
                    ({applications.length})
                  </span>
                ) : null}
              </div>
            }
            description="Every application this candidate has on file. Open one to load and browse its CV versions."
          >
            <div className="flex flex-col gap-4 pt-2">
              {applicationsError ? (
                <p className="text-xs text-rose-500 font-semibold" role="alert">
                  {applicationsError}
                </p>
              ) : null}

              {applicationsLoading ? (
                <p className="text-xs text-muted py-4 text-center bg-surface-secondary/20 rounded-xl border border-dashed border-divider">
                  Loading applications…
                </p>
              ) : applications.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center bg-surface-secondary/20 rounded-xl border border-dashed border-divider">
                  No applications found.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {applications.slice(0, visibleAppCount).map((app) => {
                    const isExpanded = expandedAppIds.has(app.id);
                    const appVersions = appVersionsById[app.id] ?? [];
                    const appVersionsLoading = appVersionsLoadingById[app.id];
                    const appVersionsError = appVersionsErrorById[app.id];
                    return (
                      <Disclosure
                        key={app.id}
                        isExpanded={isExpanded}
                        onExpandedChange={(expanded) =>
                          setApplicationExpanded(app.id, expanded)
                        }
                        className="rounded-xl border border-divider overflow-hidden"
                      >
                        <Disclosure.Heading className="flex items-stretch">
                          <Disclosure.Trigger className="flex flex-1 min-w-0 items-center justify-between gap-3 pl-3.5 pr-2 py-3 text-left outline-none hover:bg-surface-secondary/40 pressed:bg-surface-secondary/40">
                            <div className="min-w-0">
                              <p className="font-bold text-foreground text-sm truncate">
                                {app.jobTitle}
                              </p>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mt-0.5">
                                Applied {formatDisplayDate(app.appliedAt)}
                              </p>
                              <div className="mt-1">
                                <PipelineStatusBadge app={app} />
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {app.id === candidate.id ? (
                                <Chip
                                  size="sm"
                                  variant="soft"
                                  color="accent"
                                  className="text-[10px] font-bold"
                                >
                                  Current
                                </Chip>
                              ) : null}
                              <Disclosure.Indicator className="size-4 text-muted shrink-0" />
                            </div>
                          </Disclosure.Trigger>
                        </Disclosure.Heading>
                        <Disclosure.Content>
                          <Disclosure.Body className="border-t border-divider px-3.5 py-3 flex flex-col gap-3">
                            <div className="flex items-center justify-center gap-3">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 px-3 rounded-lg border border-divider text-[10px] font-bold shrink-0"
                                onPress={() =>
                                  router.push(
                                    `/admin/jd/${app.jobId}/pipeline/${app.id}/evaluation`,
                                  )
                                }
                              >
                                Go to Evaluation
                              </Button>
                            </div>
                            {appVersionsError ? (
                              <p
                                className="text-xs text-rose-500 font-semibold"
                                role="alert"
                              >
                                {appVersionsError}
                              </p>
                            ) : appVersionsLoading ? (
                              <p className="text-xs text-muted py-2">
                                Loading CV versions…
                              </p>
                            ) : appVersions.length === 0 ? (
                              <p className="text-xs text-muted py-2">
                                No CV versions found.
                              </p>
                            ) : (
                              <ul className="flex flex-col gap-2 p-0 m-0 list-none">
                                {appVersions.map((v) => {
                                  const isSelected =
                                    selectedVersion?.applicationId === app.id &&
                                    (selectedVersion.versionId == null
                                      ? v.kind === "active"
                                      : v.versionEventId ===
                                        selectedVersion.versionId);
                                  return (
                                    <li key={v.versionEventId ?? v.sortAt}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedVersion({
                                            applicationId: app.id,
                                            versionId:
                                              v.kind === "active"
                                                ? null
                                                : (v.versionEventId ?? null),
                                          })
                                        }
                                        className={cn(
                                          "w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors",
                                          isSelected
                                            ? "border-accent bg-accent/10"
                                            : "border-divider bg-surface-secondary/20 hover:bg-surface-secondary/40",
                                        )}
                                      >
                                        <div className="min-w-0">
                                          <p className="font-bold text-foreground text-sm">
                                            Version {v.displayVersion}
                                          </p>
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mt-0.5">
                                            {versionEventLabel(v)} ·{" "}
                                            {formatDisplayDateTime(v.sortAt)}
                                          </p>
                                          {v.changeSummary ? (
                                            <p className="text-xs text-muted mt-1 truncate">
                                              {v.changeSummary}
                                            </p>
                                          ) : null}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                          {v.isLatest ? (
                                            <Chip
                                              size="sm"
                                              variant="soft"
                                              color="accent"
                                              className="text-[10px] font-bold"
                                            >
                                              Latest
                                            </Chip>
                                          ) : null}
                                          {v.kind === "active" ? (
                                            <Chip
                                              size="sm"
                                              variant="soft"
                                              color="success"
                                              className="text-[10px] font-bold"
                                            >
                                              Active
                                            </Chip>
                                          ) : null}
                                        </div>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </Disclosure.Body>
                        </Disclosure.Content>
                      </Disclosure>
                    );
                  })}
                  {visibleAppCount < applications.length ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 w-fit self-center px-4 rounded-lg border border-divider text-xs font-bold"
                      onPress={() =>
                        setVisibleAppCount((n) => n + APPLICATIONS_PAGE_SIZE)
                      }
                    >
                      View more ({applications.length - visibleAppCount} more)
                    </Button>
                  ) : null}
                </div>
              )}

              {selectedVersionItem?.snapshot ? (
                <div className="rounded-xl border border-divider bg-surface-secondary/20 p-3.5 text-xs">
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider mb-2">
                    Version details — {selectedApp?.jobTitle} · Version{" "}
                    {selectedVersionItem.displayVersion}
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Field
                      label="Role"
                      value={fmtOrDash(selectedVersionItem.snapshot.role)}
                    />
                    <Field
                      label="Uploaded"
                      value={formatDisplayDate(
                        selectedVersionItem.snapshot.cv_uploaded_at,
                      )}
                    />
                    {selectedVersionItem.changeSummary ? (
                      <Field
                        label="Change summary"
                        value={selectedVersionItem.changeSummary}
                        wide
                      />
                    ) : null}
                    {diffFields.length > 0 ? (
                      diffFields.map((f) => (
                        <Field
                          key={f.label}
                          label={f.label}
                          value={f.value}
                          wide={f.wide}
                        />
                      ))
                    ) : (
                      <p className="sm:col-span-2 text-muted italic">
                        No profile fields differ from the candidate record
                        above.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <div>
            <Button
              variant="secondary"
              className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
              onPress={() => router.push("/admin/candidates")}
            >
              Back to candidates
            </Button>
          </div>
        </div>
      </div>

      <EditCandidateModal
        isOpen={editProfileModal.isOpen}
        onOpenChange={editProfileModal.setOpen}
        row={{ id: candidate.id, name: candidate.name }}
        canEdit
        onSaved={() => {
          editProfileModal.close();
          router.refresh();
        }}
      />
    </div>
  );
}
