"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Breadcrumbs,
  Button,
  Chip,
  cn,
  Disclosure,
  ListBox,
} from "@heroui/react";

import { SectionCard } from "@/components/admin/shell/cards";
import { CandidateProfileEditSection } from "@/components/admin/candidates/candidate-profile-edit-section";
import { PipelineStatusBadge } from "@/components/admin/candidates/pipeline-status-badge";
import { ReassignCvVersionModal } from "@/components/admin/candidates/reassign-cv-version-modal";
import { useToast } from "@/components/admin/toast-provider";
import type { CandidateDetailRow } from "@/lib/candidates/campaign-applied-to-candidate-detail-row";
import {
  campaignAppliedToCandidateDbRow,
  type CandidateDbRow,
} from "@/lib/candidates/db-row";
import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import type { CvManagementVersionListItem } from "@/lib/candidates/cv-management-version-list";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/format-date";

type Props = {
  candidate: CandidateDetailRow;
};

type ApplicationListItem = {
  id: string;
  jobTitle: string;
  jobId: string | null;
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

const APPLICATIONS_PAGE_SIZE = 5;

function versionEventLabel(item: CvManagementVersionListItem): string {
  if (item.kind === "active") return "Active";
  if (item.eventType === "profile_edit") return "Manual edit";
  if (item.eventType === "full_restore") return "Restored";
  return "Uploaded";
}

export function CandidateDetailClient({ candidate }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "email">("overview");

  const [dbRow, setDbRow] = useState<CandidateDbRow | null>(null);
  const [dbLoadState, setDbLoadState] = useState<"loading" | "error" | "ok">(
    "loading",
  );
  const [canEditSalary, setCanEditSalary] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const profileSaveRef = useRef<(() => void) | null>(null);

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

  const [reassignModalOpen, setReassignModalOpen] = useState(false);

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

  useEffect(() => {
    const ac = new AbortController();
    setDbRow(null);
    setDbLoadState("loading");
    setCanEditSalary(false);
    setProfileDirty(false);
    setProfileBusy(false);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) {
          if (!ac.signal.aborted) setDbLoadState("error");
          return;
        }
        const json = (await res.json()) as {
          candidate?: unknown;
          canViewSalary?: boolean;
        };
        if (ac.signal.aborted || !json.candidate) {
          if (!ac.signal.aborted) setDbLoadState("error");
          return;
        }
        const c =
          json.candidate &&
          typeof json.candidate === "object" &&
          "candidate_id" in json.candidate
            ? campaignAppliedToCandidateDbRow(
                json.candidate as CampaignAppliedAdminRow,
              )
            : (json.candidate as CandidateDbRow);
        setDbRow(c);
        setCanEditSalary(json.canViewSalary === true);
        setDbLoadState("ok");
      } catch {
        if (!ac.signal.aborted) setDbLoadState("error");
      }
    })();
    return () => ac.abort();
  }, [candidate.id]);

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

  // Editing the candidate's profile creates a new (same-file) cv_detail_versions
  // row on the backend, so the cached version list for that application is
  // stale after a save -- drop the cache and refetch instead of leaving the
  // panel showing pre-edit data until a full page reload.
  const refreshAppVersions = useCallback(
    (appId: string) => {
      fetchedAppVersionIdsRef.current.delete(appId);
      void loadAppVersions(appId);
    },
    [loadAppVersions],
  );

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
              ? ` · ${selectedApp?.jobTitle ?? candidate.jobTitle ?? "No Job Assigned"} · ${versionEventLabel(selectedVersionItem)}`
              : ` · ${candidate.jobTitle ?? "No Job Assigned"}`}
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
              {candidate.jobTitle
                ? `Applied for ${candidate.jobTitle}`
                : "No Job Assigned"}
            </p>
          </div>

          <SectionCard
            title="Candidate Details"
            description="Edit personal profile fields. Save when you're done."
            actions={
              <Button
                variant="primary"
                size="sm"
                className="h-8 px-3 rounded-lg text-xs font-bold"
                isDisabled={!profileDirty || profileBusy}
                isPending={profileBusy}
                onPress={() => profileSaveRef.current?.()}
              >
                Save
              </Button>
            }
          >
            <CandidateProfileEditSection
              candidateId={candidate.id}
              dbRow={dbRow}
              canEdit
              canEditSalary={canEditSalary}
              isPreview={false}
              dbLoadState={dbLoadState}
              startInEditMode
              embedded
              hidePipelineAndSource
              // A profile-edit conflict here must be fixed by changing the
              // contact info, not by merging into another candidate --
              // that's a deliberate, cross-candidate action reserved for the
              // "Wrong CV on this candidate?" recovery tool below, so
              // `onCandidateIdChanged` is unreachable and omitted.
              allowProfileConflictMerge={false}
              onDirtyChange={setProfileDirty}
              onBusyChange={setProfileBusy}
              saveActionRef={profileSaveRef}
              onSaved={(saved) => {
                setDbRow(saved);
                setProfileDirty(false);
                refreshAppVersions(candidate.id);
                router.refresh();
                toast.success("Candidate profile updated.");
              }}
            />
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
                                <PipelineStatusBadge
                                  app={app}
                                  hasJob={app.jobId != null}
                                />
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
                              <ListBox
                                aria-label="CV Versions"
                                selectionMode="single"
                                selectedKeys={
                                  selectedVersion?.applicationId === app.id
                                    ? new Set([
                                        selectedVersion.versionId ?? "active",
                                      ])
                                    : new Set()
                                }
                                onSelectionChange={(keys) => {
                                  const key = Array.from(keys)[0];
                                  if (key == null) return;
                                  setSelectedVersion({
                                    applicationId: app.id,
                                    versionId:
                                      key === "active" ? null : String(key),
                                  });
                                }}
                                className="flex flex-col gap-2 p-0 m-0 list-none outline-none"
                              >
                                {appVersions.map((v, i) => {
                                  const indexLabel = appVersions.length - i;
                                  const isSelected =
                                    selectedVersion?.applicationId === app.id &&
                                    (selectedVersion.versionId == null
                                      ? v.kind === "active"
                                      : v.versionEventId ===
                                        selectedVersion.versionId);
                                  const itemId =
                                    v.kind === "active"
                                      ? "active"
                                      : (v.versionEventId ?? "");
                                  return (
                                    <ListBox.Item
                                      key={v.versionEventId ?? v.sortAt}
                                      id={itemId}
                                      textValue={`Version ${formatDisplayDateTime(v.sortAt)}`}
                                      className={cn(
                                        "w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors cursor-pointer outline-none focus:outline-none",
                                        isSelected
                                          ? "border-accent bg-accent/10"
                                          : "border-divider bg-surface-secondary/20 hover:bg-surface-secondary/40",
                                      )}
                                    >
                                      <div className="min-w-0">
                                        <div className="flex shrink-0 items-center gap-1.5">
                                          <p className="font-bold text-foreground text-sm pr-1">
                                            Version {indexLabel}
                                          </p>
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
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mt-0.5">
                                          {"Last modified "}
                                          {formatDisplayDateTime(v.sortAt)}
                                          {" • "}
                                          {versionEventLabel(v)}
                                        </p>
                                        {v.changeSummary ? (
                                          <p className="text-xs text-muted mt-1 truncate">
                                            {v.changeSummary}
                                          </p>
                                        ) : null}
                                      </div>
                                      {v.isLatest && app.jobId != null ? (
                                        <div className="flex items-center justify-center gap-3">
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-7 px-3 rounded-lg border border-divider text-[10px] font-bold shrink-0"
                                            onPress={() => {
                                              router.push(
                                                `/admin/jd/${app.jobId}/pipeline/${app.id}/evaluation`,
                                              );
                                            }}
                                          >
                                            Go to Evaluation
                                          </Button>
                                        </div>
                                      ) : null}
                                    </ListBox.Item>
                                  );
                                })}
                              </ListBox>
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
            </div>
          </SectionCard>

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
              onPress={() => router.push("/admin/candidates")}
            >
              Back to candidates
            </Button>
            <Button
              variant="tertiary"
              className="h-8 px-3 rounded-lg text-xs font-bold text-muted"
              onPress={() => setReassignModalOpen(true)}
            >
              Wrong CV on this candidate?
            </Button>
          </div>
        </div>
      </div>

      <ReassignCvVersionModal
        open={reassignModalOpen}
        onOpenChange={setReassignModalOpen}
        sourceCampaignAppliedId={candidate.id}
        onReassigned={(sourceApplicationDeleted) => {
          if (sourceApplicationDeleted) {
            // This application had no CV of its own to roll back to, so it
            // (and its candidate, if orphaned) was deleted outright --
            // `candidate.id` no longer refers to anything. Reloading in
            // place would just 404.
            router.push("/admin/candidates");
            return;
          }
          // A plain `router.refresh()` + `refreshAppVersions` isn't enough
          // here: the CV preview iframe re-navigates only when the `cvUrl`
          // it computes changes, and reassigning doesn't change that string
          // (same application id, no versionId param either way) even
          // though the *active* CV behind it just changed on the backend --
          // it would keep showing the stale (misattributed) file. This is a
          // rare, deliberate admin action, not a hot path, so a full reload
          // is the simplest way to guarantee every panel (iframe, profile,
          // version list) reflects the new state.
          window.location.reload();
        }}
      />
    </div>
  );
}
