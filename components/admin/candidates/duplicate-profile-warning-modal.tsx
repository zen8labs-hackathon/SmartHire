"use client";

import { useOverlayTriggerState } from "react-stately";

import { Button, Modal } from "@heroui/react";

import type { DuplicateProfileMatch } from "@/lib/candidates/duplicate-detection";
import { WarningIcon } from "@/components/admin/candidates/duplicate-candidate-modal";

function dash(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "—";
  return String(v);
}

export type DuplicateProfileWarningModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: DuplicateProfileMatch[];
  isSubmitting: boolean;
  onMerge: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
};

export function DuplicateProfileWarningModal({
  open,
  onOpenChange,
  matches,
  isSubmitting,
  onMerge,
  onDiscard,
  onCancel,
}: DuplicateProfileWarningModalProps) {
  const modalState = useOverlayTriggerState({
    isOpen: open,
    onOpenChange: (isOpen) => {
      if (!isOpen) onCancel();
    },
  });

  const primary = matches[0];
  if (!primary) return null;

  return (
    <Modal state={modalState}>
      <Modal.Backdrop className="z-[140] bg-black/45">
        <Modal.Container className="z-[140] w-full">
          <Modal.Dialog className="max-h-[92vh] w-full max-w-[560px] min-w-0 overflow-hidden rounded-2xl border border-default-200 bg-content1 p-0 shadow-xl">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider bg-muted/20 px-6 py-5">
              <div className="flex gap-4 pe-8">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                  <WarningIcon className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <Modal.Heading className="text-lg font-bold text-foreground">
                    Duplicate Candidate Found
                  </Modal.Heading>
                  <p className="mt-1 text-sm text-muted">
                    These details now match an existing candidate already in
                    your database.{" "}
                    <span className="font-semibold text-amber-600 dark:text-amber-500">
                      Merge into that candidate, or discard this edit.
                    </span>
                  </p>
                </div>
              </div>
            </Modal.Header>

            <Modal.Body className="space-y-5 px-6 py-5">
              <div className="rounded-xl bg-muted/25 px-4 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Full name
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {dash(primary.name)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Email address
                    </p>
                    <p className="mt-1 break-all text-sm font-medium text-foreground">
                      {dash(primary.email)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Phone number
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {dash(primary.phone)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-divider p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Already applied to
                </p>
                <div className="max-h-[160px] space-y-3 overflow-y-auto pr-1">
                  {matches.map((m) => (
                    <div
                      key={m.campaignAppliedId}
                      className="flex items-center justify-between border-b border-divider/50 pb-2 text-sm last:border-0 last:pb-0"
                    >
                      <p className="font-semibold text-foreground">
                        {m.jobOpeningTitle || "Untitled campaign"}
                      </p>
                      <span className="inline-flex rounded-full bg-content2 px-2.5 py-0.5 text-xs font-medium text-foreground">
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer className="border-t border-divider bg-muted/20 px-6 py-4">
              <div className="flex w-full flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="secondary"
                  onPress={onCancel}
                  isDisabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="tertiary"
                  className="font-semibold text-danger hover:bg-danger/5"
                  onPress={onDiscard}
                  isDisabled={isSubmitting}
                >
                  Discard changes
                </Button>
                <Button
                  variant="primary"
                  className="min-h-[44px] min-w-[200px] rounded-xl bg-gradient-to-br from-[#002542] to-[#1b3b5a] font-bold text-white shadow-md"
                  onPress={() => void onMerge()}
                  isPending={isSubmitting}
                >
                  Merge candidate
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
