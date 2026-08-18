import { useEffect, useState } from "react";
import { Modal } from "@heroui/react";

import { CandidateProfileEditSection } from "@/components/admin/candidates/candidate-profile-edit-section";
import {
  type CandidateDbRow,
  campaignAppliedToCandidateDbRow,
} from "@/lib/candidates/db-row";

type EditCandidateModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only the id/name are needed from the caller -- the full `CandidateDbRow`
   * `CandidateProfileEditSection` requires is fetched below, mirroring the
   * same `/api/admin/candidates/[id]` + `campaignAppliedToCandidateDbRow`
   * pattern the global candidates dashboard's drawer already uses (see
   * `use-candidate-pipeline-state.ts`). This JD-pipeline table only has the
   * lighter `CampaignAppliedAdminRow` shape, so it can't be passed straight
   * through. */
  row: { id: string; name: string } | null;
  canEdit: boolean;
  onSaved: () => void;
  /** Forwarded to `CandidateProfileEditSection` -- see its docstring. Called
   * instead of `onSaved` when a profile-edit conflict was resolved by
   * merging into a *different* candidate's application (so `row.id` no
   * longer refers to a live application -- the caller must navigate rather
   * than just refresh in place). Falls back to `onSaved` when omitted. */
  onCandidateIdChanged?: (
    newCampaignAppliedId: string,
    candidate: CandidateDbRow,
  ) => void;
  /** Forwarded to `CandidateProfileEditSection` -- see its docstring. */
  hidePipelineAndSource?: boolean;
};

export function EditCandidateModal({
  isOpen,
  onOpenChange,
  row,
  canEdit,
  onSaved,
  onCandidateIdChanged,
  hidePipelineAndSource,
}: EditCandidateModalProps) {
  const [dbRow, setDbRow] = useState<CandidateDbRow | null>(null);
  const [dbLoadState, setDbLoadState] = useState<"loading" | "error" | "ok">(
    "loading",
  );
  const [canEditSalary, setCanEditSalary] = useState(false);

  useEffect(() => {
    if (!isOpen || !row) {
      return;
    }
    const ac = new AbortController();
    setDbRow(null);
    setDbLoadState("loading");
    setCanEditSalary(false);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/candidates/${row.id}`, {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) {
          if (!ac.signal.aborted) setDbLoadState("error");
          return;
        }
        const json = (await res.json()) as {
          candidate?: unknown;
          canViewSalary?: boolean;
        };
        if (ac.signal.aborted || !json.candidate) {
          if (!ac.signal.aborted) setDbLoadState("error");
          return;
        }
        const c =
          json.candidate && typeof json.candidate === "object" && "candidate_id" in json.candidate
            ? campaignAppliedToCandidateDbRow(json.candidate as any)
            : (json.candidate as CandidateDbRow);
        setDbRow(c);
        setCanEditSalary(json.canViewSalary === true);
        setDbLoadState("ok");
      } catch {
        if (!ac.signal.aborted) setDbLoadState("error");
      }
    })();
    return () => ac.abort();
  }, [isOpen, row]);

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-2xl overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-5 py-4 bg-muted/10">
            <Modal.Heading className="text-lg font-bold text-foreground">
              {row?.name ?? "Edit candidate"}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="max-h-[75vh] overflow-y-auto p-0">
            {row ? (
              dbLoadState === "error" ? (
                <p className="px-5 py-4 text-sm text-danger">
                  Could not load this candidate's details. Close and try again.
                </p>
              ) : (
                <CandidateProfileEditSection
                  candidateId={row.id}
                  dbRow={dbRow}
                  canEdit={canEdit}
                  canEditSalary={canEditSalary}
                  isPreview={false}
                  dbLoadState={dbLoadState}
                  startInEditMode
                  onSaved={onSaved}
                  onCandidateIdChanged={onCandidateIdChanged ?? (() => onSaved())}
                  hidePipelineAndSource={hidePipelineAndSource}
                  onCancel={() => onOpenChange(false)}
                />
              )
            ) : null}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
