"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Breadcrumbs,
  Button,
  Chip,
  cn,
  Disclosure,
  ListBox,
} from "@heroui/react";

import { CandidateProfileForm } from "@/components/admin/candidates/candidate-profile-form";
import { CvViewer } from "@/components/admin/candidates/cv-viewer";
import { PipelineStatusBadge } from "@/components/admin/candidates/pipeline-status-badge";
import { ReassignCvVersionModal } from "@/components/admin/candidates/reassign-cv-version-modal";
import { SectionCard } from "@/components/admin/shell/cards";
import type { CvManagementVersionListItem } from "@/lib/candidates/cv-management-version-list";
import { CandidateWithExtraInfoRow } from "@/lib/db/candidates";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/format-date";
import {
  CandidateApplicationRow,
  candidateService,
} from "@/lib/service/candidate.service";

type Props = {
  candidate: CandidateWithExtraInfoRow;
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

  // --- Candidate profile (the editable form) ------------------------------
  // Seeded from the server-rendered `candidate` and patched in place by the
  // form's `onSaved` after an edit. Salary lives on `campaign_applied` (one
  // value per application), so it's saved through its own per-application
  // endpoint, not this candidate-scoped form.
  const [dbRow, setDbRow] = useState<CandidateWithExtraInfoRow | null>(
    candidate,
  );
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const profileSaveRef = useRef<(() => void) | null>(null);

  // --- Applications list ("CV Versions" section) -------------------------
  // Every application this person has; `applicationsFetchedRef` de-dupes the
  // fetch, `visibleAppCount` paginates the accordion client-side.
  const [applications, setApplications] = useState<CandidateApplicationRow[]>(
    [],
  );
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<string | null>(
    null,
  );
  const applicationsFetchedRef = useRef(false);
  const [visibleAppCount, setVisibleAppCount] = useState(
    APPLICATIONS_PAGE_SIZE,
  );

  // --- CV versions per application (lazy, cached by application id) --------
  // Loaded only when a row is expanded; `fetchedAppVersionIdsRef` marks which
  // ids have been fetched so re-expanding doesn't refetch.
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

  // --- CV viewer ---------------------------------------------------------
  // Which application + version the left-hand CV iframe is showing.
  const [selectedVersion, setSelectedVersion] =
    useState<SelectedVersion | null>(null);

  // --- Expected salary (per application) --------------------------------.
  const [expectedSalary, setExpectedSalary] = useState<{
    applicationId: string;
    value: string | null;
    canView: boolean;
  } | null>(null);

  // --- "Wrong CV on this application?" recovery modal (acts on the
  //     currently-viewed application) -------------------------------------
  const [reassignModalOpen, setReassignModalOpen] = useState(false);

  const loadApplications = useCallback(async () => {
    if (applicationsFetchedRef.current) return;
    applicationsFetchedRef.current = true;
    setApplicationsLoading(true);
    setApplicationsError(null);
    try {
      const { applications } = await candidateService.getCandidateApplications(
        candidate.id,
      );
      setApplications(applications);
    } catch (e) {
      // Let a later retry re-run the fetch instead of staying stuck.
      applicationsFetchedRef.current = false;
      setApplicationsError(
        e instanceof Error ? e.message : "Could not load applications.",
      );
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

  const refreshAppVersions = useCallback(
    (appId: string) => {
      fetchedAppVersionIdsRef.current.delete(appId);
      void loadAppVersions(appId);
    },
    [loadAppVersions],
  );

  useEffect(() => {
    if (selectedVersion || applications.length === 0) return;
    const first = applications[0];
    setSelectedVersion({ applicationId: first.id, versionId: null });
    setExpandedAppIds((prev) => new Set(prev).add(first.id));
    void loadAppVersions(first.id);
  }, [applications, selectedVersion, loadAppVersions]);

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

  // Re-fetch the expected salary whenever the selected application changes.
  const selectedApplicationId = selectedApp?.id ?? null;
  useEffect(() => {
    if (!selectedApplicationId) {
      setExpectedSalary(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { expectedSalary: value, canView } =
          await candidateService.getExpectedSalary(
            candidate.id,
            selectedApplicationId,
          );
        if (cancelled) return;
        setExpectedSalary({
          applicationId: selectedApplicationId,
          value,
          canView,
        });
      } catch {
        if (!cancelled) {
          setExpectedSalary({
            applicationId: selectedApplicationId,
            value: null,
            canView: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidate.id, selectedApplicationId]);

  // Save just the salary field through its own per-application endpoint.
  const handleSaveExpectedSalary = useCallback(
    async (value: string | null) => {
      if (!selectedApplicationId) return;
      const { expectedSalary: saved, canView } =
        await candidateService.updateExpectedSalary(
          candidate.id,
          selectedApplicationId,
          value,
        );
      setExpectedSalary({
        applicationId: selectedApplicationId,
        value: saved,
        canView,
      });
    },
    [candidate.id, selectedApplicationId],
  );

  const canEditSalary =
    expectedSalary?.applicationId === selectedApplicationId &&
    expectedSalary.canView;

  const cvViewerApplicationId =
    selectedVersion?.applicationId ?? applications[0]?.id ?? null;
  const cvUrl = !cvViewerApplicationId
    ? ""
    : selectedVersion?.versionId
      ? `/api/admin/candidates/${cvViewerApplicationId}/cv-download?versionId=${encodeURIComponent(selectedVersion.versionId)}`
      : `/api/admin/candidates/${cvViewerApplicationId}/cv-download`;

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
            {` · ${selectedApp?.job_title ?? "No Job Assigned"}`}
            {selectedVersionItem
              ? ` · ${versionEventLabel(selectedVersionItem)}`
              : ""}
          </p>
          <CvViewer
            cvUrl={cvUrl}
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
              {applications.length === 0
                ? "No applications"
                : applications.length === 1
                  ? "1 application"
                  : `${applications.length} applications`}
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
            <CandidateProfileForm
              candidateId={candidate.id}
              candidate={dbRow ?? candidate}
              expectedSalary={
                expectedSalary?.applicationId === selectedApplicationId
                  ? expectedSalary.value
                  : null
              }
              canEditSalary={canEditSalary}
              onSaveExpectedSalary={handleSaveExpectedSalary}
              onDirtyChange={setProfileDirty}
              onBusyChange={setProfileBusy}
              saveActionRef={profileSaveRef}
              onSaved={(saved) => {
                // `saved` is the JSON row (string timestamps); merge only the
                // editable columns onto the local record.
                setDbRow((prev) =>
                  prev
                    ? {
                        ...prev,
                        name: saved.name,
                        email: saved.email,
                        phone: saved.phone,
                        degree: saved.degree,
                        education: saved.education,
                        role: saved.role,
                        experience_years: saved.experience_years,
                        skills: saved.skills,
                      }
                    : prev,
                );
                setProfileDirty(false);
                for (const appId of [...fetchedAppVersionIdsRef.current]) {
                  refreshAppVersions(appId);
                }
                router.refresh();
              }}
              onMerged={(survivingCandidateId) => {
                // This candidate's CV was folded into `survivingCandidateId`
                // and this record may now be gone -- go to the survivor.
                setProfileDirty(false);
                router.push(
                  `/admin/candidate-detail/${survivingCandidateId}`,
                );
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
                                {app.job_title ?? "No Job Assigned"}
                              </p>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted mt-0.5">
                                Applied {formatDisplayDate(app.created_at)}
                              </p>
                              <div className="mt-1">
                                <PipelineStatusBadge
                                  app={app}
                                  hasJob={app.job_id != null}
                                />
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {app.id === selectedVersion?.applicationId ? (
                                <Chip
                                  size="sm"
                                  variant="soft"
                                  color="accent"
                                  className="text-[10px] font-bold"
                                >
                                  Viewing
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
                                      {v.isLatest && app.job_id != null ? (
                                        <div className="flex items-center justify-center gap-3">
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            className="h-7 px-3 rounded-lg border border-divider text-[10px] font-bold shrink-0"
                                            onPress={() => {
                                              router.push(
                                                `/admin/jd/${app.job_id}/pipeline/${app.id}/evaluation`,
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
              isDisabled={!selectedApp}
              onPress={() => setReassignModalOpen(true)}
            >
              Wrong CV on this application?
            </Button>
          </div>
        </div>
      </div>

      {selectedApp ? (
        <ReassignCvVersionModal
          open={reassignModalOpen}
          onOpenChange={setReassignModalOpen}
          sourceCampaignAppliedId={selectedApp.id}
          onReassigned={(sourceApplicationDeleted) => {
            if (sourceApplicationDeleted) {
              router.push("/admin/candidates");
              return;
            }
            window.location.reload();
          }}
        />
      ) : null}
    </div>
  );
}
