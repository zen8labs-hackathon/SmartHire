"use client";

/**
 * Text input that accepts typed values and offers a list of suggestions.
 * The value is a number; `parse` turns typed text into it (null = invalid) and
 * `format` turns it back for display, so "930" settles to "09:30" on blur.
 */
import React from "react";
import { Input } from "@/app/admin/position-management-2/ext";
import "@/app/admin/calendar-2/cal.css";

export type ComboOption = { value: number; label: string };

export function ComboField({ label, value, options, parse, format, invalidText, placeholder, onChange, onValidity }: {
  label: string;
  value: number;
  options: ComboOption[];
  parse: (text: string) => number | null;
  format: (value: number) => string;
  invalidText: string;
  placeholder?: string;
  onChange: (value: number) => void;
  /** Reports whether the typed text is currently usable. */
  onValidity?: (ok: boolean) => void;
}) {
  const [text, setText] = React.useState(() => format(value));
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const menu = React.useRef<HTMLDivElement>(null);
  const parsed = parse(text);
  const invalid = text.trim() !== "" && parsed == null;
  const bad = parsed == null;

  // Follow outside changes (a suggested time chip, the dialog resetting).
  React.useEffect(() => {
    setText((t) => (parse(t) === value ? t : format(value)));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { onValidity?.(!bad); }, [bad]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return;
    const i = options.findIndex((o) => o.value === value);
    setActive(i);
    menu.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (o: ComboOption) => { setText(format(o.value)); onChange(o.value); setOpen(false); };
  const settle = () => {
    setOpen(false);
    if (parsed != null) setText(format(parsed));
  };

  return (
    <div className="cl-pick">
      <Input label={label} value={text} placeholder={placeholder} autoComplete="off" role="combobox"
        aria-expanded={open} aria-autocomplete="list" error={invalid ? invalidText : undefined}
        onChange={(e) => {
          const n = parse(e.target.value);
          // "2pm" is complete once it parses: show it straight away as 14:00.
          setText(n != null && /[ap]m$/i.test(e.target.value.trim()) ? format(n) : e.target.value);
          setOpen(true);
          setActive(-1); // Enter now settles the typed text, not a stale highlighted row
          if (n != null) onChange(n);
        }}
        onFocus={(e) => { e.target.select(); setOpen(true); }}
        onBlur={settle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            const next = Math.max(0, Math.min(options.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
            setActive(next);
            menu.current?.children[next]?.scrollIntoView({ block: "nearest" });
          } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === "Enter") {
            settle();
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }} />
      {open && options.length > 0 && (
        <div className="cl-pmenu cl-cmenu" role="listbox" ref={menu}>
          {options.map((o, i) => (
            <button type="button" role="option" key={o.value} aria-selected={o.value === value}
              className={i === active ? "is-active" : undefined}
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
