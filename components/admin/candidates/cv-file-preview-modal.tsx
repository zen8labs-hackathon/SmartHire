"use client";

import { Modal } from "@heroui/react";

import { CvViewer } from "@/components/admin/candidates/cv-viewer";

export type CvPreviewTarget = {
  /** `campaign_applied.id` -- the application whose active CV is shown. */
  applicationId: string;
  candidateName: string;
  fileName: string | null;
};

type CvFilePreviewModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modal renders nothing while null. */
  target: CvPreviewTarget | null;
};

/**
 * Large modal previewing one application's active CV (PDF inline, DOCX
 * rendered client-side -- see `CvViewer`). The viewer only mounts while open,
 * so a closed modal costs no meta/download request.
 */
export function CvFilePreviewModal({
  isOpen,
  onOpenChange,
  target,
}: CvFilePreviewModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading className="text-lg font-bold text-foreground">
              CV — {target?.candidateName ?? ""}
            </Modal.Heading>
            {target?.fileName ? (
              <p className="mt-0.5 truncate text-xs font-medium text-muted">
                {target.fileName}
              </p>
            ) : null}
          </Modal.Header>
          <Modal.Body className="flex-1 overflow-hidden p-0">
            {isOpen && target ? (
              <CvViewer
                key={target.applicationId}
                cvUrl={`/api/admin/candidates/${encodeURIComponent(target.applicationId)}/cv-download`}
                title={`CV - ${target.candidateName}`}
                className="h-full w-full"
              />
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
