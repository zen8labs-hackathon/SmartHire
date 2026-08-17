"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { Eye } from "lucide-react";

import { EmailPreviewCard } from "@/components/admin/email-config/email-preview-card";
import { HtmlSourceEditor } from "@/components/admin/email-config/html-source-editor";
import type { EmailPlaceholder } from "@/components/admin/email-config/rich-text-editor";
import type { EmailSettingsData } from "@/components/admin/email-config/types";
import { SectionCard } from "@/components/admin/shell/cards";
import { useToast } from "@/components/admin/toast-provider";
import { applyEmailLayout } from "@/lib/email/email-layout";

const JSON_HEADERS = { "Content-Type": "application/json" };

const EMAIL_CONTENT_PLACEHOLDER_PATTERN = /\{\{\s*email_content\s*\}\}/;

const SAMPLE_BODY_HTML =
  "<p>Dear Nguyễn Văn A,</p><p>Thank you for applying to the Backend Engineer position. We'd like to invite you to an interview.</p><p>Best regards,<br />The Recruiting Team</p>";

const LAYOUT_PLACEHOLDERS: EmailPlaceholder[] = [
  { key: "email_content", label: "Rendered email body (required)" },
  { key: "company_name", label: "Company name" },
  { key: "logo_url", label: "Logo URL" },
];

/** No extra role gate here beyond the page-level `isHr` redirect in app/admin/email-config/page.tsx -- anyone who can reach this page can edit general settings. */
export function EmailSettingsTab() {
  const { success, error: toastError } = useToast();

  const [settings, setSettings] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [defaultSender, setDefaultSender] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [customLayoutHtml, setCustomLayoutHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const applySettings = useCallback((s: EmailSettingsData) => {
    setSettings(s);
    setDefaultSender(s.default_sender);
    setCompanyName(s.company_name);
    setLogoUrl(s.logo_url ?? "");
    setCustomLayoutHtml(s.custom_layout_html ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/admin/email/settings", { credentials: "include" });
        const json = (await res.json()) as { error?: string; settings?: EmailSettingsData };
        if (!res.ok || !json.settings) {
          throw new Error(json.error ?? "Could not load settings.");
        }
        if (!cancelled) applySettings(json.settings);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load settings.";
        if (!cancelled) {
          setLoadError(message);
          toastError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySettings, toastError]);

  const handleSave = async () => {
    const trimmedLayout = customLayoutHtml.trim();
    if (trimmedLayout && !EMAIL_CONTENT_PLACEHOLDER_PATTERN.test(trimmedLayout)) {
      toastError("Custom layout must include {{email_content}} to mark where the email body goes.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/email/settings", {
        method: "PUT",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          defaultSender,
          companyName,
          logoUrl: logoUrl.trim() || null,
          // No separate "layout type" toggle in the UI -- an empty editor
          // just means "use the default layout" (applyEmailLayout already
          // falls back to it whenever customLayoutHtml is blank).
          layoutType: trimmedLayout ? "custom" : "default",
          customLayoutHtml: trimmedLayout || null,
        }),
      });
      const json = (await res.json()) as { error?: string; settings?: EmailSettingsData };
      if (!res.ok || !json.settings) {
        throw new Error(json.error ?? "Could not save settings.");
      }
      applySettings(json.settings);
      success("Settings saved.");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  const previewBodyHtml = useMemo(
    () =>
      applyEmailLayout({
        bodyHtml: SAMPLE_BODY_HTML,
        companyName: companyName || "SmartHire",
        logoUrl,
        layoutType: customLayoutHtml.trim() ? "custom" : "default",
        customLayoutHtml,
      }),
    [companyName, logoUrl, customLayoutHtml],
  );

  if (loading) {
    return (
      <SectionCard>
        <p className="text-sm text-muted">Loading settings…</p>
      </SectionCard>
    );
  }

  if (loadError || !settings) {
    return (
      <SectionCard>
        <p className="text-sm text-danger">{loadError ?? "Could not load settings."}</p>
      </SectionCard>
    );
  }

  const disabled = busy;

  return (
    <SectionCard
      title="General settings"
      description="Applies to every automated and manual email sent from SmartHire."
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField value={defaultSender} onChange={setDefaultSender} isDisabled={disabled}>
            <Label className="text-xs font-semibold text-muted">Default sender address</Label>
            <Input
              type="email"
              className="mt-1 h-9 w-full rounded-xl border border-divider bg-surface-primary px-3 text-sm focus:border-accent outline-none"
              placeholder="no-reply@smart-hire.test"
            />
          </TextField>

          <TextField value={companyName} onChange={setCompanyName} isDisabled={disabled}>
            <Label className="text-xs font-semibold text-muted">Company name</Label>
            <Input
              className="mt-1 h-9 w-full rounded-xl border border-divider bg-surface-primary px-3 text-sm focus:border-accent outline-none"
              placeholder="SmartHire"
            />
          </TextField>

          <TextField value={logoUrl} onChange={setLogoUrl} isDisabled={disabled}>
            <Label className="text-xs font-semibold text-muted">Logo URL</Label>
            <Input
              className="mt-1 h-9 w-full rounded-xl border border-divider bg-surface-primary px-3 text-sm focus:border-accent outline-none"
              placeholder="https://…"
            />
          </TextField>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between pb-1">
            <Label className="text-xs font-semibold text-muted">Email layout (HTML)</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-lg border border-divider px-2.5 text-[11px] font-semibold text-muted hover:bg-surface-secondary hover:text-foreground"
              onPress={() => setPreviewOpen((v) => !v)}
            >
              <Eye className="h-3.5 w-3.5" />
              {previewOpen ? "Hide preview" : "Preview"}
            </Button>
          </div>
          {/* HtmlSourceEditor, not RichTextEditor -- this field must preserve
              the HTML byte-for-byte. Tiptap parses HTML into a ProseMirror
              document and re-serializes it, which silently drops comment
              nodes (breaking `<!--[if mso]>` Outlook conditionals) and
              rewrites style colors to their rgb() form (ProseMirror sets
              `style` via `dom.style.cssText`, which the CSSOM canonicalizes)
              -- verified empirically, not a hypothetical. Its toolbar reuses
              RichTextEditor's own primitives but only ever inserts literal
              text at the cursor, never reparses the content. */}
          <HtmlSourceEditor
            value={customLayoutHtml}
            onChange={setCustomLayoutHtml}
            placeholder='<div>{{email_content}}</div>'
            placeholders={LAYOUT_PLACEHOLDERS}
            disabled={disabled}
            minHeightClassName="min-h-[24rem]"
          />
          <p className="text-[11px] text-muted">
            Use{" "}
            <code className="rounded bg-surface-secondary/80 px-1 font-mono text-[10px]">
              {"{{email_content}}"}
            </code>{" "}
            to mark where the rendered email body is inserted (required) -- the variable button
            above inserts it at the cursor. Leave blank to use the default layout (logo/company
            name header, white content card, footer).
          </p>

          {previewOpen ? (
            <div className="mt-2">
              <EmailPreviewCard
                subject="Interview invitation for Backend Engineer"
                bodyHtml={previewBodyHtml}
                to="candidate@example.com"
                fromName={`${companyName || "SmartHire"} Recruiting`}
                fromEmail={defaultSender || "recruiting@smart-hire.test"}
                bodyMinHeightClassName="min-h-[8rem]"
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            className="h-9 rounded-xl bg-accent px-4 text-xs font-semibold text-accent-foreground"
            isDisabled={busy}
            onPress={() => void handleSave()}
          >
            {busy ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
