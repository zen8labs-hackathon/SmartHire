"use client";

import { use, useCallback, useState } from "react";
import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, FieldError, Input, Label, TextField } from "@heroui/react";
import { SectionCard } from "@/components/admin/shell/cards";

export type ChapterRow = { id: string; name: string };

export function ChaptersSetup({
  chaptersPromise,
}: {
  chaptersPromise: Promise<ChapterRow[]>;
}) {
  const initialChapters = use(chaptersPromise);
  const supabase = createClient();
  const [rows, setRows] = useState<ChapterRow[]>(initialChapters);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const h = await getSessionAuthorizationHeaders(supabase);
    return { "Content-Type": "application/json", ...h };
  }, [supabase]);

  const addChapter = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/chapters", {
        method: "POST",
        credentials: "include",
        headers: await authHeaders(),
        body: JSON.stringify({ name }),
      });
      const json = (await res.json()) as {
        error?: string;
        chapter?: { id: string; name: string };
      };
      if (!res.ok) throw new Error(json.error ?? "Could not add chapter.");
      if (json.chapter) {
        setRows((prev) =>
          [...prev, { id: json.chapter!.id, name: json.chapter!.name }].sort(
            (a, b) => a.name.localeCompare(b.name),
          ),
        );
        setNewName("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add chapter.");
    } finally {
      setBusy(false);
    }
  }, [authHeaders, newName]);

  const removeChapter = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/chapters/${id}`, {
          method: "DELETE",
          credentials: "include",
          headers: await authHeaders(),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Could not delete chapter.");
        }
        setRows((prev) => prev.filter((r) => r.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete chapter.");
      } finally {
        setDeletingId(null);
      }
    },
    [authHeaders],
  );

  return (
    <SectionCard title="Manage Chapters" description="List of currently active departments and the creation form.">
      <div className="flex flex-col gap-5">
        {error ? (
          <Alert status="danger" className="rounded-xl">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Error</Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end bg-surface-secondary/20 p-4 rounded-xl border border-divider">
          <TextField
            className="min-w-0 flex-1"
            value={newName}
            onChange={setNewName}
            validate={(v) => {
              const t = v.trim();
              if (t.length > 120) return "Max 120 characters.";
              return null;
            }}
          >
            <Label className="text-xs font-semibold text-muted mb-1.5 block">New chapter name</Label>
            <Input
              placeholder="e.g. Engineering"
              className="w-full h-9 rounded-xl border border-divider bg-surface-primary px-3 text-xs focus:border-accent outline-none"
            />
            <FieldError className="text-[10px] text-rose-500 mt-1" />
          </TextField>
          <Button
            variant="primary"
            className="h-9 shrink-0 px-4 rounded-xl bg-accent text-white font-semibold text-xs transition-colors hover:bg-accent/90"
            isDisabled={busy || !newName.trim()}
            onPress={() => void addChapter()}
          >
            {busy ? "Adding…" : "Add Chapter"}
          </Button>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
            Existing Chapters
          </h4>
          {rows.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center bg-surface-secondary/20 rounded-xl border border-dashed border-divider">
              No chapters registered yet.
            </p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0 m-0">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-divider bg-surface-secondary/20 px-4 py-3 hover:bg-surface-secondary/40 transition-colors"
                >
                  <span className="text-sm font-semibold text-foreground">{r.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-3 rounded-lg border border-divider text-xs font-bold text-danger hover:bg-danger/10"
                    isDisabled={deletingId === r.id}
                    onPress={() => void removeChapter(r.id)}
                  >
                    {deletingId === r.id ? "Removing…" : "Remove"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
