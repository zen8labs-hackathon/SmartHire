"use client";

import { useEffect, useState } from "react";
import { Input, Label, TextField } from "@heroui/react";

interface EmailListInputProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  inputClassName?: string;
}

export function EmailListInput({
  value,
  onChange,
  disabled,
  label,
  placeholder,
  inputClassName,
}: EmailListInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<{ email: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeToken, setActiveToken] = useState("");

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const tokens = inputValue.split(",");
    const currentToken = (tokens[tokens.length - 1] || "").trim();

    if (currentToken.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setActiveToken("");
      return;
    }

    setActiveToken(currentToken);
    setLoading(true);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/admin/accounts/search?q=${encodeURIComponent(currentToken)}`,
            { credentials: "include" }
          );
          if (!res.ok) {
            setSuggestions([]);
            return;
          }
          const json = (await res.json()) as { accounts?: { email: string }[] };
          setSuggestions(json.accounts ?? []);
        } catch {
          setSuggestions([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [inputValue]);

  const handlePick = (email: string) => {
    const tokens = inputValue.split(",");
    tokens[tokens.length - 1] = ` ${email}`;
    const newValue = tokens
      .map((t) => t.trim())
      .filter(Boolean)
      .join(", ");

    const finalValue = newValue ? `${newValue}, ` : "";
    onChange(finalValue);
    setInputValue(finalValue);
    setSuggestions([]);
    setMenuOpen(false);
  };

  const showMenu = menuOpen && activeToken.length >= 2 && (loading || suggestions.length > 0);

  return (
    <div className="relative w-full flex flex-col gap-1">
      <TextField value={inputValue} onChange={(val) => {
        setInputValue(val);
        onChange(val);
        setMenuOpen(true);
      }} isDisabled={disabled}>
        <Label className="text-xs font-semibold text-muted">{label}</Label>
        <Input
          className={inputClassName || "mt-1 h-9 w-full rounded-xl border border-divider bg-surface-primary px-3 text-sm focus:border-accent outline-none animate-in fade-in"}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setMenuOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setMenuOpen(false), 200);
          }}
        />
      </TextField>
      {showMenu ? (
        <ul
          className="absolute z-30 top-full left-0 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-divider bg-surface-primary py-1 text-left shadow-2xl animate-in fade-in zoom-in-95 duration-100"
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
                aria-selected={false}
                className="w-full px-3 py-1.5 text-left text-xs font-mono text-foreground hover:bg-surface-secondary"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePick(s.email)}
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
