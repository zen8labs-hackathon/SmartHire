"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  diffProfileSnapshotsToPatch,
} from "@/lib/candidates/candidate-profile-patch";
import type { DuplicateProfileMatch } from "@/lib/candidates/duplicate-detection";
import { DuplicateProfileWarningModal } from "@/components/admin/candidates/duplicate-profile-warning-modal";
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
  isPreview: boolean;
  dbLoadState: "loading" | "error" | "ok";
  onSaved: (candidate: CandidateDbRow) => void;
  /** When true, the form opens directly in edit mode instead of the read-only "Edit details" button. */
  startInEditMode?: boolean;
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
  };
}

export function CandidateProfileEditSection({
  candidateId,
  dbRow,
  canEdit,
  isPreview,
  dbLoadState,
  onSaved,
  startInEditMode = false,
}: CandidateProfileEditSectionProps) {
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
  }));
  const [skillInput, setSkillInput] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStartedRef = useRef(false);

  const [duplicateMatches, setDuplicateMatches] = useState<
    DuplicateProfileMatch[] | null
  >(null);
  const [pendingPatchBody, setPendingPatchBody] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);

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

  useEffect(() => {
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
  }, [jobId, pipelineConfig?.jobId]);

  const snapFromDb = useMemo(
    () => (dbRow ? snapshotFromDb(dbRow) : null),
    [dbRow],
  );

  useEffect(() => {
    setEditing(false);
    setBaseline(null);
    setError(null);
    setDuplicateMatches(null);
    setPendingPatchBody(null);
    autoStartedRef.current = false;
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
    if (!startInEditMode || autoStartedRef.current) return;
    if (!dbRow || !snapFromDb) return;
    autoStartedRef.current = true;
    startEdit();
  }, [startInEditMode, dbRow, snapFromDb, startEdit]);

  // Initializes the pipeline-stage draft once editing starts -- deferred
  // from `startEdit` itself since `pipelineConfig` loads asynchronously and
  // may not be ready yet (e.g. `startInEditMode` auto-starts before its
  // fetch resolves). Re-syncs whenever `dbRow`/`pipelineConfig` change while
  // editing and no draft exists yet, but never overwrites in-progress edits.
  useEffect(() => {
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
  }, [editing, dbRow, pipelineConfig, stageBaseline]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setBaseline(null);
    setSkillInput("");
    if (snapFromDb) setDraft(draftFromSnapshot(snapFromDb));
    setError(null);
    setStageBaseline(null);
    setStageDraft(null);
    setDuplicateMatches(null);
    setPendingPatchBody(null);
  }, [snapFromDb]);

  const stageOptions = useMemo(() => {
    if (!pipelineConfig || !stageBaseline) return [];
    return allowedStageTargets(
      stageBaseline.stageMappingId,
      stageBaseline.subStateId,
      pipelineConfig.stageMappings,
      pipelineConfig.subStages,
    );
  }, [pipelineConfig, stageBaseline]);

  /** Runs the pipeline-stage PATCH (if the user changed it) and finalizes
   * the save -- shared by the normal save path and the post-merge path,
   * since both need to apply any pending stage change before calling
   * `onSaved` and resetting the form. */
  const finishSave = useCallback(
    async (initial: CandidateDbRow | null): Promise<boolean> => {
      let result = initial;
      const stagePipelineChanged =
        !!stageDraft &&
        !!stageBaseline &&
        (stageDraft.stageMappingId !== stageBaseline.stageMappingId ||
          stageDraft.subStateId !== stageBaseline.subStateId);

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
          return false;
        }
        const json = (await res.json()) as { candidate?: unknown };
        if (
          !json.candidate ||
          typeof json.candidate !== "object" ||
          !("candidate_id" in json.candidate)
        ) {
          setError("Save succeeded but response was incomplete.");
          return false;
        }
        result = campaignAppliedToCandidateDbRow(
          json.candidate as CampaignAppliedAdminRow,
        );
      }

      if (!result) {
        setError("Save succeeded but response was incomplete.");
        return false;
      }

      onSaved(result);
      setEditing(false);
      setBaseline(null);
      setSkillInput("");
      setChangeSummary("");
      setStageBaseline(null);
      setStageDraft(null);
      setDuplicateMatches(null);
      setPendingPatchBody(null);
      return true;
    },
    [candidateId, onSaved, stageBaseline, stageDraft],
  );

  const save = useCallback(async () => {
    if (!dbRow || !baseline) return;
    const current = snapshotFromDraft(draft);
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
      setError("No changes to save.");
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
        const res = await fetch(
          `/api/admin/candidates/${candidateId}/profile`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          const raw = body.error ?? "Could not save profile.";
          if (
            res.status === 409 &&
            typeof raw === "string" &&
            raw.toLowerCase().includes("archived")
          ) {
            setError(
              "This profile was archived (superseded by a newer CV upload). Refresh the candidate list and open the active row to edit.",
            );
          } else {
            setError(raw);
          }
          return;
        }
        const json = (await res.json()) as {
          candidate?: CandidateDbRow;
          duplicate?: boolean;
          matches?: DuplicateProfileMatch[];
        };
        if (json.duplicate) {
          setPendingPatchBody(patchBody);
          setDuplicateMatches(json.matches ?? []);
          return;
        }
        if (!json.candidate) {
          setError("Save succeeded but response was incomplete.");
          return;
        }
        savedCandidate = json.candidate;
      }

      await finishSave(savedCandidate);
    } catch {
      setError("Could not save profile.");
    } finally {
      setBusy(false);
    }
  }, [
    baseline,
    candidateId,
    changeSummary,
    dbRow,
    draft,
    finishSave,
    stageBaseline,
    stageDraft,
  ]);

  const handleMergeDuplicate = useCallback(async () => {
    const target = duplicateMatches?.[0];
    if (!target || !pendingPatchBody) return;
    setMergeBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${candidateId}/profile/merge-duplicate`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patch: pendingPatchBody,
            existingCandidateId: target.candidateId,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Could not merge candidate.");
        return;
      }
      const json = (await res.json()) as { candidate?: CandidateDbRow };
      if (!json.candidate) {
        setError("Merge succeeded but response was incomplete.");
        return;
      }
      await finishSave(json.candidate);
    } catch {
      setError("Could not merge candidate.");
    } finally {
      setMergeBusy(false);
    }
  }, [candidateId, duplicateMatches, finishSave, pendingPatchBody]);

  const handleDiscardDuplicate = useCallback(() => {
    setDuplicateMatches(null);
    setPendingPatchBody(null);
    // `startEdit`, not `cancelEdit` + `setEditing(true)`: `cancelEdit` sets
    // `baseline` to null and nothing else repopulates it, which left "Save
    // changes" silently no-op'ing (`save()` bails out on `!baseline`) for
    // the rest of this edit session after a discard.
    startEdit();
  }, [startEdit]);

  const handleCancelDuplicate = useCallback(() => {
    setDuplicateMatches(null);
    setPendingPatchBody(null);
  }, []);

  if (!canEdit) return null;

  if (isPreview) {
    return (
      <p className="text-sm text-muted">
        Exit CV preview to edit candidate details for the active version.
      </p>
    );
  }

  if (dbLoadState === "error" || !dbRow) {
    return null;
  }

  if (dbRow.is_active === false) {
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
          <p className="text-sm text-muted">
            Close this panel, refresh the candidates, and open the candidate
            with the latest CV to update name, skills, or contact fields.
          </p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border border-divider bg-background shadow-sm">
        <Card.Header className="border-b border-divider px-4 py-3 sm:px-6">
          <Card.Title className="text-base font-semibold text-foreground">
            Correct candidate details
          </Card.Title>
          <p className="mt-1 text-sm text-muted">
            Fix parsing mistakes or outdated fields. Changes are saved to the
            database and kept in sync with the parsed CV payload.
          </p>
        </Card.Header>
        <Card.Content className="flex flex-col gap-0 p-0">
          <div className="space-y-4 px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
            <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 md:gap-x-6">
              <TextField className="min-w-0">
                <Label className={FIELD_LABEL}>Name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  className="mt-1 text-sm"
                />
              </TextField>
              <TextField className="min-w-0">
                <Label className={FIELD_LABEL}>Role / title</Label>
                <Input
                  value={draft.role}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, role: e.target.value }))
                  }
                  className="mt-1 text-sm"
                />
              </TextField>
              <TextField className="min-w-0 md:col-span-1">
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
                  className="mt-1 max-w-xs text-sm"
                />
              </TextField>
              <div className="min-w-0 md:col-span-2">
                <Label className={FIELD_LABEL}>Skills</Label>
                <p className="mt-0.5 text-[11px] text-muted/80">
                  Type a skill, press Enter to add. Paste comma-separated lists
                  to add several at once.
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
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, email: e.target.value }))
                  }
                  className="mt-1 text-sm"
                  autoComplete="off"
                />
              </TextField>
              <TextField className="min-w-0">
                <Label className={FIELD_LABEL}>Phone (from CV)</Label>
                <Input
                  value={draft.phone}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, phone: e.target.value }))
                  }
                  className="mt-1 text-sm"
                  autoComplete="off"
                />
              </TextField>
              <div className="min-w-0 md:col-span-2">
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
              {stageBaseline && stageOptions.length > 0 ? (
                <div className="min-w-0 md:col-span-2">
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
                    Only shows moves allowed from the candidate's current stage
                    — same rules as the pipeline table.
                  </p>
                </div>
              ) : null}
              <TextField className="min-w-0 md:col-span-2">
                <Label className={FIELD_LABEL}>
                  Change summary{" "}
                  <span className="font-normal normal-case text-muted">
                    (optional)
                  </span>
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
                isDisabled={busy}
                isPending={busy}
              >
                Save changes
              </Button>
              <Button variant="tertiary" onPress={cancelEdit} isDisabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>
      {duplicateMatches ? (
        <DuplicateProfileWarningModal
          open={duplicateMatches !== null}
          onOpenChange={(o) => {
            if (!o) handleCancelDuplicate();
          }}
          matches={duplicateMatches}
          isSubmitting={mergeBusy}
          onMerge={handleMergeDuplicate}
          onDiscard={handleDiscardDuplicate}
          onCancel={handleCancelDuplicate}
        />
      ) : null}
    </>
  );
}
