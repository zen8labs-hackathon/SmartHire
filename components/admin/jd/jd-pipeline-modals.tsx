import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Input, Label, Modal } from "@heroui/react";

import { CandidateProfileEditSection } from "@/components/admin/candidates/candidate-profile-edit-section";
import {
  type CandidateDbRow,
  campaignAppliedToCandidateDbRow,
} from "@/lib/candidates/db-row";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
import { jdMatchChipColor } from "@/lib/candidates/candidate-display";
import {
  jdRequirementSourceLabel,
  jdRequirementVerdictStyle,
  parseJdMatchRationale,
  sortJdRequirements,
  type JdRequirementCheck,
} from "@/lib/candidates/jd-match-rationale";
import { formatSchedule, localDatetimeToIso } from "@/lib/pipelines/jd-pipeline-row-helpers";

type ScheduleHistoryItem = {
  id: string;
  round_label: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  status: string;
};

function toLocalDatetimeInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type InterviewScheduleModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: JdPipelineApplicationRow | null;
  canEdit: boolean;
  onSaved: () => void;
};

/**
 * Round label + date/time + duration + location, backed by `candidate_schedules`
 * via the existing `PATCH /api/admin/candidates/[id]/timeline` contract (a
 * reschedule creates a new row server-side; this modal just supplies the
 * fields). Replaces the old single-datetime-field inline editor, which wrote
 * to the now-dropped `candidates.interview_at` column.
 */
export function InterviewScheduleModal({
  isOpen,
  onOpenChange,
  row,
  canEdit,
  onSaved,
}: InterviewScheduleModalProps) {
  const [roundLabel, setRoundLabel] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [location, setLocation] = useState("");
  const [history, setHistory] = useState<ScheduleHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !row) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/candidates/${row.id}/timeline`, {
          credentials: "include",
        });
        const json = (await res.json()) as {
          schedules?: ScheduleHistoryItem[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Could not load schedule.");
        if (cancelled) return;
        const schedules = json.schedules ?? [];
        setHistory(schedules);
        const active = schedules.find(
          (s) => s.status === "Scheduled" || s.status === "Confirmed",
        );
        setRoundLabel(active?.round_label ?? "");
        setScheduledAt(
          active ? toLocalDatetimeInputValue(active.scheduled_at) : "",
        );
        setDurationMinutes(
          active?.duration_minutes != null ? String(active.duration_minutes) : "",
        );
        setLocation(active?.location ?? "");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load schedule.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, row]);

  const handleSave = useCallback(async () => {
    if (!row) return;
    const iso = localDatetimeToIso(scheduledAt);
    if (!iso) {
      setError("Please set a valid date and time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/candidates/${row.id}/timeline`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: iso,
          roundLabel: roundLabel.trim() || undefined,
          durationMinutes: durationMinutes.trim()
            ? Number(durationMinutes)
            : undefined,
          location: location.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save schedule.");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  }, [row, scheduledAt, roundLabel, durationMinutes, location, onSaved, onOpenChange]);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-lg overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading>Interview schedule</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
            {loading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Round label</Label>
                  <Input
                    value={roundLabel}
                    onChange={(e) => setRoundLabel(e.target.value)}
                    placeholder="e.g. Technical round"
                    disabled={!canEdit}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Date &amp; time</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    disabled={!canEdit}
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">
                      Duration (minutes)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      disabled={!canEdit}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Location</Label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Meet link, room"
                      disabled={!canEdit}
                      className="w-full"
                    />
                  </div>
                </div>
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                {history.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Past rounds
                    </p>
                    <ul className="space-y-1.5">
                      {history.map((h) => (
                        <li
                          key={h.id}
                          className="rounded-lg border border-divider bg-surface-secondary/20 px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-foreground">
                            {h.round_label ?? "Interview"}
                          </span>{" "}
                          <span className="text-muted">
                            · {formatSchedule(h.scheduled_at) ?? h.scheduled_at} ·{" "}
                            {h.status}
                            {h.duration_minutes ? ` · ${h.duration_minutes}min` : ""}
                            {h.location ? ` · ${h.location}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              Close
            </Button>
            {canEdit ? (
              <Button
                variant="primary"
                isDisabled={saving || loading}
                onPress={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type RationaleModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: JdPipelineApplicationRow | null;
};

/**
 * One JD requirement and how the candidate measured up against it.
 */
/** Card accent + badge tint per verdict colour. */
const REQUIREMENT_STYLE: Record<
  ReturnType<typeof jdRequirementVerdictStyle>["color"],
  { card: string; badge: string }
> = {
  success: {
    card: "border-l-success bg-success/[0.04]",
    badge: "bg-success/10 text-success",
  },
  warning: {
    card: "border-l-warning bg-warning/[0.04]",
    badge: "bg-warning/10 text-warning",
  },
  danger: {
    card: "border-l-danger bg-danger/[0.04]",
    badge: "bg-danger/10 text-danger",
  },
  default: {
    card: "border-l-divider bg-muted/[0.04]",
    badge: "bg-muted/10 text-muted",
  },
};

function RequirementRow({ check }: { check: JdRequirementCheck }) {
  const style = jdRequirementVerdictStyle(check.verdict);
  const tone = REQUIREMENT_STYLE[style.color];

  return (
    <li className={`rounded-lg border-l-4 px-4 py-3 ${tone.card}`}>
      <div className="flex items-center gap-2">
        <span
          aria-label={style.label}
          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none ${tone.badge}`}
        >
          {style.icon}
        </span>
        <span className="whitespace-nowrap text-[0.6875rem] font-bold uppercase tracking-wide text-muted">
          {jdRequirementSourceLabel(check.source)}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold leading-snug text-foreground">
        {check.requirement}
      </p>
      {check.evidence ? (
        <p className="mt-2 rounded-md bg-background/60 px-3 py-2 text-sm leading-snug text-muted">
          {check.evidence}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Read-only view of the AI's JD-match rationale for a candidate's active CV
 * version (`campaign_applied.jd_match_rationale`), alongside the numeric
 * score it explains.
 *
 * Runs scored before the per-requirement checklist shipped (and formula-only
 * fallbacks, which never ran an LLM) hold plain prose in that column --
 * `parseJdMatchRationale` returns those with no `requirements`, and they keep
 * the original single-paragraph layout until someone rescores.
 */
export function RationaleModal({
  isOpen,
  onOpenChange,
  row,
}: RationaleModalProps) {
  const score =
    row?.jd_match_status === "completed" && row.jd_match_score != null
      ? Math.round(row.jd_match_score)
      : null;

  const rationale = parseJdMatchRationale(row?.jd_match_rationale);
  const requirements = rationale ? sortJdRequirements(rationale.requirements) : [];

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading className="flex items-center gap-2 text-lg font-bold text-foreground">
              JD match reasoning
              {score != null ? (
                <Chip
                  size="sm"
                  variant="soft"
                  color={jdMatchChipColor({ jdMatchScore: score })}
                  className="min-w-[3.25rem] justify-center text-sm font-bold tabular-nums"
                >
                  {score}
                </Chip>
              ) : null}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
            {row?.jd_match_status === "failed" ? (
              <p className="text-sm text-danger">
                {row.jd_match_error ?? "Scoring failed."}
              </p>
            ) : rationale ? (
              <>
                {rationale.summary ? (
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {rationale.summary}
                  </p>
                ) : null}
                {rationale.meta ? (
                  <p className="whitespace-pre-wrap text-xs text-muted">
                    {rationale.meta}
                  </p>
                ) : null}
                {requirements.length > 0 ? (
                  <ul className="space-y-2 border-t border-divider pt-4 first:border-t-0 first:pt-0">
                    {requirements.map((check, i) => (
                      <RequirementRow key={`${check.requirement}-${i}`} check={check} />
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">
                No reasoning available for this candidate yet.
              </p>
            )}
          </Modal.Body>
          <Modal.Footer className="justify-end border-t border-divider px-5 py-4">
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              Close
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type DeleteCandidateModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string | null;
  deleteError: string | null;
  deleteBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteCandidateModal({
  isOpen,
  onOpenChange,
  candidateName,
  deleteError,
  deleteBusy,
  onCancel,
  onConfirm,
}: DeleteCandidateModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4 bg-muted/10">
            <Modal.Heading className="text-lg font-bold text-foreground">
              Delete Candidate
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-5 py-4 space-y-3">
            <p className="text-sm text-muted">
              Are you sure you want to delete candidate{" "}
              <span className="font-semibold text-foreground">
                {candidateName ?? "this candidate"}
              </span>
              ?
            </p>
            <p className="text-xs text-danger font-medium bg-danger/5 border border-danger/25 rounded-lg p-2.5">
              Warning: This action is permanent and cannot be undone. It will
              remove the candidate from this JD campaign and delete their
              associated CV file.
            </p>
            {deleteError ? (
              <p className="text-sm text-danger" role="alert">
                {deleteError}
              </p>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4 bg-muted/10">
            <Button
              variant="secondary"
              onPress={onCancel}
              isDisabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-danger text-white hover:bg-danger-600"
              isDisabled={deleteBusy}
              onPress={onConfirm}
            >
              {deleteBusy ? "Deleting..." : "Delete"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type ConfirmRunJdMatchModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  candidateCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmRunJdMatchModal({
  isOpen,
  onOpenChange,
  candidateCount,
  busy,
  onCancel,
  onConfirm,
}: ConfirmRunJdMatchModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading className="text-lg font-bold text-foreground">
              Run AI JD Match
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-5 py-4">
            <p className="text-sm text-muted">
              Run AI JD matching for{" "}
              <span className="font-semibold text-foreground">
                {candidateCount}
              </span>{" "}
              selected candidate{candidateCount === 1 ? "" : "s"}? This may
              take a while and will overwrite any existing match scores.
            </p>
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
            <Button variant="secondary" onPress={onCancel} isDisabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-accent text-accent-foreground"
              isDisabled={busy}
              onPress={onConfirm}
            >
              {busy ? "Running…" : "Run match"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

type EditCandidateModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only the id/name are needed from the caller -- the full `CandidateDbRow`
   * `CandidateProfileEditSection` requires is fetched below, mirroring the
   * same `/api/admin/candidates/[id]` + `campaignAppliedToCandidateDbRow`
   * pattern the global candidates dashboard's drawer already uses (see
   * `use-candidate-pipeline-state.ts`). This JD-pipeline table only has the
   * lighter `CampaignAppliedAdminRow` shape, so it can't be passed straight
   * through. */
  row: { id: string; name: string } | null;
  canEdit: boolean;
  onSaved: () => void;
};

export function EditCandidateModal({
  isOpen,
  onOpenChange,
  row,
  canEdit,
  onSaved,
}: EditCandidateModalProps) {
  const [dbRow, setDbRow] = useState<CandidateDbRow | null>(null);
  const [dbLoadState, setDbLoadState] = useState<"loading" | "error" | "ok">(
    "loading",
  );
  // The Modal keeps rendering for a bit after `isOpen` goes false (CSS exit
  // transition), and callers null out `row` in that same tick (closing this
  // modal clears their `rowPendingEdit` state). Rendering off the raw `row`
  // prop would blank the body mid-transition; sticking to the last non-null
  // value keeps the closing modal showing its last content instead of a
  // flash of empty space.
  const [displayRow, setDisplayRow] = useState(row);
  if (row && row !== displayRow) {
    setDisplayRow(row);
  }

  useEffect(() => {
    if (!isOpen || !row) return;
    const ac = new AbortController();
    setDbRow(null);
    setDbLoadState("loading");
    void (async () => {
      try {
        const res = await fetch(`/api/admin/candidates/${row.id}`, {
          credentials: "include",
          signal: ac.signal,
        });
        if (!res.ok) {
          if (!ac.signal.aborted) setDbLoadState("error");
          return;
        }
        const json = (await res.json()) as { candidate?: unknown };
        if (ac.signal.aborted || !json.candidate) {
          if (!ac.signal.aborted) setDbLoadState("error");
          return;
        }
        const c =
          json.candidate && typeof json.candidate === "object" && "candidate_id" in json.candidate
            ? campaignAppliedToCandidateDbRow(json.candidate as any)
            : (json.candidate as CandidateDbRow);
        setDbRow(c);
        setDbLoadState("ok");
      } catch {
        if (!ac.signal.aborted) setDbLoadState("error");
      }
    })();
    return () => ac.abort();
  }, [isOpen, row]);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4 bg-muted/10">
            <Modal.Heading className="text-lg font-bold text-foreground">
              {displayRow?.name ?? "Edit candidate"}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[75vh] overflow-y-auto p-0">
            {displayRow ? (
              dbLoadState === "error" ? (
                <p className="px-5 py-4 text-sm text-danger">
                  Could not load this candidate's details. Close and try again.
                </p>
              ) : (
                <CandidateProfileEditSection
                  candidateId={displayRow.id}
                  dbRow={dbRow}
                  canEdit={canEdit}
                  isPreview={false}
                  dbLoadState={dbLoadState}
                  onSaved={(saved) => {
                    // Feed the freshly-saved row back into local state
                    // immediately -- the auto-start effect inside
                    // `CandidateProfileEditSection` re-syncs its draft from
                    // `dbRow` right after a save, so without this it would
                    // re-populate the form from the *stale* pre-edit `dbRow`
                    // still sitting here until the modal is closed and
                    // reopened (which triggers a fresh refetch).
                    //
                    // `saved` is typed as `CandidateDbRow` but the
                    // `/profile` PATCH route actually responds with a
                    // `CampaignAppliedAdminRow` (candidate_name/candidate_role/...)
                    // whenever the pipeline stage wasn't also changed in the
                    // same save -- same shape ambiguity guarded against
                    // elsewhere (see `onProfileSaved` in
                    // candidate-pipeline-dashboard.tsx). Skipping this
                    // guard means every field read off `dbRow` afterwards
                    // (name/role/skills/...) comes back `undefined`.
                    const c =
                      saved && typeof saved === "object" && "candidate_id" in saved
                        ? campaignAppliedToCandidateDbRow(saved as any)
                        : saved;
                    setDbRow(c);
                    onSaved();
                  }}
                  onCancel={() => onOpenChange(false)}
                />
              )
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
