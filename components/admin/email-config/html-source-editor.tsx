"use client";

import { useEffect, useRef } from "react";
import { Table as TableIcon, Variable } from "lucide-react";

import {
  ToolbarButton,
  ToolbarDivider,
  ToolbarPopover,
  type EmailPlaceholder,
} from "@/components/admin/email-config/rich-text-editor";

const TABLE_SNIPPET = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <tr>
    <td style="padding:16px;">

    </td>
  </tr>
</table>`;

/**
 * Same toolbar chrome as `RichTextEditor` (reuses its `ToolbarButton`/
 * `ToolbarDivider`/`ToolbarPopover` primitives), but backed by a plain
 * `<textarea>` instead of Tiptap -- for HTML that must survive byte-for-byte
 * (comments, exact color syntax), which a WYSIWYG that parses into a
 * ProseMirror document and re-serializes cannot guarantee. See
 * lib/email/email-layout.ts's custom layout field: verified empirically that
 * routing raw layout HTML through Tiptap drops `<!--[if mso]>` conditional
 * comments entirely and rewrites hex colors to `rgb()`.
 *
 * Toolbar actions insert literal text at the cursor rather than mutating a
 * document model, so nothing here can reshape or drop markup the user typed.
 */
export function HtmlSourceEditor({
  value,
  onChange,
  placeholder,
  placeholders,
  disabled,
  minHeightClassName = "min-h-[10rem]",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Renders an "Insert variable" toolbar dropdown that inserts `{{key}}` at the cursor. */
  placeholders?: EmailPlaceholder[];
  disabled?: boolean;
  minHeightClassName?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<number | null>(null);

  // Restores cursor position after a toolbar-driven insertion -- can't set
  // `selectionRange` synchronously in the click handler since `value` is
  // controlled and the DOM hasn't re-rendered with the new text yet.
  useEffect(() => {
    const pos = pendingSelectionRef.current;
    if (pos === null) return;
    pendingSelectionRef.current = null;
    const el = textareaRef.current;
    if (!el) return;
    // `preventScroll` -- plain `.focus()` makes the browser scroll the
    // textarea into view, which visibly jumps the whole settings page down
    // every time a toolbar button inserts something. The textarea is
    // already visible (that's how the user clicked the toolbar above it),
    // so there's nothing to scroll to.
    el.focus({ preventScroll: true });
    el.setSelectionRange(pos, pos);
  }, [value]);

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    pendingSelectionRef.current = start + snippet.length;
    onChange(value.slice(0, start) + snippet + value.slice(end));
  };

  return (
    <div className="rounded-xl border border-divider bg-surface-primary">
      <div className="flex flex-wrap items-center gap-0 border-b border-divider px-1.5 py-1">
        <ToolbarButton
          label="Insert table skeleton"
          disabled={disabled}
          onClick={() => insertAtCursor(TABLE_SNIPPET)}
        >
          <TableIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        {placeholders && placeholders.length > 0 ? (
          <>
            <ToolbarDivider />
            <ToolbarPopover
              label="Insert variable"
              disabled={disabled}
              icon={<Variable className="h-3.5 w-3.5" />}
              panel={(close) => (
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                  {placeholders.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        insertAtCursor(`{{${p.key}}}`);
                        close();
                      }}
                      className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-surface-secondary"
                    >
                      <span className="font-mono text-[11px] text-accent">{`{{${p.key}}}`}</span>
                      <span className="text-muted">{p.label}</span>
                    </button>
                  ))}
                </div>
              )}
            />
          </>
        ) : null}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        className={`w-full resize-y rounded-b-xl bg-transparent px-3 py-2 font-mono text-xs leading-relaxed outline-none disabled:opacity-60 ${minHeightClassName}`}
      />
    </div>
  );
}
