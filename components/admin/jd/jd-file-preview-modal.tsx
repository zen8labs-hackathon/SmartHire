"use client";

import { Modal } from "@heroui/react";

type JdFilePreviewModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Job whose JD file to preview. Modal renders nothing while null. */
  jobId: string | null;
};

/** Previews a job's JD file inline via the browser's PDF viewer instead of
 * opening `jd-download` in a new tab. */
export function JdFilePreviewModal({
  isOpen,
  onOpenChange,
  jobId,
}: JdFilePreviewModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading className="text-lg font-bold text-foreground">
              JD file
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex-1 overflow-hidden p-0">
            {jobId ? (
              <iframe
                src={`/api/admin/job-descriptions/${jobId}/jd-download`}
                title="JD file preview"
                className="h-full w-full"
              />
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
