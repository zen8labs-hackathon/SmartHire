"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";

import type { EmailSettingsData } from "@/components/admin/email-config/types";
import { SectionCard } from "@/components/admin/shell/cards";
import { useToast } from "@/components/admin/toast-provider";
import {
  BulkEmailModal,
  type PreviewResult,
  type SendResult,
} from "@/components/admin/jd/bulk-email-modal";
import { wrapEmailBodyInCard } from "@/lib/email/email-layout";

const FALLBACK_COMPANY_NAME = "SmartHire";

type StatusResponse = { connected: boolean; expiresAt?: number };
type SendMode = "delegated" | "application";

/** Not a real campaign_applied id -- BulkEmailModal only ever needs one to key its own internal `PreviewResult`/`SendResult` arrays by, and this dev-test panel always sends exactly one preview. */
const DEV_TEST_RECIPIENT_ID = "dev-test";

const MODES: { id: SendMode; label: string; description: string }[] = [
  {
    id: "delegated",
    label: "Delegated permission",
    description: "Sends as you, via your own Microsoft account (Mail.Send delegated scope).",
  },
  {
    id: "application",
    label: "Application permission",
    description: "Sends as the system mailbox, via the exact same code path real candidate emails use.",
  },
];

/**
 * One panel within the general Dev Test page (app/admin/dev-test/page.tsx,
 * rendered via components/admin/dev-test/dev-test-shell.tsx) -- verifies
 * real Graph mail sending, including real templates, before waiting on
 * tenant-admin consent for the application-permission app registration
 * behind MS_GRAPH_CLIENT_ID (see lib/microsoft/mail.ts). Both modes always
 * deliver to the "Send test email to" address below via
 * /api/admin/email/dev-test/send, never to a real candidate:
 * - Delegated: the signed-in admin's own token, cookie-only (see
 *   lib/auth/azure-mail-delegate.ts), never persisted to the DB.
 * - Application: reuses lib/email/send-email.ts::sendEmail() verbatim --
 *   the same function real candidate sends go through, so a "simulated"
 *   result here means MS_GRAPH_* isn't configured, exactly as it would for
 *   a real send.
 *
 * Reuses BulkEmailModal (the same template picker/preview/compose UI as
 * production bulk-send) via its `sendOverride`/`previewOverride` props --
 * there's no real candidate behind this send, so per-candidate placeholders
 * like `{{candidate_name}}` are left unresolved in the preview (that's
 * expected: this tool checks that Graph sending and template rendering
 * work, not that a specific candidate's data is correct).
 *
 * The page itself already redirects away outside dev (see its own doc
 * comment), and every API route this component calls independently 404s
 * outside dev too (see lib/env.ts::isDevEnv()) -- this component doesn't
 * duplicate that check, it just assumes it's only ever rendered from that
 * gated page.
 */
export function EmailTestPanel() {
  const { success, error: toastError } = useToast();

  const [mode, setMode] = useState<SendMode>("delegated");

  const [connected, setConnected] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [settings, setSettings] = useState<EmailSettingsData | null>(null);

  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/admin/email/oauth/microsoft/status", {
        credentials: "include",
      });
      const json = (await res.json()) as StatusResponse;
      setConnected(json.connected);
      setExpiresAt(json.expiresAt ?? null);
    } catch {
      setConnected(false);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();

    fetch("/api/admin/email/settings", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { settings?: EmailSettingsData }) => {
        setSettings(json.settings ?? null);
      })
      .catch(() => setSettings(null));

    const params = new URLSearchParams(window.location.search);
    if (params.get("mailTestConnected")) {
      success("Connected to Microsoft (delegated). You can send a test email now.");
      params.delete("mailTestConnected");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    } else if (params.get("mailTestError")) {
      toastError(`Could not connect: ${params.get("mailTestError")}`);
      params.delete("mailTestError");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
  }, [loadStatus, success, toastError]);

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/email/oauth/microsoft/status", {
        method: "DELETE",
        credentials: "include",
      });
      setConnected(false);
      setExpiresAt(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSendOverride = useCallback(
    async (previews: PreviewResult[]): Promise<SendResult[]> => {
      const results: SendResult[] = [];
      for (const preview of previews) {
        try {
          const res = await fetch("/api/admin/email/dev-test/send", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode,
              to,
              subject: preview.subject,
              bodyHtml: preview.bodyHtml,
            }),
          });
          const json = (await res.json()) as { error?: string; ok?: boolean; simulated?: boolean };
          if (!res.ok || !json.ok) {
            const notConnected = json.error === "not_connected";
            if (notConnected) setConnected(false);
            results.push({
              campaignAppliedId: preview.campaignAppliedId,
              ok: false,
              error: notConnected
                ? "Not connected to Microsoft (delegated) -- reconnect and try again."
                : (json.error ?? "Could not send test email."),
            });
          } else {
            results.push({
              campaignAppliedId: preview.campaignAppliedId,
              ok: true,
              status: json.simulated ? "simulated" : "sent",
            });
          }
        } catch (e) {
          results.push({
            campaignAppliedId: preview.campaignAppliedId,
            ok: false,
            error: e instanceof Error ? e.message : "Network error.",
          });
        }
      }
      return results;
    },
    [mode, to],
  );

  // Mirrors lib/email/compose-for-candidate.ts's own last step -- that's
  // where real candidate sends get wrapped in the branded card (logo/company
  // name header, white card, footer), via the exact same wrapEmailBodyInCard
  // call. Skipping this would make a test send look nothing like what a
  // candidate actually receives, defeating the point of this tool.
  const handlePreviewOverride = useCallback(
    ({ subject, bodyHtml }: { subject: string; bodyHtml: string; cc: string; bcc: string }): PreviewResult[] => [
      {
        campaignAppliedId: DEV_TEST_RECIPIENT_ID,
        candidateName: "Dev test",
        toEmail: to || null,
        subject,
        bodyHtml: wrapEmailBodyInCard({
          bodyHtml,
          companyName: settings?.company_name || FALLBACK_COMPANY_NAME,
          logoUrl: settings?.logo_url,
        }),
      },
    ],
    [to, settings],
  );

  const canCompose = !!to && (mode === "application" || connected);

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Auth mode" description="Both modes only ever deliver to the address you type below.">
        <div className="flex flex-col gap-2 sm:flex-row">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                mode === m.id
                  ? "border-accent bg-accent/5"
                  : "border-divider hover:border-accent/40"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{m.label}</p>
              <p className="mt-0.5 text-xs text-muted">{m.description}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      {mode === "delegated" ? (
        <SectionCard
          title="Delegated connection"
          description="Connect your own Microsoft account with the Mail.Send delegated permission."
        >
          {statusLoading ? (
            <p className="text-sm text-muted">Checking connection…</p>
          ) : connected ? (
            <div className="flex items-center justify-between rounded-xl border border-divider bg-surface-primary px-3 py-2 text-sm">
              <span className="text-foreground">
                Connected
                {expiresAt ? ` — expires ${new Date(expiresAt).toLocaleTimeString()}` : ""}
              </span>
              <Button
                variant="secondary"
                className="h-8 rounded-lg px-3 text-xs font-semibold"
                isDisabled={busy}
                onPress={() => void handleDisconnect()}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <a
              href="/api/admin/email/oauth/microsoft/authorize"
              className="inline-flex h-9 items-center rounded-xl bg-accent px-4 text-xs font-semibold text-accent-foreground"
            >
              Connect Microsoft account
            </a>
          )}
        </SectionCard>
      ) : (
        <SectionCard
          title="Application (system mailbox)"
          description="No connection needed -- uses the app registration behind MS_GRAPH_CLIENT_ID."
        >
          <p className="text-sm text-foreground">
            Will send as{" "}
            <span className="font-mono text-xs">{settings?.default_sender ?? "…"}</span>. If
            MS_GRAPH_TENANT_ID/MS_GRAPH_CLIENT_ID/MS_GRAPH_CLIENT_SECRET aren&apos;t set, the result
            comes back as &quot;simulated&quot; instead of an error -- same as a real candidate send would.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Compose" description="Pick a template (or write freeform), preview it, then send.">
        <div className="flex flex-col gap-4">
          <TextField value={to} onChange={setTo} isDisabled={busy}>
            <Label className="text-xs font-semibold text-muted">Send test email to</Label>
            <Input
              type="email"
              className="mt-1 h-9 w-full rounded-xl border border-divider bg-surface-primary px-3 text-sm focus:border-accent outline-none"
              placeholder="you@example.com"
            />
          </TextField>

          <div>
            <Button
              variant="primary"
              className="h-9 rounded-xl bg-accent px-4 text-xs font-semibold text-accent-foreground"
              isDisabled={busy || !canCompose}
              onPress={() => setComposerOpen(true)}
            >
              Compose test email
            </Button>
          </div>
        </div>
      </SectionCard>

      <BulkEmailModal
        isOpen={composerOpen}
        onOpenChange={setComposerOpen}
        recipients={[{ id: DEV_TEST_RECIPIENT_ID, candidate_name: null, candidate_email: to || null }]}
        onSent={() => success(`Test email sent to ${to}.`)}
        composeHeading={`Dev test send (${mode})`}
        deliveryNote={`Per-candidate placeholders like {{candidate_name}} are left unresolved -- there's no real candidate behind this send. The email always goes to ${to || "the address above"}.`}
        confirmSendLabel="Send test email"
        previewOverride={handlePreviewOverride}
        sendOverride={handleSendOverride}
      />
    </div>
  );
}
