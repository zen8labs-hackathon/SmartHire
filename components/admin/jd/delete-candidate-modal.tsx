import { Button, Modal } from "@heroui/react";

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
              This will remove the candidate from this JD campaign. Their
              application and CV file are kept on record and won&apos;t
              appear in search or reporting anymore. If this candidate has
              applications to other jobs, those are left untouched.
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
