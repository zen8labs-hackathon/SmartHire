"use client";

import { useCallback, useEffect, useState } from "react";
import { X as XIcon } from "lucide-react";

import { isValidEmail, normalizeEmail } from "@/lib/auth/email";
import { Chip, Input, Label, TextField } from "@heroui/react";

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

/**
 * Individual JD viewers: search-and-pick an email, shown as removable chips.
 * Once added an email is a static tag (click only removes it via the ×
 * button) — it is never re-editable as free text, so a typo can't silently
 * corrupt an already-added grant.
 */
export function JdViewerEmailsField({
  emails,
  onChange,
  getHeaders,
}: {
  emails: readonly string[];
  onChange: (emails: string[]) => void;
  getHeaders: () => Promise<Record<string, string>>;
}) {
  const addEmail = useCallback(
    (raw: string) => {
      const e = normalizeEmail(raw);
      if (!e || !isValidEmail(e)) return;
      onChange(emails.includes(e) ? [...emails] : [...emails, e]);
    },
    [emails, onChange],
  );

  function removeEmail(email: string) {
    onChange(emails.filter((e) => e !== email));
  }

  return (
    <div className="space-y-2">
      <JdViewerEmailSearch getHeaders={getHeaders} onPickEmail={addEmail} />

      {emails.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-divider p-2">
          {emails.map((email) => (
            <Chip key={email} color="default" variant="soft" size="sm" className="gap-1 pr-1">
              <Chip.Label className="font-mono">{email}</Chip.Label>
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() => removeEmail(email)}
                className="rounded-full p-0.5 hover:bg-foreground/10"
              >
                <XIcon className="size-3" />
              </button>
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No individual viewers added yet.</p>
      )}
    </div>
  );
}
