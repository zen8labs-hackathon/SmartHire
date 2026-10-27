import { describe, expect, it } from "vitest";
import { renderToStaticMarkup as html } from "react-dom/server";
import {
  AsyncStatusChip,
  Banner,
  BoardCard,
  BulkActionBar,
  ConditionChips,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  asyncLabel,
} from "./index";
import { Plus } from "lucide-react";

const noop = () => {};

describe("F0.3 component a11y markup", () => {
  it("IconButton exposes its label as the accessible name", () => {
    expect(html(<IconButton label="Add" icon={Plus} />)).toContain('aria-label="Add"');
  });

  it("Banner announces danger/warning as alert and others as status", () => {
    expect(html(<Banner tone="danger">x</Banner>)).toContain('role="alert"');
    expect(html(<Banner tone="info">x</Banner>)).toContain('role="status"');
  });

  it("ErrorState is an alert, EmptyState is not", () => {
    expect(html(<ErrorState title="t" />)).toContain('role="alert"');
    expect(html(<EmptyState title="t" />)).not.toContain('role="alert"');
  });

  it("ConfirmDialog renders nothing when closed, alertdialog with labels when open", () => {
    const closed = html(<ConfirmDialog open={false} title="T" consequence="c" confirmLabel="Go" onConfirm={noop} onCancel={noop} />);
    expect(closed).toBe("");
    const open = html(<ConfirmDialog open title="Delete?" consequence="Cannot be undone" confirmLabel="Delete" destructive onConfirm={noop} onCancel={noop} />);
    expect(open).toContain('role="alertdialog"');
    expect(open).toContain('aria-modal="true"');
    expect(open).toMatch(/aria-labelledby="[^"]+"/);
    expect(open).toMatch(/aria-describedby="[^"]+"/);
    expect(open).toContain("Cannot be undone");
  });

  it("AsyncStatusChip uses specific wording and alerts on failure", () => {
    expect(asyncLabel("pdf", "failed", "template missing")).toBe("PDF failed: template missing");
    expect(asyncLabel("upload", "queued")).toBe("Queued");
    expect(html(<AsyncStatusChip kind="extraction" state="failed" reason="file is password-protected" />)).toContain('role="alert"');
    expect(html(<AsyncStatusChip kind="scoring" state="running" />)).toContain('role="status"');
  });

  it("ConditionChips labels each remove button and offers Clear all", () => {
    const out = html(<ConditionChips conditions={[{ key: "a", label: "Status: Open" }]} onRemove={noop} onClearAll={noop} />);
    expect(out).toContain('aria-label="Remove filter Status: Open"');
    expect(out).toContain("Clear all");
    expect(html(<ConditionChips conditions={[]} onRemove={noop} onClearAll={noop} />)).toBe("");
  });

  it("BulkActionBar announces the selected count and hides at zero", () => {
    expect(html(<BulkActionBar count={3} onClear={noop} />)).toContain("3 selected");
    expect(html(<BulkActionBar count={0} onClear={noop} />)).toBe("");
  });

  it("BoardCard has Move to… button, M shortcut and no salary/contact fields", () => {
    const out = html(<BoardCard title="Nguyen A" subtitle="Backend · 3d" stageId="s1" stages={[{ id: "s1", label: "New" }, { id: "s2", label: "Interview" }]} onMove={noop} />);
    expect(out).toContain("Move to…");
    expect(out).toContain('aria-keyshortcuts="M"');
    expect(out).toContain('tabindex="0"');
    expect(out).not.toMatch(/salary|phone|email/i);
  });
});
