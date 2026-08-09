import { Button, Modal } from "@heroui/react";

type ConfirmRunJdMatchModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  candidateCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmRunJdMatchModal({
  isOpen,
  onOpenChange,
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
              Run AI JD Match
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-5 py-4">
            <p className="text-sm text-muted">
              Run AI JD matching for{" "}
              <span className="font-semibold text-foreground">
                {candidateCount}
              </span>{" "}
              selected candidate{candidateCount === 1 ? "" : "s"}? This may
              take a while and will overwrite any existing match scores.
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
              {busy ? "Running…" : "Run match"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
