"use client";

import { useEffect, useState } from "react";

import type { FileUploadRow } from "@/lib/db/upload-history";

export type FileUploadsStreamState = {
  rows: FileUploadRow[];
  /** True until the first snapshot (or a load error) arrives. */
  loading: boolean;
  error: string | null;
  /** Bumped on every snapshot received -- 0 means none yet. */
  snapshotCount: number;
};

/**
 * Live `file_uploads` rows for one scope (`jobId`, or `null` for the
 * job-less candidate pool) over `/api/admin/upload-files/stream`. The server
 * sends a full snapshot on connect and again whenever the scope's rows
 * change; EventSource reconnects on its own after a drop and gets a fresh
 * snapshot.
 */
export function useFileUploadsStream(
  jobId: string | null,
): FileUploadsStreamState {
  const [state, setState] = useState<FileUploadsStreamState>({
    rows: [],
    loading: true,
    error: null,
    snapshotCount: 0,
  });

  useEffect(() => {
    setState({ rows: [], loading: true, error: null, snapshotCount: 0 });
    const source = new EventSource(
      jobId
        ? `/api/admin/upload-files/stream?jobId=${encodeURIComponent(jobId)}`
        : "/api/admin/upload-files/stream",
    );

    source.addEventListener("snapshot", (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as {
          rows: FileUploadRow[];
        };
        setState((prev) => ({
          rows: payload.rows,
          loading: false,
          error: null,
          snapshotCount: prev.snapshotCount + 1,
        }));
      } catch (err) {
        console.error("[upload-files-stream] snapshot parse failed:", err);
        setState((prev) => ({ ...prev, loading: false }));
      }
    });

    source.addEventListener("load-error", (e) => {
      let error = "Could not load upload history.";
      try {
        const payload = JSON.parse((e as MessageEvent).data) as {
          error?: string;
        };
        if (payload.error) error = payload.error;
      } catch {
        // keep the generic message
      }
      setState((prev) => ({ ...prev, loading: false, error }));
    });

    // A non-200 response (e.g. 401) closes the source for good instead of
    // reconnecting -- surface it rather than spinning forever.
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Lost connection to upload progress. Reload to retry.",
        }));
      }
    };

    return () => source.close();
  }, [jobId]);

  return state;
}
