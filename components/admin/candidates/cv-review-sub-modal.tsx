"use client";

import { useState } from "react";
import { useOverlayTriggerState } from "react-stately";

import { Button, Input, Label, Modal, TextField } from "@heroui/react";

import type {
  DuplicateCandidateHit,
  DuplicateNewUploadPreview,
} from "@/lib/candidates/duplicate-detection";

export type CvReviewConfirmResult = {
  campaignAppliedId: string;
  cvVersionId: string;
  runJdMatch: boolean;
};

export type CvReviewSubModalProps = {
  open: boolean;
  tempKey: string;
  filename: string;
  mimeType: string | null;
  prefillName: string | null;
  prefillEmail: string | null;
  prefillPhone: string | null;
  jobId: string;
  source: string;
  sourceOther: string | null;
  expectedSalary: string | null;
  onConfirmed: (result: CvReviewConfirmResult) => void;
  /** A confirm (or blur re-check) found a duplicate -- hands off to the
   * parent, which owns the "Update CV" (bypass + merge) / "Discard" decision
   * via `DuplicateCandidateModal`, since no row exists yet for this sub-modal
   * to act on further. `email`/`phone` are the values in effect at the time
   * of the hit, so the parent can bypass-confirm with the same values. */
  onDuplicateFound: (
    hits: DuplicateCandidateHit[],
    newUpload: DuplicateNewUploadPreview | null,
    email: string | null,
    phone: string | null,
  ) => void;
  onDiscard: () => void;
  onCancel: () => void;
};

async function checkDuplicateOnBlur(
  jobId: string,
  email: string | null,
  phone: string | null,
): Promise<{
  duplicateCandidates: DuplicateCandidateHit[];
  duplicateNewUpload: DuplicateNewUploadPreview | null;
} | null> {
  if (!email && !phone) return null;
  try {
    const res = await fetch("/api/admin/candidates/check-duplicate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobOpeningId: jobId, email, phone }),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      duplicateCandidates: DuplicateCandidateHit[];
      duplicateNewUpload: DuplicateNewUploadPreview | null;
    };
  } catch {
    return null;
  }
}

/**
 * Per-row review step for a temp-uploaded CV (CV9X7R Phase 4): PDF preview
 * against the temp key + an editable email/phone form prefilled from a fast
 * heuristic, confirmed via `POST .../temp-upload/confirm` -- which is the
 * point a `campaign_applied` row (and AI parsing eligibility) is actually
 * created. Editing email/phone re-checks for duplicates on blur so a
 * conflict surfaces before the user even presses Confirm.
 */
export function CvReviewSubModal({
  open,
  tempKey,
  filename,
  mimeType,
  prefillName,
  prefillEmail,
  prefillPhone,
  jobId,
  source,
  sourceOther,
  expectedSalary,
  onConfirmed,
  onDuplicateFound,
  onDiscard,
  onCancel,
}: CvReviewSubModalProps) {
  const modalState = useOverlayTriggerState({ isOpen: open, onOpenChange: () => {} });

  const [name, setName] = useState(prefillName ?? "");
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [phone, setPhone] = useState(prefillPhone ?? "");
  const [runJdMatch, setRunJdMatch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = `/api/admin/candidates/temp-upload/preview?key=${encodeURIComponent(tempKey)}`;

  const runConfirm = async () => {
    const effectiveEmail = email.trim() || null;
    const effectivePhone = phone.trim() || null;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/candidates/temp-upload/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempKey,
          filename,
          mimeType,
          jobId,
          source,
          sourceOther,
          expectedSalary,
          email: effectiveEmail,
          phone: effectivePhone,
          name: name.trim() || null,
          basicInfoReviewed: true,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        campaignAppliedId?: string;
        cvVersionId?: string;
        duplicateCandidates?: DuplicateCandidateHit[];
        duplicateNewUpload?: DuplicateNewUploadPreview | null;
      };
      if (res.status === 409) {
        onDuplicateFound(
          json.duplicateCandidates ?? [],
          json.duplicateNewUpload ?? null,
          effectiveEmail,
          effectivePhone,
        );
        return;
      }
      if (!res.ok || !json.campaignAppliedId || !json.cvVersionId) {
        throw new Error(json.error ?? "Could not confirm this upload.");
      }
      onConfirmed({
        campaignAppliedId: json.campaignAppliedId,
        cvVersionId: json.cvVersionId,
        runJdMatch,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm this upload.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBlur = async () => {
    const effectiveEmail = email.trim() || null;
    const effectivePhone = phone.trim() || null;
    const result = await checkDuplicateOnBlur(jobId, effectiveEmail, effectivePhone);
    if (result && result.duplicateCandidates.length > 0) {
      onDuplicateFound(
        result.duplicateCandidates,
        result.duplicateNewUpload,
        effectiveEmail,
        effectivePhone,
      );
    }
  };

  return (
    <Modal state={modalState}>
      <Modal.Backdrop isDismissable={false} className="z-[130] bg-black/45 backdrop-blur-sm">
        <Modal.Container className="z-[130] w-full">
          <Modal.Dialog className="max-h-[92vh] w-full max-w-[900px] min-w-0 overflow-hidden rounded-2xl border border-default-200 bg-content1 p-0 shadow-xl">
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading className="text-lg font-bold text-foreground">
                Review {filename}
              </Modal.Heading>
              <p className="mt-1 text-sm text-muted">
                Confirm the basic info fields before this candidate is saved and AI parsing
                starts.
              </p>
            </Modal.Header>

            <Modal.Body className="flex max-h-[min(72vh,760px)] gap-6 overflow-y-auto px-6 py-5">
              <div className="w-1/2 shrink-0">
                <iframe
                  src={previewUrl}
                  title={`Preview - ${filename}`}
                  className="h-full min-h-[420px] w-full rounded-xl border border-divider bg-surface-secondary/40 shadow-sm"
                />
              </div>

              <div className="flex flex-1 min-w-0 flex-col gap-4">
                <TextField>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Full name
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyen Van A"
                    className="mt-2"
                  />
                </TextField>

                <div className="grid grid-cols-2 gap-4">
                  <TextField>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Email
                    </Label>
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => void handleBlur()}
                      placeholder="candidate@example.com"
                      className="mt-2"
                    />
                  </TextField>

                  <TextField>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Phone
                    </Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={() => void handleBlur()}
                      placeholder="0912345678"
                      className="mt-2"
                    />
                  </TextField>
                </div>

                <p className="text-xs text-muted">
                  Name/email/phone are prefilled from a quick automatic scan — check them
                  against the preview and correct anything wrong. Once confirmed, these three
                  fields are kept as-is even if AI parsing later disagrees.
                </p>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-divider accent-accent cursor-pointer"
                    checked={runJdMatch}
                    onChange={(e) => setRunJdMatch(e.target.checked)}
                  />
                  Run AI JD-match scoring now
                </label>

                {error ? (
                  <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            </Modal.Body>

            <Modal.Footer className="border-t border-divider px-6 py-4">
              <div className="flex w-full items-center justify-between">
                <Button
                  variant="tertiary"
                  className="font-semibold text-danger hover:bg-danger/5"
                  onPress={onDiscard}
                  isDisabled={isSubmitting}
                >
                  Discard
                </Button>
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    onPress={onCancel}
                    isDisabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onPress={() => void runConfirm()}
                    isPending={isSubmitting}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
