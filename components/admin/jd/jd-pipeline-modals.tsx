import { useCallback, useEffect, useState } from "react";
import { Button, Input, Label, Modal } from "@heroui/react";

import { CandidateProfileEditSection } from "@/components/admin/candidates/candidate-profile-edit-section";
import type { JdPipelineApplicationRow } from "@/lib/candidates/campaign-applied-table-row";
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

type EditCandidateModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Only the id/name are needed here -- `CandidateProfileEditSection` still
   * requires a full pre-DB7X2K `CandidateDbRow`, which this JD-pipeline table
   * no longer has (it's `CampaignAppliedAdminRow`-shaped now). Passes
   * `dbRow={null}` below, so the edit form itself stays non-functional until
   * the separately-deferred candidate-profile-dashboard slice rewires that
   * component onto the new schema -- not a regression introduced here, this
   * button was already broken (Supabase-based) before this slice.
   */
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
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4 bg-muted/10">
            <Modal.Heading className="text-lg font-bold text-foreground">
              {row?.name ?? "Edit candidate"}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[75vh] overflow-y-auto p-0">
            {row ? (
              <CandidateProfileEditSection
                candidateId={row.id}
                dbRow={null}
                canEdit={canEdit}
                isPreview={false}
                dbLoadState="ok"
                startInEditMode
                onSaved={onSaved}
              />
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
