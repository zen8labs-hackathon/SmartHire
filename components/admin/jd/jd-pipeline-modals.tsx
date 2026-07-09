import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Label, Modal } from "@heroui/react";

import { CandidateProfileEditSection } from "@/components/admin/candidates/candidate-profile-edit-section";
import {
  type CandidateDbRow,
  candidateDbRowToTableRow,
} from "@/lib/candidates/db-row";

type OnboardingDatesModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onboardingDrafts: Record<string, string>;
  setOnboardingDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  dbRows: CandidateDbRow[];
  pipelineError: string | null;
  pipelineBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function OnboardingDatesModal({
  isOpen,
  onOpenChange,
  onboardingDrafts,
  setOnboardingDrafts,
  dbRows,
  pipelineError,
  pipelineBusy,
  onCancel,
  onConfirm,
}: OnboardingDatesModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-lg overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4">
            <Modal.Heading>Onboarding dates</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
            <p className="text-sm text-muted">
              Set the onboarding date and time for each selected candidate.
            </p>
            {Object.keys(onboardingDrafts).map((id) => {
              const row = dbRows.find((x) => x.id === id);
              const label = row
                ? candidateDbRowToTableRow(row).name
                : id.slice(0, 8);
              return (
                <div key={id} className="space-y-1">
                  <Label className="text-xs font-medium">{label}</Label>
                  <Input
                    type="datetime-local"
                    value={onboardingDrafts[id] ?? ""}
                    onChange={(e) =>
                      setOnboardingDrafts((d) => ({
                        ...d,
                        [id]: e.target.value,
                      }))
                    }
                    className="w-full"
                  />
                </div>
              );
            })}
            {pipelineError && isOpen ? (
              <p className="text-sm text-danger">{pipelineError}</p>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-5 py-4">
            <Button variant="secondary" onPress={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isDisabled={pipelineBusy}
              onPress={onConfirm}
            >
              Confirm
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

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
              Warning: This action is permanent and cannot be undone. It will
              remove the candidate from this JD campaign and delete their
              associated CV file.
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

type EditCandidateModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: CandidateDbRow | null;
  canEdit: boolean;
  onSaved: () => void;
};

export function EditCandidateModal({
  isOpen,
  onOpenChange,
  row,
  canEdit,
  onSaved,
}: EditCandidateModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4 bg-muted/10">
            <Modal.Heading className="text-lg font-bold text-foreground">
              {row ? candidateDbRowToTableRow(row).name : "Edit candidate"}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[75vh] overflow-y-auto p-0">
            {row ? (
              <CandidateProfileEditSection
                candidateId={row.id}
                dbRow={row}
                canEdit={canEdit}
                isPreview={false}
                dbLoadState="ok"
                startInEditMode
                onSaved={onSaved}
              />
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
