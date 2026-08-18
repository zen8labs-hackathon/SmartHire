"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "react-aria-components";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TiptapImage from "@tiptap/extension-image";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import {
  Table as TiptapTable,
  TableCell as TiptapTableCell,
  TableHeader as TiptapTableHeader,
  TableRow as TiptapTableRow,
} from "@tiptap/extension-table";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Palette,
  Quote,
  Redo,
  Rows3,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo,
  Variable,
} from "lucide-react";

/**
 * Email-safe font stacks only -- no client-installed/web fonts, since most
 * mail clients fall back silently rather than error. The blank/unset entry
 * is labeled "Arial" (not "Default") because that's the actual font the sent
 * email renders with when nothing is explicitly set -- `wrapEmailBodyInCard`
 * hard-codes `font-family:Arial,Helvetica,sans-serif` on the body `<td>` --
 * so the dropdown always shows a real font name instead of a vague label.
 */
const FONT_FAMILY_OPTIONS = [
  { value: "", label: "Arial" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet MS" },
];

/** Blank/unset entry is labeled "14" for the same reason as FONT_FAMILY_OPTIONS -- matches `wrapEmailBodyInCard`'s hard-coded `font-size:14px`. */
const FONT_SIZE_OPTIONS = [
  { value: "", label: "14" },
  { value: "12px", label: "12" },
  { value: "16px", label: "16" },
  { value: "18px", label: "18" },
  { value: "20px", label: "20" },
  { value: "24px", label: "24" },
  { value: "32px", label: "32" },
];

const TEXT_COLOR_SWATCHES = [
  "#111111",
  "#6b7280",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
];

export type EmailPlaceholder = { key: string; label: string };

export function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-accent/15 text-accent" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-divider" />;
}

/**
 * Toolbar button that opens a small floating panel below it (URL entry for
 * link/image, the variable picker) instead of acting immediately.
 *
 * Uses `react-aria-components`' own standalone `Popover` (the same overlay
 * primitive HeroUI's `Select.Popover` is built on) anchored to the button via
 * `triggerRef`, rather than a hand-rolled `position: fixed`/`createPortal`
 * panel. This editor is almost always embedded in a modal: a manually
 * portaled panel ends up a DOM *sibling* of the modal's own dialog subtree
 * (also portaled to `document.body`), so the modal's outside-click dismissal
 * treats any click inside the panel -- including just scrolling it -- as
 * "outside" and closes the whole modal. RAC's `Popover` instead registers
 * with the same shared overlay stack the `Modal` uses, so nested overlays are
 * recognized as *inside* the interaction, get proper scroll/focus handling,
 * and it collision-detects the viewport on its own instead of needing manual
 * clamped coordinates.
 */
export function ToolbarPopover({
  label,
  icon,
  disabled,
  panel,
}: {
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  panel: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={triggerRef} className="relative">
      <ToolbarButton label={label} active={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {icon}
      </ToolbarButton>
      <Popover
        triggerRef={triggerRef}
        isOpen={open}
        onOpenChange={setOpen}
        offset={4}
        className="w-64 rounded-xl border border-divider bg-surface-primary p-2.5 shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-100"
      >
        {panel(() => setOpen(false))}
      </Popover>
    </div>
  );
}

const popoverInputClass =
  "h-8 w-full rounded-lg border border-divider bg-surface-primary px-2.5 text-xs outline-none focus:border-accent";

function LinkPanel({ editor, close }: { editor: Editor; close: () => void }) {
  const [url, setUrl] = useState<string>(() => (editor.getAttributes("link").href as string) ?? "");
  const hasLink = editor.isActive("link");

  const apply = () => {
    const trimmed = url.trim();
    if (trimmed) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    close();
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          } else if (e.key === "Escape") {
            close();
          }
        }}
        placeholder="https://…"
        className={popoverInputClass}
      />
      <div className="flex items-center justify-end gap-1.5">
        {hasLink ? (
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              close();
            }}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/10"
          >
            Remove
          </button>
        ) : null}
        <button
          type="button"
          onClick={apply}
          className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground hover:opacity-90"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function ImagePanel({ editor, close }: { editor: Editor; close: () => void }) {
  const [url, setUrl] = useState("");

  const apply = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    editor.chain().focus().setImage({ src: trimmed }).run();
    close();
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          } else if (e.key === "Escape") {
            close();
          }
        }}
        placeholder="https://example.com/image.png"
        className={popoverInputClass}
      />
      <p className="text-[10px] leading-normal text-muted">
        Paste a publicly hosted image URL — inline file uploads aren't supported here.
      </p>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={apply}
          disabled={!url.trim()}
          className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Insert
        </button>
      </div>
    </div>
  );
}

function ColorPanel({ editor, close }: { editor: Editor; close: () => void }) {
  const current = (editor.getAttributes("textStyle").color as string) ?? "#111111";

  const apply = (color: string) => {
    editor.chain().focus().setColor(color).run();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-8 gap-1.5">
        {TEXT_COLOR_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            title={color}
            onClick={() => {
              apply(color);
              close();
            }}
            className="h-6 w-6 rounded-full border border-divider/60"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={current}
          onChange={(e) => apply(e.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-divider bg-transparent p-0.5"
        />
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().unsetColor().run();
            close();
          }}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-danger hover:bg-danger/10"
        >
          Clear color
        </button>
        <button
          type="button"
          onClick={close}
          className="ml-auto rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground hover:opacity-90"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * None of `@tiptap/extension-table`'s nodes preserve an element's raw `style`
 * (or the legacy `role`/`width`/`cellpadding`/`cellspacing` attributes) --
 * only `colspan`/`rowspan`/`colwidth`/`align` round-trip by default. Custom
 * email layouts are authored as Outlook-safe `<table>` markup with inline
 * styles on every element (see lib/email/email-layout.ts's docblock), so
 * without this passthrough, editing a pasted/typed table layout here would
 * silently strip every `style="..."` on save.
 */
function passthroughAttribute(name: string) {
  return {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute(name),
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes[name];
      return value ? { [name]: value } : {};
    },
  };
}

const EmailLayoutTable = TiptapTable.extend({
  addAttributes() {
    return {
      style: passthroughAttribute("style"),
      role: passthroughAttribute("role"),
      width: passthroughAttribute("width"),
      align: passthroughAttribute("align"),
      cellpadding: passthroughAttribute("cellpadding"),
      cellspacing: passthroughAttribute("cellspacing"),
    };
  },
}).configure({ resizable: false });

const EmailLayoutTableRow = TiptapTableRow.extend({
  addAttributes() {
    return { style: passthroughAttribute("style") };
  },
});

// `align` intentionally dropped from the base TableCell/TableHeader attrs --
// its renderHTML also writes a `style="text-align:..."` attribute, which
// would collide with (and unpredictably overwrite or be overwritten by) the
// raw `style` passthrough below. Since `style` now owns that DOM attribute
// entirely, text alignment is just part of whatever style string is typed.
const EmailLayoutTableCell = TiptapTableCell.extend({
  addAttributes() {
    return {
      colspan: { default: 1 },
      rowspan: { default: 1 },
      style: passthroughAttribute("style"),
    };
  },
});

const EmailLayoutTableHeader = TiptapTableHeader.extend({
  addAttributes() {
    return {
      colspan: { default: 1 },
      rowspan: { default: 1 },
      style: passthroughAttribute("style"),
    };
  },
});

/**
 * Matches an opening HTML tag (e.g. `<p>`, `<a href="...">`). Used to tell
 * apart "someone pasted markup source as text" from an ordinary plain-text
 * paste, since only the former should be parsed as HTML -- see `handlePaste`
 * below.
 */
const HTML_TAG_PATTERN = /<([a-z][a-z0-9]*)\b[^>]*>/i;

/**
 * Snapshot of everything the toolbar reads from the editor -- computed once
 * per transaction via `useEditorState` (below) instead of every toolbar
 * button independently calling `editor.isActive(...)`/`getAttributes(...)`
 * inline during render. The selector itself still runs on every transaction
 * (Tiptap has no cheaper way to know in advance whether e.g. "is bold
 * active" changed), but `useEditorState` deep-compares the result and only
 * triggers a React re-render when a value in here actually differs -- so
 * moving the cursor around or clicking without changing any mark/alignment
 * no longer re-renders the whole 20+-button toolbar.
 */
type ToolbarState = {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrike: boolean;
  fontFamily: string;
  fontSize: string;
  isBulletList: boolean;
  isOrderedList: boolean;
  isBlockquote: boolean;
  isAlignLeft: boolean;
  isAlignCenter: boolean;
  isAlignRight: boolean;
  isAlignJustify: boolean;
  isTable: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

function readToolbarState(editor: Editor): ToolbarState {
  return {
    isBold: editor.isActive("bold"),
    isItalic: editor.isActive("italic"),
    isUnderline: editor.isActive("underline"),
    isStrike: editor.isActive("strike"),
    fontFamily: (editor.getAttributes("textStyle").fontFamily as string) ?? "",
    fontSize: (editor.getAttributes("textStyle").fontSize as string) ?? "",
    isBulletList: editor.isActive("bulletList"),
    isOrderedList: editor.isActive("orderedList"),
    isBlockquote: editor.isActive("blockquote"),
    isAlignLeft: editor.isActive({ textAlign: "left" }),
    isAlignCenter: editor.isActive({ textAlign: "center" }),
    isAlignRight: editor.isActive({ textAlign: "right" }),
    isAlignJustify: editor.isActive({ textAlign: "justify" }),
    isTable: editor.isActive("table"),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

/**
 * Tiptap-backed rich text editor for email body fields. Stores and emits
 * HTML (matching `email_templates.body_template` / `email_messages.body_html`,
 * both rendered elsewhere via `dangerouslySetInnerHTML`), so no markdown/JSON
 * conversion layer is needed at the call sites.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  placeholders,
  disabled,
  minHeightClassName = "min-h-[10rem]",
  footer,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Renders an "Insert variable" toolbar dropdown that inserts `{{key}}` at the cursor. */
  placeholders?: EmailPlaceholder[];
  disabled?: boolean;
  minHeightClassName?: string;
  /** Rendered as a bottom bar inside the editor's own card, e.g. the attachment toolbar. */
  footer?: React.ReactNode;
}) {
  // Tracks the HTML this component itself last emitted via `onChange`, so
  // the sync effect below can tell "the `value` prop changed because *we*
  // typed it" (skip) apart from "changed because the *caller* set new
  // content" (template pick, reply prefill -- apply it). Comparing directly
  // against a freshly recomputed `editor.getHTML()` instead breaks the
  // moment any caller-provided HTML doesn't byte-for-byte match Tiptap's own
  // canonical re-serialization of it (e.g. attribute order, self-closing
  // tags): every keystroke after that point re-triggers `setContent`,
  // resetting the cursor position and any in-progress marks/toolbar state --
  // the "toolbar resets while typing / when clearing all text" symptom.
  const lastEmittedHtmlRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      TiptapImage,
      TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
      TextAlign.configure({ types: ["paragraph", "heading"] }),
      EmailLayoutTable,
      EmailLayoutTableRow,
      EmailLayoutTableHeader,
      EmailLayoutTableCell,
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedHtmlRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: `email-html-preview max-w-none px-3 py-2 text-foreground ${minHeightClassName} focus:outline-none`,
      },
      // Rich-copy from a webpage/Word doc already carries a `text/html`
      // clipboard entry, which Tiptap parses natively -- untouched here.
      // This only kicks in when the clipboard has no `text/html` payload
      // but the plain text itself looks like HTML source (e.g. pasted from
      // a code snippet or an AI-generated template): without this, that
      // text would be inserted as literal, escaped tag characters instead
      // of being rendered.
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData || clipboardData.getData("text/html")) return false;
        const text = clipboardData.getData("text/plain");
        if (!text || !HTML_TAG_PATTERN.test(text)) return false;

        event.preventDefault();
        const dom = new window.DOMParser().parseFromString(text, "text/html");
        const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
        const slice = parser.parseSlice(dom.body, { preserveWhitespace: false });
        view.dispatch(view.state.tr.replaceSelection(slice));
        return true;
      },
    },
  });

  // Keep the editor in sync when `value` changes from outside (e.g. picking
  // a template auto-fills the body) without fighting the user's own typing --
  // only push external changes down when they actually differ from the HTML
  // this component itself last produced (see `lastEmittedHtmlRef` above).
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedHtmlRef.current) {
      lastEmittedHtmlRef.current = value;
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // Toolbar buttons/selects need to reflect `editor.isActive(...)` /
  // `getAttributes(...)`, which can change on any transaction -- not just
  // doc-changing keystrokes (`onUpdate` above), but also selection-only
  // transactions like moving the cursor into a colored/aligned region or
  // toggling a mark with nothing selected. `useEditorState` re-runs
  // `readToolbarState` on every transaction but only re-renders this
  // component when the result actually differs (deep-equal by default),
  // instead of unconditionally force-rendering the whole toolbar on every
  // cursor move/click the way a raw `editor.on("transaction", ...)`
  // subscription would.
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? readToolbarState(editor) : null),
  });

  if (!editor || !toolbarState) return null;

  return (
    <div className="rounded-xl border border-divider bg-surface-primary">
      <div className="flex flex-wrap items-center gap-0 border-b border-divider px-1.5 py-1">
        <ToolbarButton
          label="Bold"
          active={toolbarState.isBold}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={toolbarState.isItalic}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={toolbarState.isUnderline}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={toolbarState.isStrike}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarPopover
          label="Text color"
          disabled={disabled}
          icon={<Palette className="h-3.5 w-3.5" />}
          panel={(close) => <ColorPanel editor={editor} close={close} />}
        />

        <select
          aria-label="Font family"
          disabled={disabled}
          value={toolbarState.fontFamily}
          onChange={(e) => {
            const val = e.target.value;
            if (val) {
              editor.chain().focus().setFontFamily(val).run();
            } else {
              editor.chain().focus().unsetFontFamily().run();
            }
          }}
          className="h-7 max-w-[6.5rem] rounded-lg border-none bg-surface-secondary/40 px-1.5 text-[11px] font-medium text-muted outline-none hover:bg-surface-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {FONT_FAMILY_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Font size"
          disabled={disabled}
          value={toolbarState.fontSize}
          onChange={(e) => {
            const val = e.target.value;
            if (val) {
              editor.chain().focus().setFontSize(val).run();
            } else {
              editor.chain().focus().unsetFontSize().run();
            }
          }}
          className="h-7 w-14 rounded-lg border-none bg-surface-secondary/40 px-1.5 text-[11px] font-medium text-muted outline-none hover:bg-surface-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {FONT_SIZE_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <ToolbarDivider />

        <ToolbarButton
          label="Bullet list"
          active={toolbarState.isBulletList}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={toolbarState.isOrderedList}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={toolbarState.isBlockquote}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Align left"
          // Left is the unset/browser default -- no explicit `textAlign` attribute is
          // written unless the user picks center/right/justify (see TextAlign's
          // `defaultAlignment: null` above, which keeps untouched paragraphs free of a
          // redundant `style="text-align: left"`). This button still needs to *show* as
          // selected in that default state, so "active" also covers "no alignment set".
          active={
            toolbarState.isAlignLeft ||
            (!toolbarState.isAlignCenter &&
              !toolbarState.isAlignRight &&
              !toolbarState.isAlignJustify)
          }
          disabled={disabled}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Align center"
          active={toolbarState.isAlignCenter}
          disabled={disabled}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          active={toolbarState.isAlignRight}
          disabled={disabled}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Justify"
          active={toolbarState.isAlignJustify}
          disabled={disabled}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Insert table"

          disabled={disabled || toolbarState.isTable}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 1, withHeaderRow: false }).run()
          }
        >
          <TableIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        {toolbarState.isTable ? (
          <>
            <ToolbarButton
              label="Add row below"
              disabled={disabled}
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              label="Add column right"
              disabled={disabled}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <Columns3 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              label="Delete table"
              disabled={disabled}
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </ToolbarButton>
          </>
        ) : null}

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
                        editor.chain().focus().insertContent(`{{${p.key}}}`).run();
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

        <ToolbarPopover
          label="Insert link"
          disabled={disabled}
          icon={<LinkIcon className="h-3.5 w-3.5" />}
          panel={(close) => <LinkPanel editor={editor} close={close} />}
        />
        <ToolbarPopover
          label="Insert image"
          disabled={disabled}
          icon={<ImageIcon className="h-3.5 w-3.5" />}
          panel={(close) => <ImagePanel editor={editor} close={close} />}
        />
        
        <ToolbarDivider />

        <ToolbarButton
          label="Undo"
          disabled={disabled || !toolbarState.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={disabled || !toolbarState.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="h-3.5 w-3.5" />
        </ToolbarButton>

        
      </div>
      <EditorContent editor={editor} />
      {footer ? (
        <div className="border-t border-divider bg-surface-secondary/10 px-3 py-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
