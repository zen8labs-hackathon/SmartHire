"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

import type { CandidateDbRow } from "@/lib/candidates/db-row";
import { normalizeParsedResume } from "@/lib/candidates/normalize-parsed-resume";
import {
  type CandidateProfileFormSnapshot,
  diffProfileSnapshotsToPatch,
} from "@/lib/candidates/candidate-profile-patch";
import {
  CANDIDATE_SOURCE_VALUES,
  isCandidateSource,
} from "@/lib/candidates/source-constants";
import { PROFILE_CHANGE_SUMMARY_MAX } from "@/lib/candidates/candidate-profile-patch";

export type CandidateProfileEditSectionProps = {
  candidateId: string;
  dbRow: CandidateDbRow | null;
  canEdit: boolean;
  isPreview: boolean;
  dbLoadState: "loading" | "error" | "ok";
  onSaved: (candidate: CandidateDbRow) => void;
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
    if (Number.isFinite(n)) experienceYears = Math.min(80, Math.max(0, Math.round(n)));
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

  const snapFromDb = useMemo(
    () => (dbRow ? snapshotFromDb(dbRow) : null),
    [dbRow],
  );

  useEffect(() => {
    setEditing(false);
    setBaseline(null);
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

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setBaseline(null);
    setSkillInput("");
    if (snapFromDb) setDraft(draftFromSnapshot(snapFromDb));
    setError(null);
  }, [snapFromDb]);

  const save = useCallback(async () => {
    if (!dbRow || !baseline) return;
    const current = snapshotFromDraft(draft);
    if (current.source === "Other" && !current.sourceOther.trim()) {
      setError("When source is Other, describe the source in the text field.");
      return;
    }
    const rawPatch = diffProfileSnapshotsToPatch(current, baseline);
    if (rawPatch == null) {
      setError("No changes to save.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const summaryTrim = changeSummary.trim();
      const patchBody: Record<string, unknown> = { ...rawPatch };
      if (summaryTrim.length > 0) {
        patchBody.change_summary = summaryTrim.slice(0, PROFILE_CHANGE_SUMMARY_MAX);
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
      const json = (await res.json()) as { candidate?: CandidateDbRow };
      const c = json.candidate;
      if (!c) {
        setError("Save succeeded but response was incomplete.");
        return;
      }
      onSaved(c);
      setEditing(false);
      setBaseline(null);
      setSkillInput("");
      setChangeSummary("");
    } catch {
      setError("Could not save profile.");
    } finally {
      setBusy(false);
    }
  }, [baseline, candidateId, changeSummary, dbRow, draft, onSaved]);

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
            Close this panel, refresh the talent pool, and open the candidate
            with the latest CV to update name, skills, or contact fields.
          </p>
        </Card.Content>
      </Card>
    );
  }

  return (
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
                <TextField className="min-w-0 md:col-span-2">
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
                    Type a skill, press Enter to add. Paste comma-separated
                    lists to add several at once.
                  </p>
                  <div className="mt-2 flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-divider bg-muted/15 px-2 py-1.5 dark:bg-muted/25">
                    {draft.skills.map((s) => (
                      <span
                        key={s}
                        className="inline-flex max-w-full items-center gap-0.5"
                      >
                        <Chip
                          size="sm"
                          variant="soft"
                          color="default"
                          className="max-w-[200px] truncate border border-divider text-xs font-medium"
                        >
                          {s}
                        </Chip>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          isIconOnly
                          className="size-7 min-w-7 shrink-0 text-muted hover:text-foreground"
                          aria-label={`Remove ${s}`}
                          onPress={() => removeSkill(s)}
                        >
                          ×
                        </Button>
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
