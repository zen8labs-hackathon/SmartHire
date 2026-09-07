"use client";

import { useRef, useState } from "react";
import { useOverlayTriggerState } from "react-stately";
import { Loader2 } from "lucide-react";

import { Button, Modal } from "@heroui/react";

import {
  ManualCandidateForm,
  type ManualCandidateFormHandle,
} from "@/components/admin/jd/manual-candidate-form";
import type { FileUploadRow } from "@/lib/db/upload-history";

type Props = {
  /** The Uploaded-files row to fill in by hand -- `null` keeps the modal
   * closed. Its `storage_key`/`file_name`/`mime_type` are reused as-is: no
   * new file pick, no re-upload. */
  row: FileUploadRow | null;
  jobTitle?: string;
  onClose: () => void;
  /** Called once the candidate has been saved -- the parent refetches its list. */
  onSaved: () => void;
};

/**
 * "Manual entry" action on an Uploaded-files row (typically one whose AI
 * parsing failed): opens the same `ManualCandidateForm` used by the
 * "Add candidates" modal, but pointed at the file this row already has in
 * S3 -- see `ExistingUploadFile` on that form for why no new upload happens.
 */
export function ManualEntryFromUploadModal({
  row,
  jobTitle,
  onClose,
  onSaved,
}: Props) {
  const formRef = useRef<ManualCandidateFormHandle>(null);
  const [busy, setBusy] = useState(false);

  const modalState = useOverlayTriggerState({
    isOpen: row != null,
    onOpenChange: (open) => {
      if (!open && !busy) onClose();
    },
  });

  return (
    <Modal state={modalState}>
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isDismissable={!busy}
        isKeyboardDismissDisabled={busy}
      >
        <Modal.Container className="w-full">
          <Modal.Dialog className="!max-w-3xl w-full min-w-0 overflow-hidden p-0">
            <Modal.CloseTrigger
              isDisabled={busy}
              aria-label={busy ? "Cannot close while busy" : "Close"}
            />
            <Modal.Header className="border-b border-divider px-6 py-4">
              <Modal.Heading className="text-xl">Manual entry</Modal.Heading>
              <p className="mt-1 text-sm text-muted">
                No AI parsing or JD-match runs for manual entries -- every field
                is used exactly as typed.
              </p>
            </Modal.Header>

            <Modal.Body className="h-[min(58vh,460px)] overflow-y-auto px-6 py-4">
              {row ? (
                <ManualCandidateForm
                  key={row.id}
                  ref={formRef}
                  jobId={row.job_id}
                  jobTitle={jobTitle}
                  existingFile={{
                    fileUploadId: row.id,
                    storageKey: row.storage_key,
                    fileName: row.file_name,
                    mimeType: row.mime_type,
                  }}
                  initialSource={row.file_source}
                  initialRecruiter={row.recruiter}
                  onSaved={() => {
                    onSaved();
                    onClose();
                  }}
                  onBusyChange={setBusy}
                />
              ) : null}
            </Modal.Body>

            <Modal.Footer className="justify-end gap-3 border-t border-divider px-6 py-4">
              <Button
                variant="secondary"
                className="cursor-pointer"
                isDisabled={busy}
                onPress={() => {
                  if (!busy) onClose();
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="cursor-pointer"
                isDisabled={busy}
                onPress={() => formRef.current?.submit()}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save candidate"
                )}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
