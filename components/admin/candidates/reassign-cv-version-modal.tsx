"use client";

import { useEffect, useState } from "react";

import { Button, Input, Label, Modal, TextField } from "@heroui/react";

import { useToast } from "@/components/admin/toast-provider";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReassignCvVersionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `campaign_applied` id this CV is currently (wrongly) attached to. */
  sourceCampaignAppliedId: string;
  /** Called after a successful reassign, before the modal closes.
   * `sourceApplicationDeleted` is true when the source application had no
   * CV of its own to roll back to and was deleted outright -- the caller
   * (rendering that now-gone application's own page) must navigate away
   * rather than just refresh in place. */
  onReassigned: (sourceApplicationDeleted: boolean) => void;
};

/**
 * Recovery tool for a CV that got auto-merged onto the wrong candidate --
 * e.g. AI parsing extracted a wrong-but-real email/phone that happened to
 * match someone else, so the upload dedupe silently merged this CV onto them
 * instead of the actual applicant. HR pastes the *correct* candidate's
 * application id (same job) from that candidate's own detail-page URL --
 * there's no search here by design, this is a rare, deliberate admin action.
 * See `lib/candidates/reassign-cv-version.ts` for what it actually does.
 */
export function ReassignCvVersionModal({
  open,
  onOpenChange,
  sourceCampaignAppliedId,
  onReassigned,
}: ReassignCvVersionModalProps) {
  const toast = useToast();
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetIdValid = UUID_RE.test(targetId.trim());

  // Cancelling and reopening (e.g. to fix a typo'd id) would otherwise show
  // the previous attempt's now-irrelevant error and stale field values.
  useEffect(() => {
    if (!open) {
      setTargetId("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!targetIdValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${sourceCampaignAppliedId}/reassign-cv-version`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetCampaignAppliedId: targetId.trim(),
            note: note.trim() || undefined,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        sourceApplicationDeleted?: boolean;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not reassign this CV.");
        return;
      }
      toast.success("CV reassigned to the correct candidate.");
      setTargetId("");
      setNote("");
      onReassigned(json.sourceApplicationDeleted === true);
      onOpenChange(false);
    } catch {
      setError("Could not reassign this CV.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal.Backdrop
      className="z-[140] bg-black/40 backdrop-blur-sm"
      isOpen={open}
      onOpenChange={onOpenChange}
    >
      <Modal.Container className="z-[140] w-full">
        <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
          <Modal.CloseTrigger isDisabled={busy} />
          <Modal.Header className="border-b border-divider px-6 py-5">
            <Modal.Heading>Reassign CV to another candidate</Modal.Heading>
            <p className="mt-1 text-sm text-muted">
              For when this CV got auto-merged onto the wrong candidate (e.g.
              AI parsing matched the wrong person&rsquo;s contact info).
              Moves it onto the correct candidate&rsquo;s application for the
              same job, and rolls this application back to its own previous
              CV.
            </p>
          </Modal.Header>

          <Modal.Body className="space-y-4 px-6 py-5">
            <TextField>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Correct candidate&rsquo;s application ID
              </Label>
              <Input
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="Paste from the correct candidate's page URL"
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted">
                Open the correct candidate&rsquo;s detail page for this same
                job and copy the id from the URL
                (/admin/candidate-detail/&lt;id&gt;).
              </p>
            </TextField>

            <TextField>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Note{" "}
                <span className="font-normal normal-case text-muted/70">
                  (optional)
                </span>
              </Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why this is being reassigned"
                className="mt-1.5"
              />
            </TextField>

            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </Modal.Body>

          <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
            <Button
              variant="secondary"
              onPress={() => onOpenChange(false)}
              isDisabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={() => void handleSubmit()}
              isPending={busy}
              isDisabled={!targetIdValid}
            >
              Reassign CV
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
