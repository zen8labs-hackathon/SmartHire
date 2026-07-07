"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Breadcrumbs,
  Button,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";

import { SectionCard } from "@/components/admin/shell/cards";

import type { JobPipelineCandidateRow } from "@/lib/jd/pipeline-types";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

type Props = {
  jobDescriptionId: number;
  jobTitle: string;
  candidate: JobPipelineCandidateRow;
  currentUserId: string;
  isAdmin: boolean;
};

type LatestEval = {
  id: string;
  createdAt: string;
  previewPath: string;
  downloadUrl: string;
};

type InterviewNoteRow = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorUsername: string | null;
};

export function PipelineCandidateEvaluationClient({
  jobDescriptionId,
  jobTitle,
  candidate,
  currentUserId,
  isAdmin,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [draftNote, setDraftNote] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [evalBusy, setEvalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestEval | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState<InterviewNoteRow[]>([]);
  const [notesLoadError, setNotesLoadError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [preInterviewNote, setPreInterviewNote] = useState("");
  const [preInterviewLoadError, setPreInterviewLoadError] = useState<
    string | null
  >(null);
  const [preInterviewSaveBusy, setPreInterviewSaveBusy] = useState(false);
  const [preInterviewSaveSuccess, setPreInterviewSaveSuccess] = useState(false);
  const preInterviewSuccessTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const clearPreInterviewSuccessTimer = useCallback(() => {
    if (preInterviewSuccessTimerRef.current) {
      clearTimeout(preInterviewSuccessTimerRef.current);
      preInterviewSuccessTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => clearPreInterviewSuccessTimer(),
    [clearPreInterviewSuccessTimer],
  );

  const authHeaders = useCallback(
    () => getSessionAuthorizationHeaders(supabase),
    [supabase],
  );

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const loadLatest = useCallback(async () => {
    setLoadError(null);
    try {
      const h = await authHeaders();
      const res = await fetch(
        `/api/admin/job-descriptions/${jobDescriptionId}/evaluations?pipelineCandidateId=${encodeURIComponent(candidate.id)}`,
        {
          credentials: "include",
          headers: {
            ...(h.Authorization ? { Authorization: h.Authorization } : {}),
          },
        },
      );
      const json = (await res.json()) as {
        latest: LatestEval | null;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(json.error ?? "Could not load evaluations.");
        return;
      }
      setLatest(json.latest);
    } catch {
      setLoadError("Could not load evaluations.");
    }
  }, [authHeaders, jobDescriptionId, candidate.id]);

  const loadNotes = useCallback(async () => {
    setNotesLoadError(null);
    try {
      const h = await authHeaders();
      const res = await fetch(
        `/api/admin/job-descriptions/${jobDescriptionId}/interview-notes?pipelineCandidateId=${encodeURIComponent(candidate.id)}`,
        {
          credentials: "include",
          headers: {
            ...(h.Authorization ? { Authorization: h.Authorization } : {}),
          },
        },
      );
      const json = (await res.json()) as {
        notes?: InterviewNoteRow[];
        error?: string;
      };
      if (!res.ok) {
        setNotesLoadError(json.error ?? "Could not load interview notes.");
        return;
      }
      setNotes(json.notes ?? []);
    } catch {
      setNotesLoadError("Could not load interview notes.");
    }
  }, [authHeaders, jobDescriptionId, candidate.id]);

  const loadPreInterviewNote = useCallback(async () => {
    setPreInterviewLoadError(null);
    try {
      const h = await authHeaders();
      const res = await fetch(
        `/api/admin/job-descriptions/${jobDescriptionId}/pre-interview-note?pipelineCandidateId=${encodeURIComponent(candidate.id)}`,
        {
          credentials: "include",
          headers: {
            ...(h.Authorization ? { Authorization: h.Authorization } : {}),
          },
        },
      );
      const json = (await res.json()) as {
        preInterviewNote?: string;
        error?: string;
      };
      if (!res.ok) {
        setPreInterviewLoadError(
          json.error ?? "Could not load pre-interview note.",
        );
        return;
      }
      setPreInterviewNote(json.preInterviewNote ?? "");
    } catch {
      setPreInterviewLoadError("Could not load pre-interview note.");
    }
  }, [authHeaders, jobDescriptionId, candidate.id]);

  useEffect(() => {
    void loadLatest();
    void loadNotes();
    void loadPreInterviewNote();
  }, [loadLatest, loadNotes, loadPreInterviewNote]);

  const snapshot = useMemo(
    () => ({
      Email: candidate.email,
      Mobile: candidate.mobile,
      "Date of birth": candidate.dateOfBirth,
      Status: candidate.status,
      "Major / school": candidate.majorSchool,
      GPA: candidate.gpa,
      English: candidate.english,
      "Related skills": candidate.relatedSkills,
    }),
    [candidate],
  );

  const saveNoteOnly = async () => {
    setError(null);
    const trimmed = draftNote.trim();
    if (trimmed.length < 2) {
      setError("Enter a note with at least a couple of characters.");
      return;
    }
    setNotesBusy(true);
    try {
      const h = await authHeaders();
      if (!h.Authorization) {
        setError("Session expired. Sign in again.");
        return;
      }
      const res = await fetch(
        `/api/admin/job-descriptions/${jobDescriptionId}/interview-notes`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...h,
          },
          body: JSON.stringify({
            pipelineCandidateId: candidate.id,
            body: trimmed,
          }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not save note.");
        return;
      }
      setDraftNote("");
      await loadNotes();
    } catch {
      setError("Could not save note.");
    } finally {
      setNotesBusy(false);
    }
  };

  const startEditNote = (note: InterviewNoteRow) => {
    setEditError(null);
    setEditingNoteId(note.id);
    setEditDraft(note.body);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditDraft("");
    setEditError(null);
  };

  const saveEditedNote = async () => {
    if (!editingNoteId) return;
    setEditError(null);
    const trimmed = editDraft.trim();
    if (trimmed.length < 2) {
      setEditError("Enter a note with at least a couple of characters.");
      return;
    }
    setEditBusy(true);
    try {
      const h = await authHeaders();
      if (!h.Authorization) {
        setEditError("Session expired. Sign in again.");
        return;
      }
      const res = await fetch(
        `/api/admin/job-descriptions/${jobDescriptionId}/interview-notes`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...h,
          },
          body: JSON.stringify({
            noteId: editingNoteId,
            body: trimmed,
          }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setEditError(json.error ?? "Could not save note.");
        return;
      }
      cancelEditNote();
      await loadNotes();
    } catch {
      setEditError("Could not save note.");
    } finally {
      setEditBusy(false);
    }
  };

  const regenerateEvaluation = async () => {
    setError(null);
    setEvalBusy(true);
    try {
      const h = await authHeaders();
      if (!h.Authorization) {
        setError("Session expired. Sign in again.");
        return;
      }
      const trimmedDraft = draftNote.trim();
      const res = await fetch(
        `/api/admin/job-descriptions/${jobDescriptionId}/evaluations`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...h,
          },
          body: JSON.stringify({
            pipelineCandidateId: candidate.id,
            candidateName: candidate.name,
            candidateSnapshot: snapshot,
            ...(trimmedDraft.length >= 2
              ? { newInterviewNote: trimmedDraft }
              : {}),
          }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        previewPath?: string;
        downloadUrl?: string | null;
      };
      if (!res.ok) {
        setError(json.error ?? "Generation failed.");
        return;
      }
      if (trimmedDraft.length >= 2) {
        setDraftNote("");
        await loadNotes();
      }
      await loadLatest();
      if (json.downloadUrl) {
        window.open(json.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Generation failed.");
    } finally {
      setEvalBusy(false);
    }
  };

  const savePreInterviewNote = async () => {
    setError(null);
    clearPreInterviewSuccessTimer();
    setPreInterviewSaveSuccess(false);
    setPreInterviewSaveBusy(true);
    try {
      const h = await authHeaders();
      if (!h.Authorization) {
        setError("Session expired. Sign in again.");
        return;
      }
      const res = await fetch(
        `/api/admin/job-descriptions/${jobDescriptionId}/pre-interview-note`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...h,
          },
          body: JSON.stringify({
            pipelineCandidateId: candidate.id,
            preInterviewNote,
          }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        preInterviewNote?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not save pre-interview note.");
        return;
      }
      if (typeof json.preInterviewNote === "string") {
        setPreInterviewNote(json.preInterviewNote);
      }
      setPreInterviewSaveSuccess(true);
      clearPreInterviewSuccessTimer();
      preInterviewSuccessTimerRef.current = setTimeout(() => {
        setPreInterviewSaveSuccess(false);
        preInterviewSuccessTimerRef.current = null;
      }, 4500);
    } catch {
      setError("Could not save pre-interview note.");
    } finally {
      setPreInterviewSaveBusy(false);
    }
  };

  const shareUrl = latest && origin ? `${origin}${latest.previewPath}` : "";
  const cvUrl = `/api/admin/candidates/${candidate.id}/cv-download`;

  return (
    <div className="flex flex-col gap-4 font-sans">
      <Breadcrumbs className="text-xs text-muted">
        <Breadcrumbs.Item href="/admin/jd">Jobs list</Breadcrumbs.Item>
        <Breadcrumbs.Item href={`/admin/jd/${jobDescriptionId}/pipeline`}>
          {jobTitle}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item>Evaluation</Breadcrumbs.Item>
      </Breadcrumbs>

      <div className="flex gap-6 items-start">
        {/* Left: CV viewer */}
        <div className="w-5/12 shrink-0 sticky top-6">
          <p className="mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
            CV — {candidate.name}
          </p>
          <iframe
            src={cvUrl}
            title={`CV - ${candidate.name}`}
            className="w-full rounded-xl border border-divider bg-surface-secondary/40 shadow-sm"
            style={{ height: "calc(100vh - 120px)" }}
          />
        </div>

        {/* Right: Evaluation info */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {candidate.name}
            </h1>
            <p className="mt-1 text-sm text-muted font-medium">
              Interview evaluation — {jobTitle}
            </p>
          </div>

          <SectionCard
            title="Candidate Details"
            description="Personal profile, academic background, and timeline records."
          >
            <div className="grid gap-3 text-xs sm:grid-cols-2 pt-2">
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">Email</span>
                <p className="font-semibold text-foreground text-sm truncate">{candidate.email}</p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">Phone</span>
                <p className="font-semibold text-foreground text-sm">{candidate.mobile}</p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">D.O.B.</span>
                <p className="font-semibold text-foreground text-sm">{candidate.dateOfBirth}</p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">Pipeline Status</span>
                <p className="font-semibold text-foreground text-sm">{candidate.status}</p>
              </div>
              <div className="sm:col-span-2 bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">Education</span>
                <p className="font-semibold text-foreground text-sm">
                  {candidate.studentYears} · {candidate.majorSchool} · GPA {candidate.gpa}
                </p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">English</span>
                <p className="font-semibold text-foreground text-sm">{candidate.english}</p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">TTF (Time to Fill)</span>
                <p className="font-semibold text-foreground text-sm">{candidate.ttf || "—"}</p>
              </div>
              <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">TTH (Time to Hire)</span>
                <p className="font-semibold text-foreground text-sm">{candidate.tth || "—"}</p>
              </div>
              {candidate.expectedSalary ? (
                <div className="bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                  <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">Expected Salary</span>
                  <p className="font-semibold text-foreground text-sm">{candidate.expectedSalary}</p>
                </div>
              ) : null}
              <div className="sm:col-span-2 bg-surface-secondary/20 p-2.5 rounded-xl border border-divider">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-0.5">Skills</span>
                <p className="font-semibold text-foreground text-sm">{candidate.relatedSkills}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Pre-interview note"
            description="Write questions or topics to cover with the candidate during the interview. This is saved per candidate for this role and is included when you generate the evaluation PDF."
          >
            <div className="flex flex-col gap-3 pt-2">
              {preInterviewLoadError ? (
                <p className="text-xs text-rose-500 font-semibold" role="alert">
                  {preInterviewLoadError}
                </p>
              ) : null}
              {preInterviewSaveSuccess ? (
                <Alert status="success" role="status" className="rounded-xl">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Save success</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : null}
              <TextField
                value={preInterviewNote}
                onChange={(v) => {
                  clearPreInterviewSuccessTimer();
                  setPreInterviewSaveSuccess(false);
                  setPreInterviewNote(v);
                }}
                aria-label="Pre-interview note input"
              >
                <TextArea
                  placeholder="E.g. clarify backend experience, system design at scale, salary expectations…"
                  className="min-h-[8rem] w-full rounded-xl border border-divider bg-surface-secondary/20 p-3 text-xs outline-none focus:border-accent"
                />
              </TextField>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit h-8 px-4 rounded-lg bg-surface-secondary border border-divider text-xs font-bold"
                isDisabled={preInterviewSaveBusy}
                onPress={() => void savePreInterviewNote()}
              >
                {preInterviewSaveBusy ? "Saving…" : "Save pre-interview note"}
              </Button>
            </div>
          </SectionCard>

          {loadError ? (
            <p className="text-xs text-rose-500 font-semibold" role="alert">
              {loadError}
            </p>
          ) : null}

          {latest ? (
            <SectionCard
              title="Latest generated evaluation"
              description={`Generated ${new Date(latest.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. Add more interview notes below and regenerate to include them.`}
            >
              <div className="flex flex-col gap-3 pt-2">
                <div>
                  <Label className="text-xs font-semibold text-muted mb-1.5 block" id="eval-share-url-label">
                    Preview link (share)
                  </Label>
                  <TextField
                    value={shareUrl}
                    isReadOnly
                    aria-labelledby="eval-share-url-label"
                  >
                    <TextArea className="min-h-[3rem] font-mono text-xs w-full rounded-xl border border-divider bg-surface-secondary/20 p-3 outline-none" />
                  </TextField>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
                      onPress={() => {
                        if (!shareUrl) return;
                        void navigator.clipboard.writeText(shareUrl);
                      }}
                    >
                      Copy link
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
                      onPress={() => {
                        window.open(
                          latest.previewPath,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }}
                    >
                      Open preview
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="h-8 px-4 rounded-lg bg-accent text-white text-xs font-bold"
                      onPress={() => {
                        window.open(
                          latest.downloadUrl,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }}
                    >
                      Download PDF
                    </Button>
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title={
              <div className="flex items-center gap-2">
                <span>Saved interview notes</span>
                {notes.length > 0 ? (
                  <span className="text-xs font-normal text-muted tabular-nums">
                    ({notes.length})
                  </span>
                ) : null}
              </div>
            }
            description="Everyone on the hiring team can add notes. The PDF uses the combined notes in chronological order."
          >
            <div className="flex flex-col gap-4 pt-2">
              {notesLoadError ? (
                <p className="text-xs text-rose-500 font-semibold" role="alert">
                  {notesLoadError}
                </p>
              ) : null}
              {notes.length === 0 ? (
                <p className="text-xs text-muted py-4 text-center bg-surface-secondary/20 rounded-xl border border-dashed border-divider">
                  No notes saved yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-3 p-0 m-0 list-none">
                  {notes.map((n) => {
                    const canEdit = isAdmin || n.authorId === currentUserId;
                    const wasEdited =
                      n.updatedAt &&
                      new Date(n.updatedAt).getTime() !==
                        new Date(n.createdAt).getTime();
                    const isEditing = editingNoteId === n.id;

                    return (
                      <li
                        key={n.id}
                        className="rounded-xl border border-divider bg-surface-secondary/20 px-4 py-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
                            {n.authorUsername ?? n.authorId.slice(0, 8)} ·{" "}
                            {new Date(n.createdAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                            {wasEdited ? " · edited" : ""}
                          </p>
                          {canEdit && !isEditing ? (
                            <Button
                              variant="secondary"
                              className="h-6 px-2 rounded-lg border border-divider text-[10px] font-bold shrink-0"
                              onPress={() => startEditNote(n)}
                            >
                              Edit
                            </Button>
                          ) : null}
                        </div>

                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            {editError ? (
                              <p
                                className="text-xs text-rose-500 font-semibold"
                                role="alert"
                              >
                                {editError}
                              </p>
                            ) : null}
                            <TextField
                              value={editDraft}
                              onChange={setEditDraft}
                              aria-label="Edit interview note input"
                            >
                              <TextArea className="min-h-[8rem] w-full rounded-xl border border-divider bg-surface-secondary/20 p-3 text-xs outline-none focus:border-accent" />
                            </TextField>
                            <div className="flex gap-2">
                              <Button
                                variant="primary"
                                className="h-8 px-3 rounded-lg bg-accent text-white text-xs font-bold"
                                isDisabled={editBusy}
                                onPress={() => void saveEditedNote()}
                              >
                                {editBusy ? "Saving…" : "Save"}
                              </Button>
                              <Button
                                variant="secondary"
                                className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
                                isDisabled={editBusy}
                                onPress={cancelEditNote}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-foreground font-medium">
                            {n.body}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Add a note after interview"
            description="Write in Vietnamese or English; the evaluation follows your language. Save a note on its own, or type and use “Regenerate” to save that text and create the PDF in one step."
          >
            <div className="flex flex-col gap-3 pt-2">
              {error ? (
                <p className="text-xs text-rose-500 font-semibold" role="alert">
                  {error}
                </p>
              ) : null}
              <TextField
                value={draftNote}
                onChange={setDraftNote}
                aria-label="New interview note input"
              >
                <TextArea
                  placeholder="Strengths, concerns, recommendation, scores, etc."
                  className="min-h-[10rem] w-full rounded-xl border border-divider bg-surface-secondary/20 p-3 text-xs outline-none focus:border-accent"
                />
              </TextField>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
                  isDisabled={notesBusy}
                  onPress={() => void saveNoteOnly()}
                >
                  {notesBusy ? "Saving…" : "Save note"}
                </Button>
                <Button
                  variant="primary"
                  className="h-8 px-4 rounded-lg bg-accent text-white text-xs font-bold"
                  isDisabled={evalBusy}
                  onPress={() => void regenerateEvaluation()}
                >
                  {evalBusy ? "Generating…" : "Regenerate evaluation PDF"}
                </Button>
                <Button
                  variant="secondary"
                  className="h-8 px-3 rounded-lg border border-divider text-xs font-bold"
                  onPress={() =>
                    router.push(`/admin/jd/${jobDescriptionId}/pipeline`)
                  }
                >
                  Back to pipeline
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>{/* end right panel */}
      </div>{/* end split row */}
    </div>
  );
}
