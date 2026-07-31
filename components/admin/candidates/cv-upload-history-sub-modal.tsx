"use client";

import { useEffect, useState } from "react";
import { useOverlayTriggerState } from "react-stately";

import { Button, Modal, Spinner } from "@heroui/react";

import {
  PipelineStatusBadge,
  type PipelineStatusBadgeApplication,
} from "@/components/admin/candidates/pipeline-status-badge";
import { formatDisplayDateTime } from "@/lib/format-date";

type CandidateApplicationItem = PipelineStatusBadgeApplication & {
  id: string;
  jobTitle: string;
  jobId: string | null;
  cvUploadedAt: string | null;
};

export type CvUploadHistorySubModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `campaign_applied` row id used to resolve the person whose JDs to list. */
  applicationId: string | null;
};

/** Every JD this person's CV has been uploaded to, one row per JD (the
 * currently active `cv_detail_versions` row for that application), not a
 * per-JD version history. */
export function CvUploadHistorySubModal({
  open,
  onOpenChange,
  applicationId,
}: CvUploadHistorySubModalProps) {
  const modalState = useOverlayTriggerState({ isOpen: open, onOpenChange });

  const [applications, setApplications] = useState<CandidateApplicationItem[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/candidates/${applicationId}/applications`, {
      credentials: "include",
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          applications?: CandidateApplicationItem[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load CV upload history");
        }
        if (!cancelled) setApplications(json.applications ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load CV upload history",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, applicationId]);

  return (
    <Modal state={modalState}>
      {/* No backdrop-blur here -- this modal always stacks on top of the
          already-blurred add-candidate-modal backdrop underneath, same
          convention as duplicate-candidate-modal.tsx. */}
      <Modal.Backdrop className="z-[140] bg-black/45">
        <Modal.Container className="z-[140] w-full">
          <Modal.Dialog className="max-h-[85vh] w-full max-w-[640px] min-w-0 overflow-hidden rounded-2xl border border-default-200 bg-content1 p-0 shadow-xl">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider bg-muted/20 px-6 py-5">
              <Modal.Heading className="text-lg font-bold text-foreground">
                CV upload history
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="max-h-[60vh] overflow-y-auto px-6 py-5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : error ? (
                <p className="text-sm text-danger">{error}</p>
              ) : applications.length === 0 ? (
                <p className="text-sm text-muted">No JDs found.</p>
              ) : (
                <div className="space-y-3">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-divider p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {app.jobTitle}
                          </p>
                          {app.id === applicationId ? (
                            <span className="shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">
                              This upload
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          Uploaded {formatDisplayDateTime(app.cvUploadedAt)}
                        </p>
                      </div>
                      <PipelineStatusBadge
                        app={app}
                        hasJob={app.jobId != null}
                        className="shrink-0"
                      />
                    </div>
                  ))}
                </div>
              )}
            </Modal.Body>

            <Modal.Footer className="border-t border-divider bg-muted/20 px-6 py-4">
              <Button variant="secondary" onPress={() => onOpenChange(false)}>
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
