"use client";

import type { ReactNode } from "react";
import { useOverlayTriggerState } from "react-stately";

import { Button, Card, Modal } from "@heroui/react";

import type {
  DuplicateCandidateHit,
  DuplicateNewUploadPreview,
} from "@/lib/candidates/duplicate-detection";
import { formatDisplayDate } from "@/lib/format-date";

function dash(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "—";
  return String(v);
}

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function roleDiff(
  hit: DuplicateCandidateHit,
  newUpload: DuplicateNewUploadPreview,
): boolean {
  return norm(hit.parsedRole) !== norm(newUpload.parsedRole);
}

function emailDiff(
  hit: DuplicateCandidateHit,
  newUpload: DuplicateNewUploadPreview,
): boolean {
  return norm(hit.email) !== norm(newUpload.email);
}

function phoneDiff(
  hit: DuplicateCandidateHit,
  newUpload: DuplicateNewUploadPreview,
): boolean {
  return norm(hit.phone) !== norm(newUpload.phone);
}

function DiffNew({
  changed,
  children,
}: {
  changed: boolean;
  children: ReactNode;
}) {
  if (!changed) {
    return <>{children}</>;
  }
  return (
    <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200">
      {children}
    </span>
  );
}

function formatExistingApplied(iso: string | null): string {
  return formatDisplayDate(iso);
}

export function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2L1 21h22L12 2zm0 4.83L19.53 19H4.47L12 6.83zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
    </svg>
  );
}

export type DuplicateCandidateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hits: DuplicateCandidateHit[];
  newUpload: DuplicateNewUploadPreview;
  /** Total CVs currently queued on a dedupe hit, including this one -- shown
   * as a small note so closing this modal (see `onOpenChange`) doesn't lose
   * track of how many are still waiting. */
  pendingCount: number;
  currentJobTitle: string;
  isSubmitting: boolean;
  willMergeIntoExisting: boolean;
  onUpdateProfile: () => Promise<void>;
  onDiscard: () => Promise<void>;
};

export function DuplicateCandidateModal({
  open,
  onOpenChange,
  hits,
  newUpload,
  pendingCount,
  currentJobTitle,
  isSubmitting,
  willMergeIntoExisting,
  onUpdateProfile,
  onDiscard,
}: DuplicateCandidateModalProps) {
  const modalState = useOverlayTriggerState({
    isOpen: open,
    onOpenChange,
  });

  const primaryHit = hits[0];
  const displayName = primaryHit ? dash(primaryHit.name) : "—";
  const displayEmail = dash(newUpload.email ?? primaryHit?.email);
  const displayPhone = dash(newUpload.phone ?? primaryHit?.phone);

  const dRole = primaryHit ? roleDiff(primaryHit, newUpload) : false;
  const dEmail = primaryHit ? emailDiff(primaryHit, newUpload) : false;
  const dPhone = primaryHit ? phoneDiff(primaryHit, newUpload) : false;

  const handleUpdate = async () => {
    await onUpdateProfile();
  };

  const handleDiscard = async () => {
    await onDiscard();
  };

  return (
    <Modal state={modalState}>
      {/* No backdrop-blur here -- this modal always stacks on top of the
          already-blurred add-candidate-modal backdrop underneath. Blurring
          twice doubles the compositing cost of every repaint of the (hidden)
          upload queue table behind it, which is what caused the perceived
          UI stutter when this modal opened. */}
      <Modal.Backdrop className="z-[140] bg-black/45">
        <Modal.Container className="z-[140] w-full">
          <Modal.Dialog className="max-h-[92vh] w-full max-w-[640px] min-w-0 overflow-hidden rounded-2xl border border-default-200 bg-content1 p-0 shadow-xl">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider bg-muted/20 px-6 py-5">
              <div className="flex gap-4 pe-8">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                  <WarningIcon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <Modal.Heading className="text-lg font-bold text-foreground">
                    Duplicate Candidate Found
                  </Modal.Heading>
                  <p className="mt-1 text-sm text-muted">
                    This candidate is already in your database.{" "}
                    <span className="font-semibold text-amber-600 dark:text-amber-500">
                      Resolve it below, or close this and come back later.
                    </span>
                    {pendingCount > 1
                      ? ` (${pendingCount - 1} more CV${pendingCount - 1 === 1 ? "" : "s"} waiting after this one.)`
                      : ""}
                  </p>
                </div>
              </div>
            </Modal.Header>

            <Modal.Body className="space-y-5 px-6 py-5">
              {/* Candidate Info Summary */}
              <div className="rounded-xl bg-muted/25 px-4 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Full name
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {displayName}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Email address
                    </p>
                    <p className="mt-1 break-all text-sm font-medium text-foreground">
                      <DiffNew changed={dEmail}>{displayEmail}</DiffNew>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Phone number
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      <DiffNew changed={dPhone}>{displayPhone}</DiffNew>
                    </p>
                  </div>
                </div>
              </div>

              {/* Current Job Opening */}
              <div className="rounded-xl border border-divider p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Current Campaign
                </p>
                <div className="mt-2">
                  <p className="text-sm font-semibold text-foreground">
                    {currentJobTitle}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Expected role:{" "}
                    <DiffNew changed={dRole}>{dash(newUpload.parsedRole)}</DiffNew>
                  </p>
                </div>
              </div>

              {/* Previously Applied Campaigns */}
              <div className="rounded-xl border border-divider p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Previously Applied Campaigns
                </p>
                <div className="max-h-[160px] overflow-y-auto space-y-3 pr-1">
                  {hits.map((h) => (
                    <div
                      key={h.id}
                      className="flex justify-between items-center text-sm border-b border-divider/50 pb-2 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-semibold text-foreground">
                          {h.jobOpeningTitle || "Untitled campaign"}
                        </p>
                        <p className="text-xs text-muted">
                          Role: {dash(h.parsedRole)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex rounded-full bg-content2 px-2.5 py-0.5 text-xs font-medium text-foreground">
                          {h.status}
                        </span>
                        <p className="text-[10px] text-muted mt-0.5 font-variant-numeric: tabular-nums">
                          Applied date: {formatExistingApplied(h.cvUploadedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer className="border-t border-divider bg-muted/20 px-6 py-4">
              <div className="flex w-full flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="tertiary"
                  className="font-semibold text-danger hover:bg-danger/5"
                  onPress={() => void handleDiscard()}
                  isDisabled={isSubmitting}
                >
                  Discard
                </Button>
                <Button
                  variant="primary"
                  className="min-h-[52px] min-w-[220px] flex-col gap-0 rounded-xl bg-gradient-to-br from-[#002542] to-[#1b3b5a] py-2 font-bold text-white shadow-md"
                  onPress={() => void handleUpdate()}
                  isPending={isSubmitting}
                >
                  <span>Update CV</span>
                  <span className="text-xs font-normal opacity-95">
                    {willMergeIntoExisting
                      ? "Save as the latest version…"
                      : "Add as a new application for this campaign…"}
                  </span>
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
