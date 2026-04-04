"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Breadcrumbs,
  Button,
  Card,
  Label,
  Separator,
  TextArea,
  TextField,
} from "@heroui/react";

import type { JobPipelineCandidateRow } from "@/lib/jd/pipeline-types";
import { createClient } from "@/lib/supabase/client";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";

type Props = {
  jobDescriptionId: number;
  jobTitle: string;
  candidate: JobPipelineCandidateRow;
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
  authorId: string;
  authorUsername: string | null;
};

export function PipelineCandidateEvaluationClient({
  jobDescriptionId,
  jobTitle,
  candidate,
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

  const authHeaders = useCallback(
    () => getSessionAuthorizationHeaders(supabase),
    [supabase],
  );

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

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

  useEffect(() => {
    void loadLatest();
    void loadNotes();
  }, [loadLatest, loadNotes]);

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

  const shareUrl =
    latest && origin ? `${origin}${latest.previewPath}` : "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Breadcrumbs className="text-xs text-muted">
        <Breadcrumbs.Item href="/admin/jd">Job descriptions</Breadcrumbs.Item>
        <Breadcrumbs.Item href={`/admin/jd/${jobDescriptionId}/pipeline`}>
          {jobTitle}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item>Evaluation</Breadcrumbs.Item>
      </Breadcrumbs>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {candidate.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Interview evaluation — {jobTitle}
        </p>
      </div>

      <Card>
        <Card.Header>
          <Card.Title>Candidate details</Card.Title>
        </Card.Header>
        <Card.Content className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted">Email</span>
            <p className="font-medium text-foreground">{candidate.email}</p>
          </div>
          <div>
            <span className="text-muted">Mobile</span>
            <p className="font-medium text-foreground">{candidate.mobile}</p>
          </div>
          <div>
            <span className="text-muted">D.O.B.</span>
            <p className="font-medium text-foreground">{candidate.dateOfBirth}</p>
          </div>
          <div>
            <span className="text-muted">Pipeline status</span>
            <p className="font-medium text-foreground">{candidate.status}</p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-muted">Education</span>
            <p className="font-medium text-foreground">
              {candidate.studentYears} · {candidate.majorSchool} · GPA{" "}
              {candidate.gpa}
            </p>
          </div>
          <div>
            <span className="text-muted">English</span>
            <p className="font-medium text-foreground">{candidate.english}</p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-muted">Skills</span>
            <p className="font-medium text-foreground">{candidate.relatedSkills}</p>
          </div>
        </Card.Content>
      </Card>

      {loadError ? (
        <p className="text-sm text-danger" role="alert">
          {loadError}
        </p>
      ) : null}

      {latest ? (
        <Card>
          <Card.Header>
            <Card.Title>Latest generated evaluation</Card.Title>
            <Card.Description>
              Generated{" "}
              {new Date(latest.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              . Add more interview notes below and regenerate to include them.
            </Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3">
            <div>
              <Label className="text-xs text-muted" id="eval-share-url-label">
                Preview link (share)
              </Label>
              <TextField
                value={shareUrl}
                isReadOnly
                className="mt-1"
                aria-labelledby="eval-share-url-label"
              >
                <TextArea className="min-h-[3rem] font-mono text-xs" />
              </TextField>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
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
                  onPress={() => {
                    window.open(latest.previewPath, "_blank", "noopener,noreferrer");
                  }}
                >
                  Open preview
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => {
                    window.open(latest.downloadUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  Download PDF
                </Button>
              </div>
            </div>
          </Card.Content>
        </Card>
      ) : null}

      <Separator />

      <Card>
        <Card.Header>
          <Card.Title>Saved interview notes</Card.Title>
          <Card.Description>
            Everyone on the hiring team can add notes. The PDF uses the combined
            notes in chronological order.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {notesLoadError ? (
            <p className="text-sm text-danger" role="alert">
              {notesLoadError}
            </p>
          ) : null}
          {notes.length === 0 ? (
            <p className="text-sm text-muted">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl border border-divider bg-surface-secondary/40 px-4 py-3 text-sm"
                >
                  <p className="text-xs text-muted">
                    {n.authorUsername ?? n.authorId.slice(0, 8)} ·{" "}
                    {new Date(n.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-foreground">
                    {n.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title id="eval-notes-heading">Add a note</Card.Title>
          <Card.Description>
            Write in Vietnamese or English; the evaluation follows your language.
            Save a note on its own, or type and use “Regenerate” to save that
            text and create the PDF in one step.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <TextField
            value={draftNote}
            onChange={setDraftNote}
            aria-labelledby="eval-notes-heading"
          >
            <TextArea
              placeholder="Strengths, concerns, recommendation, scores, etc."
              className="min-h-[10rem] w-full"
            />
          </TextField>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              isDisabled={notesBusy}
              onPress={() => void saveNoteOnly()}
            >
              {notesBusy ? "Saving…" : "Save note"}
            </Button>
            <Button
              variant="primary"
              isDisabled={evalBusy}
              onPress={() => void regenerateEvaluation()}
            >
              {evalBusy ? "Generating…" : "Regenerate evaluation PDF"}
            </Button>
            <Button
              variant="secondary"
              onPress={() => router.push(`/admin/jd/${jobDescriptionId}/pipeline`)}
            >
              Back to pipeline
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
