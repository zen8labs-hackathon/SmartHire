"use client";

import { useCallback, useState } from "react";

import { getSessionAuthorizationHeaders } from "@/lib/supabase/session-auth-headers";
import { createClient } from "@/lib/supabase/client";
import {
  Alert,
  Button,
  Card,
  FieldError,
  Input,
  Label,
  TextField,
} from "@heroui/react";

export type ChapterRow = { id: string; name: string };

export function ChaptersSetup({ initialChapters }: { initialChapters: ChapterRow[] }) {
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
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Card>
        <Card.Header>
          <Card.Title>Chapters</Card.Title>
          <Card.Description>
            Define recruiting chapters. Assign them to users and to job descriptions
            (whole-chapter viewer access).
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {error ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Error</Alert.Title>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
              <Label>New chapter name</Label>
              <Input placeholder="e.g. Engineering" />
              <FieldError />
            </TextField>
            <Button
              variant="primary"
              className="shrink-0"
              isDisabled={busy || !newName.trim()}
              onPress={() => void addChapter()}
            >
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Existing chapters
            </p>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No chapters yet.</p>
            ) : (
              <ul className="mt-2 flex list-none flex-col gap-2">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-divider px-3 py-2"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {r.name}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
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
        </Card.Content>
      </Card>
    </div>
  );
}
