"use client";

import { useEffect, useState } from "react";
import { useOverlayTriggerState } from "react-stately";

import { Button, Modal } from "@heroui/react";

import type { CandidateDedupeMatch } from "@/lib/service/candidate.service";

function dash(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : "—";
}

const MATCH_LABEL: Record<CandidateDedupeMatch["matchedOn"], string> = {
  email: "Matches email",
  phone: "Matches phone",
  email_or_phone: "Matches email & phone",
};

const MATCH_TONE: Record<CandidateDedupeMatch["matchedOn"], string> = {
  email:
    "border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  phone: "border-sky-400/50 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  email_or_phone:
    "border-rose-400/60 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

/** `"profile-edit"` (default) is the `/candidate-detail` profile form editing
 * an already-existing candidate; `"new-candidate"` is the manual-entry form
 * creating one -- only the copy differs ("the current candidate" doesn't
 * make sense before that candidate exists). */
type ModalContext = "profile-edit" | "new-candidate";

const COPY: Record<
  ModalContext,
  { partialDescription: string; fullDescription: string; saveAnywayLabel: string }
> = {
  "profile-edit": {
    partialDescription:
      "Merge this candidate's CV into one of them, or save these details onto the current candidate anyway.",
    fullDescription:
      "The email and phone both belong to an existing candidate — merge this candidate's CV into it, or cancel.",
    saveAnywayLabel: "Save to current candidate",
  },
  "new-candidate": {
    partialDescription:
      "Merge this CV into one of them, or save it as a new candidate anyway.",
    fullDescription:
      "The email and phone both belong to an existing candidate — merge this CV into it, or cancel.",
    saveAnywayLabel: "Save as new candidate",
  },
};

export type MergeDuplicateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: CandidateDedupeMatch[];
  isSubmitting: boolean;
  /** False when there is no CV to fold into the picked match -- "Merge" is
   * then disabled with a note. */
  canMerge: boolean;
  /** Fold the pending CV into the picked match (which survives). */
  onMerge: (match: CandidateDedupeMatch) => void | Promise<void>;
  /** Save the pending candidate without merging. Omitted when a full (email
   * + phone) match exists -- then merge or cancel are the only options. */
  onSaveAnyway?: () => void | Promise<void>;
  /** @default "profile-edit" */
  context?: ModalContext;
};

export function MergeDuplicateModal({
  open,
  onOpenChange,
  matches,
  isSubmitting,
  canMerge,
  onMerge,
  onSaveAnyway,
  context = "profile-edit",
}: MergeDuplicateModalProps) {
  const modalState = useOverlayTriggerState({ isOpen: open, onOpenChange });
  const copy = COPY[context];

  const hasFullMatch = matches.some((m) => m.matchedOn === "email_or_phone");
  const canSaveAnyway = !hasFullMatch && onSaveAnyway != null;

  // No auto-select -- the user must pick a candidate before "Merge" appears.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);
  const selected = matches.find((m) => m.id === selectedId) ?? null;
  const mergeDisabled = isSubmitting || !canMerge;

  return (
    <Modal state={modalState}>
      <Modal.Backdrop className="z-[140] bg-black/45">
        <Modal.Container className="z-[140] w-full">
          <Modal.Dialog className="max-h-[92vh] w-full max-w-[600px] min-w-0 overflow-hidden rounded-2xl border border-default-200 bg-content1 p-0 shadow-xl">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider bg-muted/20 px-6 py-5">
              <Modal.Heading className="text-lg font-bold text-foreground">
                {matches.length === 1
                  ? "A matching candidate already exists"
                  : `${matches.length} matching candidates already exist`}
              </Modal.Heading>
              <p className="mt-1 text-xs text-muted">
                {hasFullMatch ? copy.fullDescription : copy.partialDescription}
              </p>
              {!canMerge ? (
                <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  This candidate has no CV on record, so there is nothing to
                  merge.
                </p>
              ) : null}
            </Modal.Header>

            <Modal.Body className="max-h-[52vh] space-y-2 overflow-y-auto px-6 py-5">
              {matches.map((m) => {
                const active = m.id === selectedId;
                return (
                  <div
                    key={m.id}
                    className={`flex w-full items-start gap-2 rounded-xl border px-3.5 py-3 transition ${
                      active
                        ? "border-accent/60 bg-accent/5 ring-1 ring-accent/40"
                        : "border-divider hover:border-default-300 hover:bg-muted/20"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span
                        className={`mt-1 size-3.5 shrink-0 rounded-full border ${
                          active
                            ? "border-accent bg-accent"
                            : "border-default-300"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {dash(m.name)}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MATCH_TONE[m.matchedOn]}`}
                          >
                            {MATCH_LABEL[m.matchedOn]}
                          </span>
                        </span>
                        <span className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
                          <span className="truncate">
                            Email: {dash(m.email)}
                          </span>
                          <span className="truncate">
                            Phone: {dash(m.phone)}
                          </span>
                        </span>
                      </span>
                    </button>
                    <a
                      href={`/admin/candidate-detail/${m.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${m.name?.trim() || "this candidate"} in a new tab`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-accent/50 bg-accent/10 px-2.5 py-1.5 text-xs font-bold text-accent transition hover:border-accent hover:bg-accent/20"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-3.5"
                        aria-hidden
                      >
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                        <path d="M21 14v7H3V3h7" />
                      </svg>
                      View profile
                    </a>
                  </div>
                );
              })}
            </Modal.Body>

            <Modal.Footer className="flex flex-wrap justify-end gap-2 border-t border-divider bg-muted/20 px-6 py-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg border border-divider text-xs font-semibold"
                isDisabled={isSubmitting}
                onPress={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {selected ? (
                <Button
                  variant={canSaveAnyway ? "secondary" : "primary"}
                  size="sm"
                  className={`h-9 rounded-lg border text-xs font-bold ${
                    canSaveAnyway ? "border-default-300" : "border-accent"
                  }`}
                  isDisabled={mergeDisabled}
                  isPending={isSubmitting}
                  onPress={() => void onMerge(selected)}
                >
                  Merge into {selected.name?.trim() || "selected"}
                </Button>
              ) : null}
              {canSaveAnyway ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="h-9 rounded-lg border border-accent text-xs font-semibold"
                  isDisabled={isSubmitting}
                  isPending={isSubmitting}
                  onPress={() => void onSaveAnyway?.()}
                >
                  {copy.saveAnywayLabel}
                </Button>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
