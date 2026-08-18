import { Button, Modal } from "@heroui/react";

type ConfirmRunJdMatchModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  candidateCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmBulkPipelineActionModal({
  isOpen,
  onOpenChange,
  title = "Run AI JD Match",
  description = "Run AI JD matching",
  confirmLabel = "Run match",
  candidateCount,
  busy,
  onCancel,
  onConfirm,
}: ConfirmRunJdMatchModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading className="text-lg font-bold text-foreground">
              {title}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-5 py-4">
            <p className="text-sm text-muted">
              {description} for{" "}
              <span className="font-semibold text-foreground">
                {candidateCount}
              </span>{" "}
              selected candidate{candidateCount === 1 ? "" : "s"}?
            </p>
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
            <Button variant="secondary" onPress={onCancel} isDisabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-accent text-accent-foreground"
              isDisabled={busy}
              onPress={onConfirm}
            >
              {busy ? "Processing…" : confirmLabel}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
