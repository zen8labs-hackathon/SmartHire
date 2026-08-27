"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";

import {
  campaignAppliedToCandidateDbRow,
  type CandidateDbRow,
} from "@/lib/candidates/db-row";
import type { CampaignAppliedAdminRow } from "@/lib/db/campaign-applied-list";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";
import {
  type CandidateProfileFormSnapshot,
  type ProfileEditConflict,
  diffProfileSnapshotsToPatch,
} from "@/lib/candidates/candidate-profile-patch";
import { MergeConflictingCandidateModal } from "@/components/admin/candidates/merge-conflicting-candidate-modal";
import { useToast } from "@/components/admin/toast-provider";
import {
  CANDIDATE_SOURCE_VALUES,
  isCandidateSource,
} from "@/lib/candidates/source-constants";
import { PROFILE_CHANGE_SUMMARY_MAX } from "@/lib/candidates/candidate-profile-patch";
import {
  resolveCandidatePipelineIds,
  type StageMapping,
  type SubStage,
} from "@/lib/pipelines/transition-validator";
import {
  allowedStageTargets,
  stageSubStageOptionKey,
} from "@/lib/pipelines/jd-pipeline-row-helpers";
import { getSubStageTextColorClass } from "@/lib/candidates/pipeline-status-styles";

export type CandidateProfileEditSectionProps = {
  candidateId: string;
  dbRow: CandidateDbRow | null;
  canEdit: boolean;
  /** Show/edit expected salary (HR or chapter head on this job). */
  canEditSalary?: boolean;
  isPreview: boolean;
  dbLoadState: "loading" | "error" | "ok";
  onSaved: (candidate: CandidateDbRow) => void;
  /**
   * Called instead of `onSaved` when a profile-edit conflict was resolved by
   * merging into another candidate's application (see
   * `resolve-profile-conflict`) *and* that merge folded this application
   * into a different, pre-existing `campaign_applied` row -- i.e. the id
   * this section was opened with no longer refers to anything. Callers that
   * key navigation off `candidateId` (a campaign_applied id) need to know to
   * redirect. Falls back to `onSaved` when omitted.
   */
  onCandidateIdChanged?: (
    newCampaignAppliedId: string,
    candidate: CandidateDbRow,
  ) => void;
  /**
   * When false, a single-match profile-edit conflict is surfaced as a plain
   * dead-end error (same as the "2+ candidates matched" case) instead of
   * offering `MergeConflictingCandidateModal`. Defaults to true. Used to
   * keep this destructive, cross-candidate action out of contexts where it
   * shouldn't be triggerable, e.g. the plain candidate-detail page.
   */
  allowProfileConflictMerge?: boolean;
  /** When true, the form opens directly in edit mode instead of the read-only "Edit details" button. */
  startInEditMode?: boolean;
  /**
   * When true, hides the "Sourced from" field. Combine with
   * {@link hidePipeline}, or use {@link hidePipelineAndSource} to hide both.
   */
  hideSource?: boolean;
  /**
   * When true, hides the "Pipeline stage" field and skips fetching pipeline
   * config. Pipeline position is already a badge on the evaluation page and
   * is edited from the JD pipeline table.
   */
  hidePipeline?: boolean;
  /**
   * Shorthand for hideSource + hidePipeline. Used on /admin/candidates and
   * /admin/candidate-detail, where those are managed elsewhere (the JD
   * pipeline table/kanban still edits them here).
   */
  hidePipelineAndSource?: boolean;
  onCancel?: () => void;
  /**
   * Drop Card chrome + sticky Save/Cancel footer so a parent (e.g. candidate
   * detail) can own the Save button. Pair with `startInEditMode`,
   * `onDirtyChange`, and `saveActionRef`.
   */
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Parent calls this to trigger the same save path as the built-in Save button. */
  saveActionRef?: MutableRefObject<(() => void) | null>;
};

const FIELD_LABEL =
  "text-[10px] font-medium uppercase tracking-wider text-muted/70";

type Draft = {
  name: string;
  role: string;
  experienceYearsStr: string;
  skills: string[];
  degree: string;
  school: string;
  source: string;
  sourceOther: string;
  email: string;
  phone: string;
  expectedSalary: string;
};

function skillsFromComma(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function snapshotFromDraft(d: Draft): CandidateProfileFormSnapshot {
  const raw = Number(d.experienceYearsStr);
  const experienceYears = Number.isFinite(raw)
    ? Math.min(80, Math.max(0, Math.round(raw)))
    : 0;
  const src = isCandidateSource(d.source) ? d.source : "Other";
  return {
    name: d.name,
    role: d.role,
    experienceYears,
    skills: [...d.skills],
    degree: d.degree,
    school: d.school,
    source: src,
    sourceOther: d.sourceOther,
    email: d.email,
    phone: d.phone,
    expectedSalary: d.expectedSalary,
  };
}

function snapshotFromDb(db: CandidateDbRow): CandidateProfileFormSnapshot {
  const p = normalizeParsedResume(db.parsed_payload);
  const skills =
    db.skills && db.skills.length > 0 ? [...db.skills] : [...p.skills];
  const expRaw = db.experience_years;
  let experienceYears = 0;
  if (typeof expRaw === "number" && Number.isFinite(expRaw)) {
    experienceYears = Math.min(80, Math.max(0, Math.round(expRaw)));
  } else if (typeof expRaw === "string" && expRaw.trim() !== "") {
    const n = Number(expRaw);
    if (Number.isFinite(n))
      experienceYears = Math.min(80, Math.max(0, Math.round(n)));
  } else if (p.experienceYears != null) {
    experienceYears = Math.min(80, Math.max(0, Math.round(p.experienceYears)));
  }
  const name = db.name?.trim() || p.name?.trim() || "";
  const role = db.role?.trim() || p.role?.trim() || "";
  const degree = db.degree?.trim() || p.degree?.trim() || "";
  const school = db.school?.trim() || p.school?.trim() || "";
  const rawSource = db.source ?? "Other";
  const source = isCandidateSource(rawSource) ? rawSource : "Other";
  return {
    name,
    role,
    experienceYears,
    skills,
    degree,
    school,
    source,
    sourceOther: db.source_other?.trim() || "",
    email: p.email?.trim() || "",
    phone: p.phone?.trim() || "",
    expectedSalary: db.expected_salary?.trim() || "",
  };
}

function draftFromSnapshot(s: CandidateProfileFormSnapshot): Draft {
  return {
    name: s.name,
    role: s.role,
    experienceYearsStr: String(s.experienceYears),
    skills: [...s.skills],
    degree: s.degree,
    school: s.school,
    source: s.source,
    sourceOther: s.sourceOther,
    email: s.email,
    phone: s.phone,
    expectedSalary: s.expectedSalary,
  };
}

export function CandidateProfileEditSection({
  candidateId,
  dbRow,
  canEdit,
  canEditSalary = false,
  isPreview,
  dbLoadState,
  onSaved,
  onCandidateIdChanged,
  allowProfileConflictMerge = true,
  startInEditMode = false,
  hideSource = false,
  hidePipeline = false,
  hidePipelineAndSource = false,
  onCancel,
  embedded = false,
  onDirtyChange,
  onBusyChange,
  saveActionRef,
}: CandidateProfileEditSectionProps) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [baseline, setBaseline] = useState<CandidateProfileFormSnapshot | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(() => ({
    name: "",
    role: "",
    experienceYearsStr: "0",
    skills: [],
    degree: "",
    school: "",
    source: CANDIDATE_SOURCE_VALUES[0],
    sourceOther: "",
    email: "",
    phone: "",
    expectedSalary: "",
  }));
  const [skillInput, setSkillInput] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ProfileEditConflict | null>(null);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const pendingPatchBodyRef = useRef<Record<string, unknown> | null>(null);
  const prevCandidateIdRef = useRef<string | null>(null);
  const prevDbRowRef = useRef<CandidateDbRow | null>(null);

  const [pipelineConfig, setPipelineConfig] = useState<{
    jobId: string;
    stageMappings: StageMapping[];
    subStages: SubStage[];
  } | null>(null);
  const [stageBaseline, setStageBaseline] = useState<{
    stageMappingId: string;
    subStateId: string;
  } | null>(null);
  const [stageDraft, setStageDraft] = useState<{
    stageMappingId: string;
    subStateId: string;
  } | null>(null);

  const jobId = dbRow?.job_opening_id ?? null;
  const hideSourceField = hideSource || hidePipelineAndSource;
  const hidePipelineField = hidePipeline || hidePipelineAndSource;

  useEffect(() => {
    if (hidePipelineField) return;
    if (!jobId) return;
    if (pipelineConfig?.jobId === jobId) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/candidates/pipeline-config?jobIds=${encodeURIComponent(jobId)}`,
          { credentials: "include", signal: ac.signal },
        );
        if (!res.ok || ac.signal.aborted) return;
        const json = (await res.json()) as {
          configs?: Record<
            string,
            { stageMappings: StageMapping[]; subStages: SubStage[] }
          >;
        };
        const config = json.configs?.[jobId];
        if (!config || ac.signal.aborted) return;
        setPipelineConfig({
          jobId,
          stageMappings: config.stageMappings,
          subStages: config.subStages,
        });
      } catch {
        // Pipeline-stage editing is an enhancement on top of the profile
        // form -- a failed fetch just means that section stays hidden.
      }
    })();
    return () => ac.abort();
  }, [jobId, pipelineConfig?.jobId, hidePipelineField]);

  const snapFromDb = useMemo(
    () => (dbRow ? snapshotFromDb(dbRow) : null),
    [dbRow],
  );

  useEffect(() => {
    setError(null);
  }, [candidateId]);

  useEffect(() => {
    if (!editing) {
      setSkillInput("");
      setChangeSummary("");
    }
  }, [editing]);

  useEffect(() => {
    if (!snapFromDb || editing) return;
    setDraft(draftFromSnapshot(snapFromDb));
  }, [snapFromDb, editing]);

  const addSkillsFromTokens = useCallback((tokens: string[]) => {
    setDraft((d) => {
      const seen = new Set(d.skills.map((s) => s.toLowerCase()));
      const next = [...d.skills];
      for (const raw of tokens) {
        const t = raw.trim();
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(t);
      }
      return { ...d, skills: next };
    });
  }, []);

  const addSkillToken = useCallback(
    (raw: string) => {
      addSkillsFromTokens([raw]);
    },
    [addSkillsFromTokens],
  );

  const removeSkill = useCallback((skill: string) => {
    setDraft((d) => ({
      ...d,
      skills: d.skills.filter((s) => s !== skill),
    }));
  }, []);

  const startEdit = useCallback(() => {
    if (!dbRow || !snapFromDb) return;
    const b = snapshotFromDb(dbRow);
    setBaseline(b);
    setDraft(draftFromSnapshot(b));
    setSkillInput("");
    setChangeSummary("");
    setEditing(true);
    setError(null);
  }, [dbRow, snapFromDb]);

  useEffect(() => {
    if (!dbRow) return;
    if (
      prevCandidateIdRef.current !== candidateId ||
      prevDbRowRef.current !== dbRow
    ) {
      prevCandidateIdRef.current = candidateId;
      prevDbRowRef.current = dbRow;
      const b = snapshotFromDb(dbRow);
      setBaseline(b);
      setDraft(draftFromSnapshot(b));
      setSkillInput("");
      setChangeSummary("");
      setStageBaseline(null);
      setStageDraft(null);
      if (startInEditMode) {
        setEditing(true);
      }
    }
  }, [candidateId, dbRow, startInEditMode]);

  // Initializes the pipeline-stage draft once editing starts -- deferred
  // from `startEdit` itself since `pipelineConfig` loads asynchronously and
  // may not be ready yet (e.g. `startInEditMode` auto-starts before its
  // fetch resolves). Re-syncs whenever `dbRow`/`pipelineConfig` change while
  // editing and no draft exists yet, but never overwrites in-progress edits.
  useEffect(() => {
    if (hidePipelineField) return;
    if (!editing || stageBaseline || !dbRow || !pipelineConfig) return;
    const resolved = resolveCandidatePipelineIds(
      dbRow,
      pipelineConfig.stageMappings,
      pipelineConfig.subStages,
    );
    if (!resolved.stageMappingId || !resolved.subStateId) return;
    const b = {
      stageMappingId: resolved.stageMappingId,
      subStateId: resolved.subStateId,
    };
    setStageBaseline(b);
    setStageDraft(b);
  }, [editing, dbRow, pipelineConfig, stageBaseline, hidePipelineField]);

  const cancelEdit = useCallback(() => {
    if (onCancel) {
      onCancel();
      return;
    }
    setEditing(false);
    setBaseline(null);
    setSkillInput("");
    if (snapFromDb) setDraft(draftFromSnapshot(snapFromDb));
    setError(null);
    setStageBaseline(null);
    setStageDraft(null);
  }, [snapFromDb, onCancel]);

  const stageOptions = useMemo(() => {
    if (!pipelineConfig || !stageBaseline) return [];
    return allowedStageTargets(
      stageBaseline.stageMappingId,
      stageBaseline.subStateId,
      pipelineConfig.stageMappings,
      pipelineConfig.subStages,
    );
  }, [pipelineConfig, stageBaseline]);

  const save = useCallback(async () => {
    if (!dbRow || !baseline) return;
    const current = snapshotFromDraft(draft);
    // Don't diff salary unless this viewer may edit it (avoids wiping a
    // redacted-null baseline over a real DB value).
    if (!canEditSalary) {
      current.expectedSalary = baseline.expectedSalary;
    }
    if (current.source === "Other" && !current.sourceOther.trim()) {
      setError("When source is Other, describe the source in the text field.");
      return;
    }
    const rawPatch = diffProfileSnapshotsToPatch(current, baseline);
    const stagePipelineChanged =
      !!stageDraft &&
      !!stageBaseline &&
      (stageDraft.stageMappingId !== stageBaseline.stageMappingId ||
        stageDraft.subStateId !== stageBaseline.subStateId);
    if (rawPatch == null && !stagePipelineChanged) {
      setError(
        changeSummary.trim()
          ? "Change summary alone cannot be saved. Edit at least one profile field."
          : "No changes to save.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let savedCandidate: CandidateDbRow | null = null;

      if (rawPatch != null) {
        const summaryTrim = changeSummary.trim();
        const patchBody: Record<string, unknown> = { ...rawPatch };
        if (summaryTrim.length > 0) {
          patchBody.change_summary = summaryTrim.slice(
            0,
            PROFILE_CHANGE_SUMMARY_MAX,
          );
        }
        const res = await fetch(`/api/admin/candidates/${candidateId}/profile`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            conflict?: ProfileEditConflict;
          };
          if (res.status === 409 && body.conflict && allowProfileConflictMerge) {
            // Offer a merge instead of a dead-end error -- keep the exact
            // patch body so confirmMerge() can resend it unchanged.
            pendingPatchBodyRef.current = patchBody;
            setConflict(body.conflict);
            return;
          }
          const raw = body.error ?? "Could not save profile.";
          if (res.status === 409) {
            // Every 409 from this route is a contact-info conflict --
            // either an archived-profile race, an ambiguous match against
            // 2+ other candidates (no single merge target), a single match
            // but merging is disallowed here (`allowProfileConflictMerge`
            // false), or a rare write-time unique-constraint race. None of
            // these leave anything for the user to fix inline on this form,
            // so surface as a toast instead of a persistent inline warning;
            // the modal above already handles the common single-match case.
            if (typeof raw === "string" && raw.toLowerCase().includes("archived")) {
              toast.error(
                "This profile was archived (superseded by a newer CV upload). Refresh the candidate list and open the active row to edit.",
              );
            } else {
              toast.error(raw);
            }
            return;
          }
          setError(raw);
          return;
        }
        const json = (await res.json()) as { candidate?: unknown };
        if (!json.candidate || typeof json.candidate !== "object") {
          setError("Save succeeded but response was incomplete.");
          return;
        }
        savedCandidate =
          "candidate_id" in json.candidate
            ? campaignAppliedToCandidateDbRow(
                json.candidate as CampaignAppliedAdminRow,
              )
            : (json.candidate as CandidateDbRow);
      }

      if (stagePipelineChanged && stageDraft) {
        const res = await fetch(`/api/admin/candidates/${candidateId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_job_stage_mapping_id: stageDraft.stageMappingId,
            current_sub_state_id: stageDraft.subStateId,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? "Could not save pipeline stage.");
          return;
        }
        const json = (await res.json()) as { candidate?: unknown };
        if (
          !json.candidate ||
          typeof json.candidate !== "object" ||
          !("candidate_id" in json.candidate)
        ) {
          setError("Save succeeded but response was incomplete.");
          return;
        }
        savedCandidate = campaignAppliedToCandidateDbRow(
          json.candidate as CampaignAppliedAdminRow,
        );
      }

      if (!savedCandidate) {
        setError("Save succeeded but response was incomplete.");
        return;
      }

      setChangeSummary("");
      onSaved(savedCandidate);
      if (!startInEditMode) {
        setEditing(false);
        setBaseline(null);
        setSkillInput("");
        setStageBaseline(null);
        setStageDraft(null);
      }
    } catch {
      setError("Could not save profile.");
    } finally {
      setBusy(false);
    }
  }, [
    allowProfileConflictMerge,
    baseline,
    canEditSalary,
    candidateId,
    changeSummary,
    dbRow,
    draft,
    onSaved,
    stageBaseline,
    stageDraft,
    startInEditMode,
    toast,
  ]);

  const confirmMerge = useCallback(async () => {
    if (!conflict || !pendingPatchBodyRef.current) return;
    setMergeSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${candidateId}/resolve-profile-conflict`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetCandidateId: conflict.candidateId,
            patch: pendingPatchBodyRef.current,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setConflict(null);
        toast.error(body.error ?? "Could not merge candidates.");
        return;
      }
      const json = (await res.json()) as {
        candidate?: unknown;
        survivingCampaignAppliedId?: string;
        applicationIdChanged?: boolean;
      };
      if (!json.candidate || typeof json.candidate !== "object") {
        setConflict(null);
        toast.error("Merge succeeded but response was incomplete.");
        return;
      }
      const savedCandidate =
        "candidate_id" in json.candidate
          ? campaignAppliedToCandidateDbRow(json.candidate as CampaignAppliedAdminRow)
          : (json.candidate as CandidateDbRow);

      setConflict(null);
      pendingPatchBodyRef.current = null;
      setChangeSummary("");
      if (json.applicationIdChanged && json.survivingCampaignAppliedId) {
        if (onCandidateIdChanged) {
          onCandidateIdChanged(json.survivingCampaignAppliedId, savedCandidate);
        } else {
          onSaved(savedCandidate);
        }
      } else {
        onSaved(savedCandidate);
      }
      if (!startInEditMode) {
        setEditing(false);
        setBaseline(null);
        setSkillInput("");
        setStageBaseline(null);
        setStageDraft(null);
      }
    } catch {
      setConflict(null);
      toast.error("Could not merge candidates.");
    } finally {
      setMergeSubmitting(false);
    }
  }, [
    candidateId,
    conflict,
    onCandidateIdChanged,
    onSaved,
    startInEditMode,
    toast,
  ]);

  const isDirty = useMemo(() => {
    if (!editing || !baseline) return false;
    const current = snapshotFromDraft(draft);
    if (!canEditSalary) {
      current.expectedSalary = baseline.expectedSalary;
    }
    const rawPatch = diffProfileSnapshotsToPatch(current, baseline);
    const stagePipelineChanged =
      !!stageDraft &&
      !!stageBaseline &&
      (stageDraft.stageMappingId !== stageBaseline.stageMappingId ||
        stageDraft.subStateId !== stageBaseline.subStateId);
    return (
      rawPatch != null ||
      stagePipelineChanged ||
      changeSummary.trim().length > 0
    );
  }, [
    baseline,
    canEditSalary,
    changeSummary,
    draft,
    editing,
    stageBaseline,
    stageDraft,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (!saveActionRef) return;
    saveActionRef.current = () => {
      void save();
    };
    return () => {
      saveActionRef.current = null;
    };
  }, [save, saveActionRef]);

  if (!canEdit) return null;

  if (isPreview) {
    return (
      <p className="text-sm text-muted">
        Exit CV preview to edit candidate details for the active version.
      </p>
    );
  }

  // A transient background-refresh failure (dbLoadState: "error") shouldn't
  // blank out an already-loaded candidate -- only bail when there's truly no
  // data to show. Otherwise any incidental refetch failure (e.g. the list
  // reload after a successful "assign to another job") wipes the entire
  // edit section until the next successful poll happens to fix it.
  if (!dbRow) {
    if (embedded) {
      if (dbLoadState === "loading") {
        return (
          <p className="text-xs text-muted py-4 text-center">
            Loading profile…
          </p>
        );
      }
      if (dbLoadState === "error") {
        return (
          <p className="text-xs text-rose-500 font-semibold py-4" role="alert">
            Could not load this candidate&apos;s details.
          </p>
        );
      }
    }
    return null;
  }

  if (dbRow.is_active === false) {
    const archivedBody = (
      <p className="text-sm text-muted">
        Close this panel, refresh the candidates, and open the candidate with
        the latest CV to update name, skills, or contact fields.
      </p>
    );
    if (embedded) {
      return (
        <div className="pt-2">
          <p className="text-sm text-muted mb-2">
            This row is an archived CV version. Edits apply only to the active
            candidate record after a replacement upload.
          </p>
          {archivedBody}
        </div>
      );
    }
    return (
      <Card className="overflow-hidden border border-divider bg-background shadow-sm">
        <Card.Header className="border-b border-divider px-4 py-3 sm:px-6">
          <Card.Title className="text-base font-semibold text-foreground">
            Correct candidate details
          </Card.Title>
          <p className="mt-1 text-sm text-muted">
            This row is an archived CV version. Edits apply only to the active
            candidate record after a replacement upload.
          </p>
        </Card.Header>
        <Card.Content className="px-4 py-4 sm:px-6 sm:py-5">
          {archivedBody}
        </Card.Content>
      </Card>
    );
  }

  const formFields = (
    <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 md:gap-x-6">
      <TextField className="min-w-0">
        <Label className={FIELD_LABEL}>Name</Label>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="mt-1 text-sm"
        />
      </TextField>
      <TextField className="min-w-0">
        <Label className={FIELD_LABEL}>Role / title</Label>
        <Input
          value={draft.role}
          onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
          className="mt-1 text-sm"
        />
      </TextField>
      <TextField className="min-w-0">
        <Label className={FIELD_LABEL}>Years of experience</Label>
        <Input
          inputMode="numeric"
          value={draft.experienceYearsStr}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              experienceYearsStr: e.target.value,
            }))
          }
          className="mt-1 text-sm"
        />
      </TextField>
      {!hideSourceField ? (
        <div className="min-w-0">
          <Label className={FIELD_LABEL}>Sourced from</Label>
          <Select
            value={draft.source}
            onChange={(k) => {
              const next = String(k ?? CANDIDATE_SOURCE_VALUES[0]);
              setDraft((d) => ({
                ...d,
                source: next,
                sourceOther: next !== "Other" ? "" : d.sourceOther,
              }));
            }}
            className="mt-2"
          >
            <Select.Trigger className="w-full min-w-0">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {CANDIDATE_SOURCE_VALUES.map((s) => (
                  <ListBox.Item key={s} id={s} textValue={s}>
                    {s}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          {draft.source === "Other" ? (
            <TextField className="mt-3">
              <Label className={`${FIELD_LABEL} normal-case`}>
                Describe the source
              </Label>
              <Input
                value={draft.sourceOther}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    sourceOther: e.target.value,
                  }))
                }
                placeholder="e.g. referral, career fair…"
                className="mt-1 text-sm"
              />
            </TextField>
          ) : null}
        </div>
      ) : null}
      <div className="min-w-0 md:col-span-2">
        <Label className={FIELD_LABEL}>Skills</Label>
        <p className="mt-0.5 text-[11px] text-muted/80">
          Type a skill, press Enter to add. Paste comma-separated lists to add
          several at once.
        </p>
        <div className="mt-2 flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-divider bg-muted/15 px-2 py-1.5 dark:bg-muted/25">
          {draft.skills.map((s, idx) => (
            <span
              key={`${s}-${idx}`}
              className="inline-flex max-w-full items-center gap-0.5"
            >
              <Chip
                size="sm"
                variant="soft"
                color="accent"
                className="max-w-[200px] truncate border border-accent/40 bg-accent/10 text-xs font-semibold text-accent"
              >
                {s}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  className="size-5 min-w-5 shrink-0 text-danger hover:text-danger"
                  aria-label={`Remove ${s}`}
                  onPress={() => removeSkill(s)}
                >
                  ×
                </Button>
              </Chip>
            </span>
          ))}
          <Input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const t = skillInput.trim();
                if (t) {
                  addSkillToken(t);
                  setSkillInput("");
                }
              } else if (e.key === "Backspace" && skillInput === "") {
                setDraft((d) =>
                  d.skills.length === 0
                    ? d
                    : {
                        ...d,
                        skills: d.skills.slice(0, -1),
                      },
                );
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text/plain");
              if (text.includes(",") || text.includes(";")) {
                e.preventDefault();
                addSkillsFromTokens(skillsFromComma(text));
              }
            }}
            placeholder="Add skill…"
            className="min-w-[8rem] flex-1 border-0 bg-transparent text-sm shadow-none outline-none ring-0 focus-visible:ring-0"
            autoComplete="off"
          />
        </div>
      </div>
      <TextField className="min-w-0">
        <Label className={FIELD_LABEL}>Degree</Label>
        <Input
          value={draft.degree}
          onChange={(e) =>
            setDraft((d) => ({ ...d, degree: e.target.value }))
          }
          className="mt-1 text-sm"
        />
      </TextField>
      <TextField className="min-w-0">
        <Label className={FIELD_LABEL}>School</Label>
        <Input
          value={draft.school}
          onChange={(e) =>
            setDraft((d) => ({ ...d, school: e.target.value }))
          }
          className="mt-1 text-sm"
        />
      </TextField>
      <TextField className="min-w-0">
        <Label className={FIELD_LABEL}>Email (from CV)</Label>
        <Input
          value={draft.email}
          onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
          className="mt-1 text-sm"
          autoComplete="off"
        />
      </TextField>
      <TextField className="min-w-0">
        <Label className={FIELD_LABEL}>Phone (from CV)</Label>
        <Input
          value={draft.phone}
          onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
          className="mt-1 text-sm"
          autoComplete="off"
        />
      </TextField>
      {canEditSalary ? (
        <TextField className="min-w-0 md:col-span-2">
          <Label className={FIELD_LABEL}>Expected salary</Label>
          <Input
            value={draft.expectedSalary}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                expectedSalary: e.target.value,
              }))
            }
            placeholder="e.g. 18.000.000 – 20.000.000 or 18-20 triệu"
            className="mt-1 text-sm"
            autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-muted/80">
            Visible only to HR and the chapter head for this job.
          </p>
        </TextField>
      ) : null}
      {!hidePipelineField && stageBaseline && stageOptions.length > 0 ? (
        <div className="min-w-0">
          <Label className={FIELD_LABEL}>Pipeline stage</Label>
          <Select
            value={
              stageDraft
                ? stageSubStageOptionKey(
                    stageDraft.stageMappingId,
                    stageDraft.subStateId,
                  )
                : undefined
            }
            onChange={(k) => {
              if (typeof k !== "string") return;
              const [stageMappingId, subStateId] = k.split(":");
              if (stageMappingId && subStateId) {
                setStageDraft({ stageMappingId, subStateId });
              }
            }}
            className="mt-2"
          >
            <Select.Trigger className="w-full min-w-0">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {stageOptions.map(({ stageMapping, subStage }) => {
                  const key = stageSubStageOptionKey(
                    stageMapping.id,
                    subStage.id,
                  );
                  return (
                    <ListBox.Item
                      key={key}
                      id={key}
                      textValue={`${stageMapping.pipeline_stages?.label ?? stageMapping.pipeline_stages?.code} - ${subStage.label}`}
                    >
                      <span
                        className={getSubStageTextColorClass(
                          subStage.code,
                          subStage.is_passed,
                          subStage.is_default,
                          stageMapping.pipeline_stages?.color,
                        )}
                      >
                        {stageMapping.pipeline_stages?.label ??
                          stageMapping.pipeline_stages?.code}
                        {" · "}
                        {subStage.label}
                      </span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  );
                })}
              </ListBox>
            </Select.Popover>
          </Select>
          <p className="mt-1.5 text-[11px] text-muted/80">
            Only shows moves allowed from the candidate&apos;s current stage —
            same rules as the pipeline table.
          </p>
        </div>
      ) : null}
      <TextField className="min-w-0 md:col-span-2">
        <Label className={FIELD_LABEL}>
          Change summary{" "}
          <span className="font-normal normal-case text-muted">(optional)</span>
        </Label>
        <Input
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          placeholder="Why are you editing these details?"
          maxLength={PROFILE_CHANGE_SUMMARY_MAX}
          className="mt-1 text-sm"
          autoComplete="off"
        />
      </TextField>
    </div>
  );

  if (embedded) {
    if (!editing) {
      return (
        <div className="pt-2">
          <Button
            size="sm"
            variant="secondary"
            onPress={startEdit}
            isDisabled={dbLoadState === "loading"}
          >
            Edit details
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3 pt-2">
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {formFields}
        {conflict && allowProfileConflictMerge ? (
          <MergeConflictingCandidateModal
            open
            onOpenChange={(o) => {
              if (!o) setConflict(null);
            }}
            conflict={conflict}
            isSubmitting={mergeSubmitting}
            onMerge={confirmMerge}
            onCancel={() => setConflict(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border border-divider bg-background shadow-sm">
      <Card.Content className="flex flex-col gap-0 p-0">
        {conflict && allowProfileConflictMerge ? (
          <MergeConflictingCandidateModal
            open
            onOpenChange={(o) => {
              if (!o) setConflict(null);
            }}
            conflict={conflict}
            isSubmitting={mergeSubmitting}
            onMerge={confirmMerge}
            onCancel={() => setConflict(null)}
          />
        ) : null}
        {!editing ? (
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onPress={startEdit}
                isDisabled={dbLoadState === "loading"}
              >
                Edit details
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
              {formFields}
            </div>
            <div className="sticky bottom-0 z-10 border-t border-divider bg-background/95 px-4 py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:px-6">
              {error ? (
                <p className="mb-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  onPress={() => void save()}
                  isDisabled={busy || !isDirty}
                  isPending={busy}
                >
                  Save changes
                </Button>
                <Button
                  variant="tertiary"
                  onPress={cancelEdit}
                  isDisabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
