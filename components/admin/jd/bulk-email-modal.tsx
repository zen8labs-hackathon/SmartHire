"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alert, Button, Input, Label, ListBox, Modal, Select, TextField } from "@heroui/react";
import { ChevronDown, ChevronUp } from "lucide-react";

import {
  AttachmentUploader,
  attachmentsStillUploading,
  pendingAttachmentsToPayload,
  TemplateAttachmentsPreview,
  type PendingAttachment,
} from "@/components/admin/email-config/attachment-uploader";
import { EmailComposerFields } from "@/components/admin/email-config/email-composer-fields";
import { EmailPreviewCard } from "@/components/admin/email-config/email-preview-card";
import { RichTextEditor } from "@/components/admin/email-config/rich-text-editor";
import type {
  EmailSettingsData,
  EmailTemplateListItem,
  ReplyToContext,
} from "@/components/admin/email-config/types";
import { getMySenderIdentity, type MySenderIdentity } from "@/app/account/actions";
import { renderEmailTemplate } from "@/lib/email/render-template";
import { KNOWN_PLACEHOLDERS } from "@/lib/email/template-variables";
import { formatDisplayDateTime } from "@/lib/format-date";

const JSON_HEADERS = { "Content-Type": "application/json" };
const FALLBACK_SENDER_EMAIL = "recruiting@smart-hire.test";
const FALLBACK_COMPANY_NAME = "SmartHire";

/** Embeds the org signature directly into the editable body so it's visible
 * (and editable) while composing, instead of only appearing once the user
 * hits Preview -- the send/preview routes no longer append it server-side. */
function withSignature(bodyHtml: string, signatureHtml: string | null | undefined): string {
  if (!signatureHtml) return bodyHtml;
  return bodyHtml ? `${bodyHtml}<br /><br />${signatureHtml}` : signatureHtml;
}

/** The job every recipient is being emailed about -- omitted (not just
 * blank) when a compose flow isn't scoped to a single job, e.g.
 * `CandidateEmailTab`'s "all applications" compose, where a candidate may
 * have applied to several different jobs and there's no single
 * `{{position}}`/`{{department}}` to fill in. */
export type BulkEmailJobContext = {
  position: string | null;
  department: string | null;
};

/** Placeholders that are the same for every recipient and already known the
 * moment a template is picked (unlike `{{candidate_name}}` and friends,
 * which stay as literal placeholders until each recipient is resolved at
 * send/preview time). Only include a key once its value is non-empty, so an
 * unconfigured setting is left visible as `{{company_name}}` rather than
 * silently blanked. */
function knownVarsForPrefill(
  settings: EmailSettingsData | null,
  job: BulkEmailJobContext | null | undefined,
  myProfile: MySenderIdentity | null,
): Record<string, string> {
  const vars: Record<string, string> = {};
  if (settings?.company_name) vars.company_name = settings.company_name;
  if (job?.position) vars.position = job.position;
  if (job?.department) vars.department = job.department;
  // Matches the server's own `hr_name` value (`auth.access.email`, see
  // send/route.ts) -- the signed-in staff member's login email, not their
  // display name.
  if (myProfile?.email) vars.hr_name = myProfile.email;
  if (myProfile?.displayName) vars.user_name = myProfile.displayName;
  if (myProfile?.email) vars.user_email = myProfile.email;
  if (myProfile?.phone) vars.user_phone = myProfile.phone;
  return vars;
}

export type BulkEmailRecipient = {
  id: string;
  candidate_name: string | null;
  candidate_email: string | null;
};

export type PreviewResult = {
  campaignAppliedId: string;
  candidateName: string;
  toEmail: string | null;
  subject: string;
  bodyHtml: string;
};

export type SendResult = {
  campaignAppliedId: string;
  ok: boolean;
  status?: string;
  error?: string;
  messageId?: string;
};

type Step = "compose" | "preview" | "result";

export function BulkEmailModal({
  isOpen,
  onOpenChange,
  recipients,
  onSent,
  composeHeading,
  initialSubject,
  initialBody,
  replyTo,
  job,
  sendOverride,
  previewOverride,
  confirmSendLabel,
  deliveryNote,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: BulkEmailRecipient[];
  onSent: () => void;
  /** Overrides the "Compose Email (N Recipients)" heading on the first step, e.g. for the schedule "send email" entry point. */
  composeHeading?: string;
  /** Prefilled subject/body, e.g. built from a specific candidate_schedules row. Falls back to the usual blank freeform compose when omitted. Ignored when `replyTo` is set. */
  initialSubject?: string;
  initialBody?: string;
  /** The message being replied to -- see `CandidateEmailTab`'s "Reply" action. When set, the subject gets a "Re:" prefix and the original message renders as a collapsible quote below the (otherwise empty) body editor, instead of being stuffed into `initialBody`. */
  replyTo?: ReplyToContext | null;
  /** The single job every recipient here is being emailed about -- fills in
   * `{{position}}`/`{{department}}` as soon as a template is picked. Omit
   * when a compose flow spans candidates from different jobs (or none). */
  job?: BulkEmailJobContext | null;
  /**
   * When set, the confirm-send step calls this with the built previews
   * instead of POSTing `/api/admin/email/send` -- lets a caller redirect
   * actual delivery elsewhere (e.g. the delegated-permission test-send flow
   * in components/admin/dev-test/email-test-panel.tsx) while
   * still reusing this modal's template picker/preview/compose UI as-is.
   * Attachments are hidden from the composer in this mode since neither
   * caller wires them through.
   */
  sendOverride?: (previews: PreviewResult[]) => Promise<SendResult[]>;
  /**
   * When set, the "Preview" step builds `previews` from this instead of
   * POSTing `/api/admin/email/send/preview` -- that endpoint requires real
   * `campaign_applied` rows to resolve per-candidate placeholders, which a
   * caller like the dev-test panel doesn't have (its `recipients` entry is
   * synthesized from a typed test address, not a real candidate). Given the
   * modal's own already-composed `subject`/`bodyHtml`/`cc`/`bcc`, return one
   * `PreviewResult` per `recipients` entry (usually just one).
   */
  previewOverride?: (compose: {
    subject: string;
    bodyHtml: string;
    cc: string;
    bcc: string;
  }) => PreviewResult[];
  /** Footer button label for the confirm-send step; defaults to "Send to N Candidates". */
  confirmSendLabel?: string;
  /** Extra note rendered above the compose fields, e.g. clarifying where a test send actually goes. */
  deliveryNote?: ReactNode;
}) {
  const [step, setStep] = useState<Step>("compose");

  const [templates, setTemplates] = useState<EmailTemplateListItem[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsData | null>(null);
  const [myProfile, setMyProfile] = useState<MySenderIdentity | null>(null);
  const defaultSenderEmail = emailSettings?.default_sender ?? FALLBACK_SENDER_EMAIL;
  const defaultSenderName = `${emailSettings?.company_name || FALLBACK_COMPANY_NAME} Recruiting`;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // Quoted original message, kept out of `body` (and thus out of the
  // editable RichTextEditor) -- inlining a whole prior email's HTML into the
  // editor made it balloon to the quoted content's height, leaving almost no
  // room to actually type a reply. Rendered separately below, collapsed by
  // default, and stitched back onto `body` only at send/preview time.
  const [quotedHtml, setQuotedHtml] = useState("");
  const [quotedVisible, setQuotedVisible] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const [previews, setPreviews] = useState<PreviewResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingMessageIds, setRetryingMessageIds] = useState<Set<string>>(new Set());

  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [templateSelectOpen, setTemplateSelectOpen] = useState(false);

  // The "Freeform (no template)" compose defaults -- what the subject/body
  // reset back to both when the modal first opens and whenever the user
  // switches from a template back to Freeform mid-compose.
  const freeformSubject = replyTo
    ? /^re:/i.test(replyTo.subject.trim())
      ? replyTo.subject
      : `Re: ${replyTo.subject}`
    : (initialSubject ?? "");
  const freeformBody = replyTo ? "" : (initialBody ?? "");

  useEffect(() => {
    if (!isOpen) return;
    setStep("compose");
    setSelectedTemplateId("");
    setSubject(freeformSubject);
    setBody(freeformBody);
    if (replyTo) {
      const quotedHeader = replyTo.sentAt
        ? `On ${formatDisplayDateTime(replyTo.sentAt)}, ${replyTo.fromEmail} wrote:`
        : `${replyTo.fromEmail} wrote:`;
      setQuotedHtml(`<p><em>${quotedHeader}</em></p>${replyTo.bodyHtml}`);
    } else {
      setQuotedHtml("");
    }
    setQuotedVisible(false);
    setCc("");
    setBcc("");
    setAttachments([]);
    setPreviews([]);
    setResults([]);
    setError(null);
    setTemplateSearchQuery("");
    setTemplateSelectOpen(false);

    let cancelled = false;
    (async () => {
      const [templatesRes, settingsRes, profile] = await Promise.all([
        fetch("/api/admin/email/templates?isActive=true", { credentials: "include" }),
        fetch("/api/admin/email/settings", { credentials: "include" }),
        getMySenderIdentity(),
      ]);
      const templatesJson = (await templatesRes.json()) as { rows?: EmailTemplateListItem[] };
      const settingsJson = (await settingsRes.json()) as { settings?: EmailSettingsData };
      if (!cancelled) {
        setTemplates(
          (templatesJson.rows ?? []).filter((t) => t.recipient_type === "candidate"),
        );
        const settings = settingsJson.settings ?? null;
        setEmailSettings(settings);
        setMyProfile(profile);
        // Fill in known-now placeholders (e.g. a schedule-built initialBody's
        // {{position}}) and embed the signature as soon as both load, rather
        // than only at preview/send time.
        const knownVars = knownVarsForPrefill(settings, job, profile);
        setSubject((prev) => renderEmailTemplate(prev, knownVars));
        setBody((prev) => withSignature(renderEmailTemplate(prev, knownVars), settings?.signature_html));
      }
    })();
    return () => {
      cancelled = true;
    };
    // initialSubject/initialBody/replyTo intentionally excluded -- captured
    // once per "modal opened" so retyping in the callee's render loop
    // doesn't reset the form the user is editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    // Picking a template while replying still keeps the "Re:" prefix -- the
    // quoted original (`quotedHtml`) lives outside `body` so applying a
    // template here only replaces the reply text, not the quote below it.
    const isReply = !!replyTo;
    const knownVars = knownVarsForPrefill(emailSettings, job, myProfile);
    const renderedSubject = renderEmailTemplate(template.subject_template, knownVars);
    const nextSubject =
      isReply && !/^re:/i.test(renderedSubject.trim()) ? `Re: ${renderedSubject}` : renderedSubject;
    setSubject(nextSubject);
    // Only placeholders that are the same for every recipient (e.g.
    // {{company_name}}, {{position}} when `job` is scoped) get filled in
    // here -- per-candidate ones like {{candidate_name}} stay as literal
    // placeholders until send/preview.
    const renderedBody = renderEmailTemplate(template.body_template, knownVars);
    setBody(withSignature(renderedBody, emailSettings?.signature_html));
    setCc(template.default_cc ?? "");
    setBcc(template.default_bcc ?? "");
    // replyTo intentionally excluded -- only its presence (not identity)
    // matters here, and the object is recreated every parent render.
    // emailSettings/myProfile intentionally excluded -- both settle in the
    // same Promise.all as `templates`, so by the time `templates` is
    // non-empty enough to pick a template from, they're already current in
    // this closure; including them here would re-run (and clobber user
    // edits) on every later refetch. `job` intentionally excluded -- it's a
    // fresh object every parent render, only its fields matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId, templates]);

  const selectedTemplate = selectedTemplateId
    ? templates.find((t) => t.id === selectedTemplateId)
    : undefined;

  const canProceed =
    (selectedTemplateId || (subject.trim() && body.trim())) &&
    !attachmentsStillUploading(attachments);

  // What actually gets sent: the user's own reply text plus the quoted
  // original underneath -- independent of whether the quote is currently
  // shown/hidden in the composer, matching how mail clients always include
  // quoted history in the raw message regardless of UI collapse state.
  const composedBodyHtml = quotedHtml
    ? `${body}<blockquote style="margin:1em 0 0 0;padding-left:1em;border-left:2px solid #ccc;color:#666;">${quotedHtml}</blockquote>`
    : body;

  const handleBuildPreview = async () => {
    setError(null);
    setPreviewLoading(true);
    try {
      if (previewOverride) {
        setPreviews(previewOverride({ subject, bodyHtml: composedBodyHtml, cc, bcc }));
        setStep("preview");
        return;
      }

      const res = await fetch("/api/admin/email/send/preview", {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          campaignAppliedIds: recipients.map((r) => r.id),
          templateId: selectedTemplateId || undefined,
          subject: subject || undefined,
          bodyHtml: composedBodyHtml || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string; previews?: PreviewResult[] };
      if (!res.ok) throw new Error(json.error ?? "Could not build preview.");
      setPreviews(json.previews ?? []);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmSend = async () => {
    setError(null);
    setSending(true);
    try {
      if (sendOverride) {
        const overrideResults = await sendOverride(previews);
        setResults(overrideResults);
        setStep("result");
        onSent();
        return;
      }

      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          campaignAppliedIds: recipients.map((r) => r.id),
          templateId: selectedTemplateId || undefined,
          subject: subject || undefined,
          bodyHtml: composedBodyHtml || undefined,
          cc: cc.trim() || null,
          bcc: bcc.trim() || null,
          attachments: pendingAttachmentsToPayload(attachments),
        }),
      });
      const json = (await res.json()) as { error?: string; results?: SendResult[] };
      if (!res.ok) throw new Error(json.error ?? "Could not send emails.");
      setResults(json.results ?? []);
      setStep("result");
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send emails.");
    } finally {
      setSending(false);
    }
  };

  const nameForId = (id: string) =>
    recipients.find((r) => r.id === id)?.candidate_name ?? id;

  const handleRetry = async (result: SendResult) => {
    const messageId = result.messageId;
    if (!messageId) return;
    setRetryingMessageIds((prev) => new Set(prev).add(messageId));
    try {
      const res = await fetch(`/api/admin/email/messages/${messageId}/retry`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; status?: string; error?: string };
      setResults((prev) =>
        prev.map((r) =>
          r.campaignAppliedId === result.campaignAppliedId
            ? { ...r, ok: json.ok ?? res.ok, status: json.status, error: json.error }
            : r,
        ),
      );
      if (json.ok) onSent();
    } catch {
      setResults((prev) =>
        prev.map((r) =>
          r.campaignAppliedId === result.campaignAppliedId
            ? { ...r, ok: false, error: "Could not reach the server." }
            : r,
        ),
      );
    } finally {
      setRetryingMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const sentCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - sentCount;

  return (
    <Modal.Backdrop
      className="bg-black/40 backdrop-blur-sm"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal.Container>
        <Modal.Dialog
          className={`w-full ${step === "result" ? "max-w-[520px]" : "max-w-[820px]"} overflow-hidden p-0 rounded-2xl border border-divider bg-surface-primary shadow-2xl animate-in fade-in zoom-in-95 duration-200 font-sans`}
        >
          <Modal.CloseTrigger />
          {/* HeroUI's own `.modal__header` is `flex-col` (its CSS ships after
              Tailwind's utilities, so it wins the cascade over a plain
              `flex`/no explicit direction here) -- `!flex-row` forces row
              layout so `items-center`/`justify-between` center vertically as
              intended instead of `items-center` centering the column
              horizontally. */}
          <Modal.Header className="!flex-row border-b border-divider px-6 py-4 bg-surface-secondary/20 flex items-center justify-between">
            <div className="min-w-0">
              <Modal.Heading className="text-sm font-bold text-foreground">
                {step === "compose"
                  ? (composeHeading ??
                    (replyTo
                      ? "Reply"
                      : `Compose Email (${recipients.length} Recipient${recipients.length > 1 ? "s" : ""})`))
                  : step === "preview"
                  ? "Preview Rendered Emails"
                  : "Delivery Status"}
              </Modal.Heading>
              {step === "compose" && replyTo ? (
                <p className="mt-0.5 truncate text-xs text-muted">
                  Replying to: {replyTo.subject}
                </p>
              ) : null}
            </div>
          </Modal.Header>

          <Modal.Body className="max-h-[74vh] space-y-5 overflow-y-auto px-6 py-6">
            {error ? (
              <Alert status="danger" className="rounded-xl">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {step === "compose" ? (
              <div className="space-y-4">
                {deliveryNote ? (
                  <Alert status="warning" className="rounded-xl">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{deliveryNote}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}

                {/* Template Selector Option (Settings Field) */}
                <div className="flex flex-col gap-1.5 bg-surface-secondary/10 border border-divider/60 rounded-2xl p-4">
                  <Label className="text-xs font-semibold text-muted">
                    Template (optional)
                  </Label>
                  <Select
                    aria-label="Template"
                    value={selectedTemplateId || "__freeform__"}
                    onChange={(key) => {
                      if (typeof key !== "string") return;
                      if (key === "__freeform__") {
                        // Switching back to Freeform clears whatever the
                        // selected template filled in, resetting to the same
                        // blank/prefilled starting point the modal opened
                        // with (still re-filling known vars and the signature).
                        setSelectedTemplateId("");
                        const knownVars = knownVarsForPrefill(emailSettings, job, myProfile);
                        setSubject(renderEmailTemplate(freeformSubject, knownVars));
                        setBody(
                          withSignature(
                            renderEmailTemplate(freeformBody, knownVars),
                            emailSettings?.signature_html,
                          ),
                        );
                        setCc("");
                        setBcc("");
                      } else {
                        setSelectedTemplateId(key);
                      }
                    }}
                    isOpen={templateSelectOpen}
                    onOpenChange={(open) => {
                      setTemplateSelectOpen(open);
                      if (!open) {
                        setTemplateSearchQuery("");
                      }
                    }}
                  >
                    <Select.Trigger className="h-9 min-h-9 rounded-xl border border-divider bg-surface-primary px-3 text-sm">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <div className="p-2 border-b border-divider bg-surface-secondary/20 flex flex-col gap-1.5">
                        <input
                          type="text"
                          className="w-full h-8 px-2.5 text-xs rounded-lg border border-divider bg-surface-primary outline-none focus:border-accent font-sans"
                          placeholder="Search templates..."
                          value={templateSearchQuery}
                          onChange={(e) => setTemplateSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      <ListBox className="max-h-72 overflow-y-auto p-1 border border-divider rounded-xl bg-surface-primary shadow-xl">
                        <ListBox.Item
                          id="__freeform__"
                          textValue="Write from scratch"
                          className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-secondary"
                        >
                          Write from scratch
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {templates
                          .filter((t) =>
                            t.name.toLowerCase().includes(templateSearchQuery.toLowerCase())
                          )
                          .map((t) => (
                            <ListBox.Item
                              key={t.id}
                              id={t.id}
                              textValue={t.name}
                              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-secondary"
                            >
                              {t.name}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                <EmailComposerFields
                  from={`${defaultSenderName} <${defaultSenderEmail}>`}
                  to={recipients.map((r) => (
                    <span
                      key={r.id}
                      className="text-xs font-medium text-foreground bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-lg"
                    >
                      {r.candidate_email || r.candidate_name || "Candidate"}
                    </span>
                  ))}
                  cc={cc}
                  onCcChange={setCc}
                  bcc={bcc}
                  onBccChange={setBcc}
                  subject={subject}
                  onSubjectChange={setSubject}
                  subjectPlaceholder="Invitation for {{candidate.name}}"
                >
                  <RichTextEditor
                    value={body}
                    onChange={setBody}
                    placeholder={replyTo ? "Write your reply…" : undefined}
                    placeholders={KNOWN_PLACEHOLDERS}
                    minHeightClassName={replyTo ? "min-h-[10rem]" : "min-h-[16rem]"}
                    footer={
                      sendOverride ? undefined : (
                        <div className="flex flex-col gap-2">
                          {selectedTemplate?.attachments?.length ? (
                            <TemplateAttachmentsPreview attachments={selectedTemplate.attachments} />
                          ) : null}
                          <AttachmentUploader attachments={attachments} onChange={setAttachments} />
                        </div>
                      )
                    }
                  />
                </EmailComposerFields>

                {quotedHtml ? (
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuotedVisible((v) => !v)}
                      className="flex w-fit items-center gap-1 text-xs font-semibold text-muted hover:text-foreground"
                    >
                      {quotedVisible ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {quotedVisible ? "Hide quoted text" : "Show quoted text"}
                    </button>
                    {quotedVisible ? (
                      <div className="max-h-96 overflow-y-auto rounded-xl border border-divider bg-surface-secondary/10 p-3">
                        <div
                          className="email-html-preview max-w-none text-xs text-muted"
                          dangerouslySetInnerHTML={{ __html: quotedHtml }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <p className="text-[11px] text-muted-foreground/80 leading-normal pl-1">
                  * Placing placeholders like <code className="bg-surface-secondary/80 px-1 rounded font-mono text-[10px]">{"{{candidate_name}}"}</code> inside the subject or body will automatically resolve per-candidate during send.
                </p>
              </div>
            ) : step === "preview" ? (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground">
                  Verify the rendered template preview for each candidate before confirming send:
                </p>
                {previews.map((p, index) => (
                  <div
                    key={p.campaignAppliedId}
                    className={
                      index > 0 ? "border-t border-divider pt-4" : undefined
                    }
                  >
                    {previews.length > 1 ? (
                      <p className="mb-2 text-xs font-semibold text-muted uppercase tracking-wide">
                        {p.candidateName}
                      </p>
                    ) : null}
                    <EmailPreviewCard
                      subject={p.subject}
                      bodyHtml={p.bodyHtml}
                      to={p.toEmail ?? "no email on file"}
                      fromName={defaultSenderName}
                      fromEmail={defaultSenderEmail}
                      bodyMinHeightClassName="min-h-[10rem]"
                    />
                  </div>
                ))}
                {previews.some((p) => !p.toEmail) ? (
                  <Alert status="warning" className="rounded-xl">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>
                        One or more candidates have no email address on file and will be skipped.
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 text-xs font-medium">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {sentCount} sent
                  </span>
                  {failedCount > 0 ? (
                    <span className="text-danger">{failedCount} failed</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  {results.map((r) => {
                    const isRetrying = r.messageId ? retryingMessageIds.has(r.messageId) : false;
                    return (
                      <div
                        key={r.campaignAppliedId}
                        className="rounded-xl border border-divider bg-surface-secondary/10 px-3.5 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {nameForId(r.campaignAppliedId)}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {r.ok ? (
                              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                {r.status ?? "sent"}
                              </span>
                            ) : (
                              <>
                                <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-[10px] font-semibold text-danger uppercase tracking-wider">
                                  Failed
                                </span>
                                {r.messageId ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 rounded-lg px-2 text-[10px] font-semibold"
                                    isDisabled={isRetrying}
                                    onPress={() => void handleRetry(r)}
                                  >
                                    {isRetrying ? "Retrying…" : "Retry"}
                                  </Button>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                        {!r.ok && r.error ? (
                          <p className="mt-1.5 break-words text-xs leading-snug text-danger/90">
                            {r.error}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Modal.Body>

          <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4 bg-surface-secondary/20">
            {step === "compose" ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs font-semibold"
                  onPress={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="text-xs font-semibold bg-accent text-accent-foreground px-4 py-2 rounded-xl"
                  isDisabled={!canProceed || previewLoading}
                  onPress={() => void handleBuildPreview()}
                >
                  {previewLoading ? "Loading…" : "Preview"}
                </Button>
              </>
            ) : step === "preview" ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs font-semibold"
                  onPress={() => setStep("compose")}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="text-xs font-semibold bg-accent text-accent-foreground px-4 py-2 rounded-xl"
                  isDisabled={sending}
                  onPress={() => void handleConfirmSend()}
                >
                  {sending
                    ? "Sending…"
                    : (confirmSendLabel ?? `Send to ${previews.length} Candidates`)}
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className="text-xs font-semibold bg-accent text-accent-foreground px-4 py-2 rounded-xl"
                onPress={() => onOpenChange(false)}
              >
                Done
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
