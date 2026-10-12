"use client";

import { useCallback, useState } from "react";
import { positionTitleFromFile } from "@/lib/positions/create-position";

const JSON_HEADERS = { "Content-Type": "application/json" };

export type OpenPositionInput = {
  file: File | null;
  headcount: number;
  hireType: string;
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * F1.1 create flow on top of the existing endpoints:
 * sign-upload -> PUT to storage -> POST /api/admin/job-descriptions
 * (or `blank: true` with no file). Returns the new position id.
 */
export function useOpenPosition() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (input: OpenPositionInput): Promise<string | null> => {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        headcount: input.headcount,
        hire_type: input.hireType,
      };
      let storagePath: string | null = null;

      if (input.file) {
        const file = input.file;
        const signRes = await fetch("/api/admin/job-openings/sign-upload", {
          method: "POST",
          credentials: "include",
          headers: JSON_HEADERS,
          body: JSON.stringify({ filename: file.name, mimeType: file.type || null }),
        });
        if (!signRes.ok) throw new Error(await readError(signRes, "Could not start upload."));
        const sign = (await signRes.json()) as { path?: string; signedUrl?: string };
        if (!sign.path || !sign.signedUrl) throw new Error("Could not start upload.");
        const put = await fetch(sign.signedUrl, {
          method: "PUT",
          body: file,
          headers: file.type ? { "Content-Type": file.type } : undefined,
        });
        if (!put.ok) throw new Error("Could not upload file to storage.");
        storagePath = sign.path;
        body.position = positionTitleFromFile(file.name);
        body.jdStoragePath = sign.path;
        body.jdOriginalFilename = file.name;
        body.jdMimeType = file.type || null;
      } else {
        body.blank = true;
      }

      const res = await fetch("/api/admin/job-descriptions", {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not create the position."));
      const json = (await res.json()) as { jobDescription?: { id?: string } };
      const id = json.jobDescription?.id ?? null;

      // Best-effort AI prefill; background processing is owned by F1.2.
      if (storagePath) {
        void fetch("/api/admin/job-descriptions/extract", {
          method: "POST",
          credentials: "include",
          headers: JSON_HEADERS,
          body: JSON.stringify({ storagePath }),
        }).catch(() => {});
      }
      return id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the position.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submit, submitting, error, clearError: () => setError(null) };
}
