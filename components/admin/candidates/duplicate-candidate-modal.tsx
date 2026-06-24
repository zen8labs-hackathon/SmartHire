"use client";

import { useState, type ReactNode } from "react";
import { useOverlayTriggerState } from "react-stately";

import { Button, Card, Modal } from "@heroui/react";

import type {
  DuplicateCandidateHit,
  DuplicateNewUploadPreview,
} from "@/lib/candidates/duplicate-detection";

function dash(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "—";
  return String(v);
}

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

function roleDiff(hit: DuplicateCandidateHit, newUpload: DuplicateNewUploadPreview): boolean {
  return norm(hit.parsedRole) !== norm(newUpload.parsedRole);
}

function emailDiff(hit: DuplicateCandidateHit, newUpload: DuplicateNewUploadPreview): boolean {
  return norm(hit.email) !== norm(newUpload.email);
}

function phoneDiff(hit: DuplicateCandidateHit, newUpload: DuplicateNewUploadPreview): boolean {
  return norm(hit.phone) !== norm(newUpload.phone);
}

function DiffNew({
  changed,
  children,
}: {
  changed: boolean;
  children: ReactNode;
}) {
  if (!changed) {
    return <>{children}</>;
  }
  return (
    <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200">
      {children}
    </span>
  );
}

function formatExistingApplied(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
}

function formatNewApplied(iso: string | null): string {
  if (!iso) return "Just now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  if (Date.now() - d.getTime() < 120_000) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 2L1 21h22L12 2zm0 4.83L19.53 19H4.47L12 6.83zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
    </svg>
  );
}

function UploadDocIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
      <path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function SwapArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden
    >
      <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" />
    </svg>
  );
}

export type DuplicateCandidateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hit: DuplicateCandidateHit;
  newUpload: DuplicateNewUploadPreview;
  isSubmitting: boolean;
  onUpdateProfile: () => Promise<void>;
  onCreateNew: () => void;
};

export function DuplicateCandidateModal({
  open,
  onOpenChange,
  hit,
  newUpload,
  isSubmitting,
  onUpdateProfile,
  onCreateNew,
}: DuplicateCandidateModalProps) {
  const modalState = useOverlayTriggerState({
    isOpen: open,
    onOpenChange,
  });

  const [replaceError, setReplaceError] = useState<string | null>(null);

  const displayName = dash(hit.name);
  const displayEmail = dash(newUpload.email ?? hit.email);
  const displayPhone = dash(newUpload.phone ?? hit.phone);

  const dRole = roleDiff(hit, newUpload);
  const dEmail = emailDiff(hit, newUpload);
  const dPhone = phoneDiff(hit, newUpload);

  const handleUpdate = async () => {
    setReplaceError(null);
    try {
      await onUpdateProfile();
    } catch (e) {
      setReplaceError(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <Modal state={modalState}>
      <Modal.Backdrop
        isDismissable={false}
        className="z-[140] bg-black/45 backdrop-blur-sm"
      >
        <Modal.Container className="z-[140] w-full">
          <Modal.Dialog className="max-h-[92vh] w-full max-w-[640px] min-w-0 overflow-hidden rounded-2xl border border-default-200 bg-content1 p-0 shadow-xl">
            <Modal.Header className="border-b border-divider bg-muted/20 px-6 py-5">
              <div className="flex gap-4 pe-8">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                  <WarningIcon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <Modal.Heading className="text-lg font-bold text-foreground">
                    Duplicate Candidate Found
                  </Modal.Heading>
                  <p className="mt-1 text-sm text-muted">
                    This candidate is already in your database.{" "}
                    <span className="font-semibold text-amber-600 dark:text-amber-500">
                      You must select one of the options below to proceed.
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
                      {displayName}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Email address
                    </p>
                    <p className="mt-1 break-all text-sm font-medium text-foreground">
                      <DiffNew changed={dEmail}>{displayEmail}</DiffNew>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Phone number
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      <DiffNew changed={dPhone}>{displayPhone}</DiffNew>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
                <Card className="min-w-0 flex-1 border border-divider shadow-none">
                  <Card.Content className="gap-3 p-4">
                    <div className="flex items-center gap-2">
                      <UploadDocIcon className="h-5 w-5 shrink-0 text-accent" />
                      <span className="font-bold text-foreground">New Upload</span>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Role intent</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        <DiffNew changed={dRole}>
                          {dash(newUpload.parsedRole)}
                        </DiffNew>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Applied</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {formatNewApplied(newUpload.cvUploadedAt)}
                      </p>
                    </div>
                  </Card.Content>
                </Card>

                <div
                  className="flex justify-center md:flex-col md:items-center md:py-0"
                  aria-hidden
                >
                  <SwapArrowIcon className="h-6 w-6 rotate-90 text-muted md:rotate-0" />
                </div>

                <Card className="min-w-0 flex-1 border border-divider shadow-none">
                  <Card.Content className="gap-3 p-4">
                    <div className="flex items-center gap-2">
                      <DatabaseIcon className="h-5 w-5 shrink-0 text-success" />
                      <span className="font-bold text-foreground">
                        Existing Record
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Current role</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {dash(hit.parsedRole)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Last applied</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {formatExistingApplied(hit.cvUploadedAt)}
                      </p>
                    </div>
                  </Card.Content>
                </Card>
              </div>

              {replaceError ? (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {replaceError}
                </p>
              ) : null}
            </Modal.Body>

            <Modal.Footer className="border-t border-divider bg-muted/20 px-6 py-4">
              <div className="flex w-full flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="tertiary"
                  className="font-semibold text-foreground"
                  onPress={onCreateNew}
                  isDisabled={isSubmitting}
                >
                  Create New Entry
                </Button>
                <Button
                  variant="primary"
                  className="min-h-[52px] min-w-[220px] flex-col gap-0 rounded-xl bg-gradient-to-br from-[#002542] to-[#1b3b5a] py-2 font-bold text-white shadow-md"
                  onPress={() => void handleUpdate()}
                  isPending={isSubmitting}
                >
                  <span>Update Profile</span>
                  <span className="text-xs font-normal opacity-95">
                    Create a new history version
                  </span>
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
