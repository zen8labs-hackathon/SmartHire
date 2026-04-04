"use client";

import { useCallback, useEffect, useState } from "react";

import { parseViewerEmailInput } from "@/lib/admin/jd-viewer-sync";
import { normalizeEmail } from "@/lib/auth/email";
import { Input, Label, TextField } from "@heroui/react";

export function appendEmailToViewerDraft(draft: string, email: string): string {
  const e = normalizeEmail(email);
  const existing = new Set(parseViewerEmailInput(draft));
  if (existing.has(e)) return draft;
  return draft.trim() ? `${draft.trim()}\n${e}` : e;
}

export function JdViewerEmailSearch({
  getHeaders,
  onPickEmail,
}: {
  getHeaders: () => Promise<Record<string, string>>;
  onPickEmail: (email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ email: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const headers = await getHeaders();
          const res = await fetch(
            `/api/admin/accounts/search?q=${encodeURIComponent(q)}`,
            { credentials: "include", headers },
          );
          const json = (await res.json()) as {
            accounts?: { email: string }[];
          };
          if (!res.ok) {
            setSuggestions([]);
            return;
          }
          setSuggestions(json.accounts ?? []);
        } catch {
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 320);
    return () => window.clearTimeout(timer);
  }, [query, getHeaders]);

  const pick = useCallback(
    (email: string) => {
      onPickEmail(normalizeEmail(email));
      setQuery("");
      setSuggestions([]);
      setMenuOpen(false);
    },
    [onPickEmail],
  );

  const showMenu =
    menuOpen && query.trim().length >= 2 && (loading || suggestions.length > 0);

  return (
    <div className="relative">
      <TextField
        value={query}
        onChange={(v) => {
          setQuery(v);
          setMenuOpen(true);
        }}
      >
        <Label className="text-xs text-muted">Search accounts by email</Label>
        <Input
          placeholder="Type part of an email…"
          autoComplete="off"
          onFocus={() => setMenuOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setMenuOpen(false), 200);
          }}
        />
      </TextField>
      {showMenu ? (
        <ul
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-divider bg-surface-secondary py-1 text-left shadow-lg"
          role="listbox"
        >
          {loading ? (
            <li className="px-3 py-2 text-xs text-muted">Searching…</li>
          ) : null}
          {!loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No matches</li>
          ) : null}
          {suggestions.map((s) => (
            <li key={s.email}>
              <button
                type="button"
                role="option"
                className="w-full px-3 py-2 text-left text-xs font-mono text-foreground hover:bg-surface-tertiary"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.email)}
              >
                {s.email}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
