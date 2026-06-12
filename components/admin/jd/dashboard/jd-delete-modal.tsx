import React from "react";
import { Modal, Button } from "@heroui/react";
import { useJdDashboard } from "./context";

export function JdDeleteModal() {
  const { deleteModal, deleteError, confirmDelete } = useJdDashboard();

  return (
    <Modal.Backdrop
      className="bg-black/40 backdrop-blur-sm"
      isOpen={deleteModal.isOpen}
      onOpenChange={deleteModal.setOpen}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-sm overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-6 py-5">
            <Modal.Heading>Delete job description</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-6 py-5">
            <p className="text-sm text-muted">
              This action cannot be undone. The job description will be
              permanently removed.
            </p>
            {deleteError && (
              <p className="mt-3 text-sm text-danger">{deleteError}</p>
            )}
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
            <Button variant="secondary" onPress={deleteModal.close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-danger text-white hover:bg-danger/90"
              onPress={() => void confirmDelete()}
            >
              Delete
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
export default JdDeleteModal;
