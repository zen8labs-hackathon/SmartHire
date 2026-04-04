"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Avatar,
  Button,
  Chip,
  Input,
  Label,
  Modal,
  useOverlayState,
} from "@heroui/react";

import {
  candidateDisplayInitials,
  candidateStatusChipColor,
  jdMatchChipColor,
} from "@/lib/candidates/candidate-display";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";
import type { CandidateRow } from "@/lib/candidates/types";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

type Section = "new" | "interview" | "offer" | "failed";

type Props = {
  jobDescriptionId: number;
  dbRows: CandidateDbRow[];
  loadState: "idle" | "loading" | "error" | "ok";
  onRefetch: () => void;
};

function isNewSectionStatus(status: string) {
  return status === "New" || status === "Shortlisted";
}

function jdNumericScore(r: CandidateDbRow): number {
  const st = String(r.jd_match_status ?? "pending");
  const sc = r.jd_match_score == null ? null : Number(r.jd_match_score);
  if (st === "completed" && sc != null && Number.isFinite(sc)) return sc;
  return -1;
}

function formatSchedule(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(t));
}

function localDatetimeToIso(local: string): string | null {
  if (!local?.trim()) return null;
  const ms = new Date(local).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function emptySelection(): Record<Section, Set<string>> {
  return {
    new: new Set(),
    interview: new Set(),
    offer: new Set(),
    failed: new Set(),
  };
}

export function JdAppliedCandidatesPipeline({
  jobDescriptionId,
  dbRows,
  loadState,
  onRefetch,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState(emptySelection);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const [interviewDrafts, setInterviewDrafts] = useState<Record<string, string>>(
    {},
  );
  const [onboardingDrafts, setOnboardingDrafts] = useState<
    Record<string, string>
  >({});

  const interviewModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setInterviewDrafts({});
        setPipelineError(null);
      }
    },
  });

  const offerModal = useOverlayState({
    onOpenChange: (open) => {
      if (!open) {
        setOnboardingDrafts({});
        setPipelineError(null);
      }
    },
  });

  useEffect(() => {
    setSelected(emptySelection());
  }, [dbRows]);

  const buckets = useMemo(() => {
    const newR: CandidateDbRow[] = [];
    const intR: CandidateDbRow[] = [];
    const offR: CandidateDbRow[] = [];
    const failR: CandidateDbRow[] = [];
    for (const r of dbRows) {
      const s = r.status;
      if (isNewSectionStatus(s)) newR.push(r);
      else if (s === "Interviewing") intR.push(r);
      else if (s === "Offer") offR.push(r);
      else if (s === "Failed") failR.push(r);
      else newR.push(r);
    }
    newR.sort((a, b) => jdNumericScore(b) - jdNumericScore(a));
    intR.sort((a, b) => {
      const ta =
        a.interview_at && !Number.isNaN(Date.parse(a.interview_at))
          ? Date.parse(a.interview_at)
          : Number.POSITIVE_INFINITY;
      const tb =
        b.interview_at && !Number.isNaN(Date.parse(b.interview_at))
          ? Date.parse(b.interview_at)
          : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
    offR.sort((a, b) => {
      const ta =
        a.onboarding_at && !Number.isNaN(Date.parse(a.onboarding_at))
          ? Date.parse(a.onboarding_at)
          : Number.POSITIVE_INFINITY;
      const tb =
        b.onboarding_at && !Number.isNaN(Date.parse(b.onboarding_at))
          ? Date.parse(b.onboarding_at)
          : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
    failR.sort(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
    return { new: newR, interview: intR, offer: offR, failed: failR };
  }, [dbRows]);

  const toggleSelect = useCallback((section: Section, id: string) => {
    setSelected((prev) => {
      const copy = new Set(prev[section]);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return { ...prev, [section]: copy };
    });
  }, []);

  const postPipeline = useCallback(
    async (updates: unknown[]) => {
      const h = await getSessionAuthorizationHeaders(supabase);
      const res = await fetch("/api/admin/candidates/pipeline", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(h.Authorization ? { Authorization: h.Authorization } : {}),
        },
        body: JSON.stringify({ jobDescriptionId, updates }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
    },
    [jobDescriptionId, supabase],
  );

  const openInterviewModal = useCallback(() => {
    const ids = [...selected.new];
    if (ids.length === 0) return;
    const drafts: Record<string, string> = {};
    for (const id of ids) drafts[id] = "";
    setInterviewDrafts(drafts);
    interviewModal.open();
  }, [selected.new, interviewModal]);

  const openOfferModal = useCallback(() => {
    const ids = [...selected.interview];
    if (ids.length === 0) return;
    const drafts: Record<string, string> = {};
    for (const id of ids) drafts[id] = "";
    setOnboardingDrafts(drafts);
    offerModal.open();
  }, [selected.interview, offerModal]);

  const confirmInterview = useCallback(async () => {
    const entries = Object.entries(interviewDrafts);
    for (const [, v] of entries) {
      if (!v?.trim()) {
        setPipelineError("Please set interview date and time for every candidate.");
        return;
      }
    }
    const updates: {
      id: string;
      status: "Interviewing";
      interview_at: string;
    }[] = [];
    for (const [id, local] of entries) {
      const iso = localDatetimeToIso(local);
      if (!iso) {
        setPipelineError("One or more interview times are invalid.");
        return;
      }
      updates.push({ id, status: "Interviewing", interview_at: iso });
    }
    setPipelineError(null);
    setPipelineBusy(true);
    try {
      await postPipeline(updates);
      interviewModal.close();
      onRefetch();
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [interviewDrafts, interviewModal, onRefetch, postPipeline]);

  const confirmOffer = useCallback(async () => {
    const entries = Object.entries(onboardingDrafts);
    for (const [, v] of entries) {
      if (!v?.trim()) {
        setPipelineError(
          "Please set onboarding date and time for every candidate.",
        );
        return;
      }
    }
    const updates: { id: string; status: "Offer"; onboarding_at: string }[] =
      [];
    for (const [id, local] of entries) {
      const iso = localDatetimeToIso(local);
      if (!iso) {
        setPipelineError("One or more onboarding times are invalid.");
        return;
      }
      updates.push({ id, status: "Offer", onboarding_at: iso });
    }
    setPipelineError(null);
    setPipelineBusy(true);
    try {
      await postPipeline(updates);
      offerModal.close();
      onRefetch();
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [onboardingDrafts, offerModal, onRefetch, postPipeline]);

  const markNewAsFailed = useCallback(async () => {
    const ids = [...selected.new];
    if (ids.length === 0) return;
    setPipelineBusy(true);
    setPipelineError(null);
    try {
      await postPipeline(ids.map((id) => ({ id, status: "Failed" as const })));
      onRefetch();
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [onRefetch, postPipeline, selected.new]);

  const markInterviewAsFailed = useCallback(async () => {
    const ids = [...selected.interview];
    if (ids.length === 0) return;
    setPipelineBusy(true);
    setPipelineError(null);
    try {
      await postPipeline(ids.map((id) => ({ id, status: "Failed" as const })));
      onRefetch();
    } catch (e) {
      setPipelineError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setPipelineBusy(false);
    }
  }, [onRefetch, postPipeline, selected.interview]);

  function renderRow(r: CandidateDbRow, section: Section) {
    const row: CandidateRow = candidateDbRowToTableRow(r);
    const sched =
      section === "interview"
        ? formatSchedule(r.interview_at)
        : section === "offer"
          ? formatSchedule(r.onboarding_at)
          : null;

    return (
      <li
        key={r.id}
        className="flex items-start gap-3 rounded-xl border border-divider bg-surface-secondary/40 p-3"
      >
        <label className="mt-1 flex cursor-pointer items-center">
          <span className="sr-only">Select {row.name}</span>
          <input
            type="checkbox"
            className="size-4 rounded border-divider accent-accent"
            checked={selected[section].has(r.id)}
            onChange={() => toggleSelect(section, r.id)}
          />
        </label>
        <Avatar className="size-10 shrink-0" size="md">
          {row.avatarUrl ? <Avatar.Image alt="" src={row.avatarUrl} /> : null}
          <Avatar.Fallback className="text-xs">
            {candidateDisplayInitials(row.name)}
          </Avatar.Fallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {row.name}
          </p>
          <p className="truncate text-xs text-muted">{row.role}</p>
          {sched ? (
            <p className="mt-1 text-xs text-muted">
              {section === "interview" ? "Interview: " : "Onboarding: "}
              {sched}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip
              size="sm"
              variant="soft"
              color={jdMatchChipColor(row)}
              className="min-w-[3.25rem] justify-center text-xs font-bold tabular-nums"
            >
              {row.jdMatchLabel}
            </Chip>
            <Chip
              size="sm"
              variant="soft"
              color={candidateStatusChipColor(row.status)}
              className="text-[10px] font-bold uppercase"
            >
              {row.status}
            </Chip>
          </div>
        </div>
      </li>
    );
  }

  function renderSection(
    title: string,
    section: Section,
    list: CandidateDbRow[],
    actions: "new" | "interview" | null,
  ) {
    const count = selected[section].size;
    return (
      <div className="rounded-xl border border-divider bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="text-xs tabular-nums text-muted">
            {list.length} candidate{list.length === 1 ? "" : "s"}
          </span>
        </div>
        {actions === "new" && count > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
              isDisabled={pipelineBusy}
              onPress={openInterviewModal}
            >
              Schedule interview ({count})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pipelineBusy}
              onPress={() => void markNewAsFailed()}
            >
              Mark failed ({count})
            </Button>
          </div>
        ) : null}
        {actions === "interview" && count > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              className="bg-gradient-to-br from-[#002542] to-[#1b3b5a]"
              isDisabled={pipelineBusy}
              onPress={openOfferModal}
            >
              Move to offer ({count})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pipelineBusy}
              onPress={() => void markInterviewAsFailed()}
            >
              Mark failed ({count})
            </Button>
          </div>
        ) : null}
        {list.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No candidates in this stage.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">{list.map((r) => renderRow(r, section))}</ul>
        )}
      </div>
    );
  }

  if (loadState === "loading") {
    return <p className="mt-3 text-sm text-muted">Loading…</p>;
  }
  if (loadState === "error") {
    return (
      <p className="mt-3 text-sm text-danger">
        Could not load candidates. Try again later.
      </p>
    );
  }
  if (loadState === "ok" && dbRows.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        No candidates yet. Link a job opening to this JD and add applicants from
        the Candidates page or the JD pipeline.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {pipelineError ? (
        <p className="text-sm text-danger">{pipelineError}</p>
      ) : null}

      {renderSection("New", "new", buckets.new, "new")}
      {renderSection("Interview", "interview", buckets.interview, "interview")}
      {renderSection("Offer", "offer", buckets.offer, null)}
      {renderSection("Failed", "failed", buckets.failed, null)}

      <Modal.Backdrop
        isOpen={interviewModal.isOpen}
        onOpenChange={interviewModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-lg overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-5 py-4">
              <Modal.Heading>Schedule interviews</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-sm text-muted">
                Set the interview date and time for each selected candidate.
              </p>
              {Object.keys(interviewDrafts).map((id) => {
                const r = dbRows.find((x) => x.id === id);
                const label = r
                  ? candidateDbRowToTableRow(r).name
                  : id.slice(0, 8);
                return (
                  <div key={id} className="space-y-1">
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input
                      type="datetime-local"
                      value={interviewDrafts[id] ?? ""}
                      onChange={(e) =>
                        setInterviewDrafts((d) => ({
                          ...d,
                          [id]: e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                );
              })}
              {pipelineError && interviewModal.isOpen ? (
                <p className="text-sm text-danger">{pipelineError}</p>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
              <Button variant="secondary" onPress={interviewModal.close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={pipelineBusy}
                onPress={() => void confirmInterview()}
              >
                Confirm
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop
        isOpen={offerModal.isOpen}
        onOpenChange={offerModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-lg overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-5 py-4">
              <Modal.Heading>Onboarding dates</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-sm text-muted">
                Set the onboarding date and time for each selected candidate.
              </p>
              {Object.keys(onboardingDrafts).map((id) => {
                const r = dbRows.find((x) => x.id === id);
                const label = r
                  ? candidateDbRowToTableRow(r).name
                  : id.slice(0, 8);
                return (
                  <div key={id} className="space-y-1">
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input
                      type="datetime-local"
                      value={onboardingDrafts[id] ?? ""}
                      onChange={(e) =>
                        setOnboardingDrafts((d) => ({
                          ...d,
                          [id]: e.target.value,
                        }))
                      }
                      className="w-full"
                    />
                  </div>
                );
              })}
              {pipelineError && offerModal.isOpen ? (
                <p className="text-sm text-danger">{pipelineError}</p>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
              <Button variant="secondary" onPress={offerModal.close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={pipelineBusy}
                onPress={() => void confirmOffer()}
              >
                Confirm
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
