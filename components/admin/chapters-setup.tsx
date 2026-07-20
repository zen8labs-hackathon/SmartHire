"use client";

import { use, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/admin/shell/cards";

export type ChapterRow = { id: string; name: string };
export type ChapterMemberRow = {
  profileId: string;
  email: string;
  role: "head" | "member";
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export function ChaptersSetup({
  chaptersPromise,
}: {
  chaptersPromise: Promise<ChapterRow[]>;
}) {
  const initialChapters = use(chaptersPromise);
  const [rows, setRows] = useState<ChapterRow[]>(initialChapters);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const addChapter = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/chapters", {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
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
  }, [newName]);

  const removeChapter = useCallback(async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${id}`, {
        method: "DELETE",
        credentials: "include",
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
  }, []);

  // --- Edit (rename) modal ---
  const editModal = useOverlayState();
  const [editingChapter, setEditingChapter] = useState<ChapterRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEdit = useCallback(
    (chapter: ChapterRow) => {
      setEditingChapter(chapter);
      setEditName(chapter.name);
      setEditError(null);
      editModal.open();
    },
    [editModal],
  );

  const saveEdit = useCallback(async () => {
    if (!editingChapter) return;
    const name = editName.trim();
    if (!name) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${editingChapter.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name }),
      });
      const json = (await res.json()) as {
        error?: string;
        chapter?: { id: string; name: string };
      };
      if (!res.ok) throw new Error(json.error ?? "Could not update chapter.");
      if (json.chapter) {
        setRows((prev) =>
          prev
            .map((r) => (r.id === json.chapter!.id ? json.chapter! : r))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      editModal.close();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not update chapter.");
    } finally {
      setEditBusy(false);
    }
  }, [editingChapter, editName, editModal]);

  // --- View details (members) modal ---
  const viewModal = useOverlayState();
  const [viewingChapter, setViewingChapter] = useState<ChapterRow | null>(null);
  const [members, setMembers] = useState<ChapterMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const openView = useCallback(
    (chapter: ChapterRow) => {
      setViewingChapter(chapter);
      viewModal.open();
    },
    [viewModal],
  );

  useEffect(() => {
    if (!viewModal.isOpen || !viewingChapter) return;
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/chapters/${viewingChapter.id}/members`,
          { credentials: "include" },
        );
        const json = (await res.json()) as {
          error?: string;
          members?: ChapterMemberRow[];
        };
        if (!res.ok) throw new Error(json.error ?? "Could not load members.");
        if (!cancelled) setMembers(json.members ?? []);
      } catch (e) {
        if (!cancelled) {
          setMembersError(
            e instanceof Error ? e.message : "Could not load members.",
          );
        }
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewModal.isOpen, viewingChapter]);

  return (
    <SectionCard>
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

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end bg-surface-primary p-4 rounded-xl border border-divider shadow-sm">
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
            className="h-9 shrink-0 px-4 rounded-xl bg-accent text-accent-foreground font-semibold text-xs transition-colors hover:bg-accent/90"
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
            <div className="overflow-hidden rounded-xl border border-divider bg-surface-secondary/15">
              {rows.map((r, idx) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between gap-3 bg-surface-primary px-4 py-3 hover:bg-surface-secondary/40 transition-colors ${
                    idx !== rows.length - 1 ? "border-b border-divider/60" : ""
                  }`}
                >
                  <span className="text-sm font-semibold text-foreground">{r.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      aria-label="View chapter details"
                      className="h-7 w-7 rounded-lg border border-divider text-muted hover:bg-surface-tertiary hover:text-foreground"
                      onPress={() => openView(r)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      aria-label="Edit chapter"
                      className="h-7 w-7 rounded-lg border border-divider text-muted hover:bg-surface-tertiary hover:text-foreground"
                      onPress={() => openEdit(r)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      aria-label="Remove chapter"
                      className="h-7 w-7 rounded-lg border border-divider text-danger hover:bg-danger/10"
                      isDisabled={deletingId === r.id}
                      onPress={() => void removeChapter(r.id)}
                    >
                      {deletingId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit (rename) modal */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={editModal.isOpen}
        onOpenChange={editModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-sm overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading>Rename chapter</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4 px-6 py-5">
              {editError ? (
                <Alert status="danger" className="rounded-xl">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{editError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              <TextField
                value={editName}
                onChange={setEditName}
                validate={(v) => {
                  const t = v.trim();
                  if (!t) return "Name is required.";
                  if (t.length > 120) return "Max 120 characters.";
                  return null;
                }}
              >
                <Label className="text-xs font-semibold text-muted mb-1.5 block">Chapter name</Label>
                <Input
                  className="w-full h-9 rounded-xl border border-divider bg-surface-primary px-3 text-xs focus:border-accent outline-none"
                  autoFocus
                />
                <FieldError className="text-[10px] text-rose-500 mt-1" />
              </TextField>
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs font-semibold"
                onPress={() => editModal.close()}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="text-xs font-semibold"
                isDisabled={editBusy || !editName.trim()}
                onPress={() => void saveEdit()}
              >
                {editBusy ? "Saving…" : "Save changes"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* View details (members) modal */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={viewModal.isOpen}
        onOpenChange={viewModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading>{viewingChapter?.name}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3 px-6 py-5 max-h-[60vh] overflow-y-auto">
              {membersError ? (
                <Alert status="danger" className="rounded-xl">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{membersError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : membersLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading members…
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center bg-surface-secondary/20 rounded-xl border border-dashed border-divider">
                  No members in this chapter yet.
                </p>
              ) : (
                <ul className="flex list-none flex-col gap-2 p-0 m-0">
                  {members.map((m) => (
                    <li
                      key={m.profileId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-divider bg-surface-secondary/20 px-3.5 py-2.5"
                    >
                      <span className="text-sm font-medium text-foreground font-mono truncate">
                        {m.email}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          m.role === "head"
                            ? "bg-emerald-500 text-white"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {m.role === "head" ? "Head" : "Member"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Modal.Body>
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs font-semibold"
                onPress={() => viewModal.close()}
              >
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </SectionCard>
  );
}
