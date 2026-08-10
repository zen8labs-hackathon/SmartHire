"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";

import { RichTextEditor } from "@/components/admin/email-config/rich-text-editor";
import type { EmailSettingsData } from "@/components/admin/email-config/types";
import { SectionCard } from "@/components/admin/shell/cards";
import { useToast } from "@/components/admin/toast-provider";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** No extra role gate here beyond the page-level `isHr` redirect in app/admin/email-config/page.tsx -- anyone who can reach this page can edit general settings. */
export function EmailSettingsTab() {
  const { success, error: toastError } = useToast();

  const [settings, setSettings] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [defaultSender, setDefaultSender] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const applySettings = useCallback((s: EmailSettingsData) => {
    setSettings(s);
    setDefaultSender(s.default_sender);
    setCompanyName(s.company_name);
    setSignatureHtml(s.signature_html ?? "");
    setLogoUrl(s.logo_url ?? "");
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
    setBusy(true);
    try {
      const res = await fetch("/api/admin/email/settings", {
        method: "PUT",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          defaultSender,
          companyName,
          signatureHtml: signatureHtml.trim() || null,
          logoUrl: logoUrl.trim() || null,
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

        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold text-muted">Email signature (HTML)</Label>
          <RichTextEditor
            value={signatureHtml}
            onChange={setSignatureHtml}
            placeholder="Best regards, SmartHire Team"
            disabled={disabled}
            minHeightClassName="min-h-[6rem]"
          />
        </div>

        <p className="text-[11px] text-muted">
          The signature above is appended to the bottom of every email sent from SmartHire
          (manual, bulk, and automated).
        </p>

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
