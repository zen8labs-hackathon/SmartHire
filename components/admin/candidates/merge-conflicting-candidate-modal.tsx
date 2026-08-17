"use client";

import Link from "next/link";

import { Button, Modal } from "@heroui/react";

import { PipelineStatusBadge } from "@/components/admin/candidates/pipeline-status-badge";
import type { ProfileEditConflict } from "@/lib/candidates/candidate-profile-patch";
import { formatDisplayDate } from "@/lib/format-date";

function matchedFieldsLabel(fields: ProfileEditConflict["matchedFields"]): string {
  return fields.join(" and ");
}

export type MergeConflictingCandidateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflict: ProfileEditConflict;
  isSubmitting: boolean;
  onMerge: () => Promise<void>;
  onCancel: () => void;
};

/**
 * Offered when `PATCH .../profile` 409s because the edited email/phone
 * matches exactly one other existing candidate -- lets HR confirm that's
 * genuinely the same person and merge this one application onto them,
 * instead of just showing a dead-end error. See
 * `lib/candidates/resolve-profile-conflict.ts` for what "merge" does here:
 * only the application currently being edited moves, not the candidate's
 * other applications.
 */
export function MergeConflictingCandidateModal({
  open,
  onOpenChange,
  conflict,
  isSubmitting,
  onMerge,
  onCancel,
}: MergeConflictingCandidateModalProps) {
  return (
    <Modal.Backdrop
      className="bg-black/40 backdrop-blur-sm"
      isOpen={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-6 py-5">
            <Modal.Heading>This candidate already exists</Modal.Heading>
            <p className="mt-1 text-sm text-muted">
              The email or phone number you entered matches an existing
              candidate&rsquo;s contact info.
            </p>
          </Modal.Header>

          <Modal.Body className="space-y-4 px-6 py-5">
            <div className="flex items-start gap-3 rounded-lg border-l-4 border-l-warning bg-warning/[0.04] px-4 py-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-warning/10 text-xs font-bold leading-none text-warning"
              >
                !
              </span>
              <div className="min-w-0 text-sm">
                <p className="text-foreground">
                  Matches{" "}
                  <span className="font-semibold">
                    {conflict.candidateName ?? "an existing candidate"}
                  </span>{" "}
                  on <span className="font-semibold">{matchedFieldsLabel(conflict.matchedFields)}</span>.
                </p>
                <p className="mt-1 text-muted">
                  If this is the same person, merging moves this application
                  onto their record. Otherwise, cancel and use different
                  contact info.
                </p>
              </div>
            </div>

            {conflict.applications.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Their applications
                </p>
                <ul className="max-h-[180px] space-y-2 overflow-y-auto">
                  {conflict.applications.map((a) => {
                    const rowContent = (
                      <>
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {a.jobTitle || "Unassigned"}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                          <PipelineStatusBadge app={a} hasJob={a.jobId != null} />
                          {formatDisplayDate(a.appliedAt)}
                        </span>
                      </>
                    );

                    // Unassigned/pool applications have no job, so there's no
                    // evaluation page to link to -- render as a plain, inert row.
                    if (a.jobId == null) {
                      return (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-divider px-3 py-2 text-sm"
                        >
                          {rowContent}
                        </li>
                      );
                    }

                    return (
                      <li key={a.id}>
                        <Link
                          href={`/admin/jd/${a.jobId}/pipeline/${a.id}/evaluation`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-3 rounded-lg border border-divider px-3 py-2 text-sm transition-colors hover:border-accent/40 hover:bg-muted/10"
                        >
                          {rowContent}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </Modal.Body>

          <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
            <Button
              variant="secondary"
              onPress={onCancel}
              isDisabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={() => void onMerge()}
              isPending={isSubmitting}
            >
              Merge candidates
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
