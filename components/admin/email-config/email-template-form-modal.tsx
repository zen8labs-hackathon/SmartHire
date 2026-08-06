"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FieldError,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextField,
} from "@heroui/react";
import { Header } from "react-aria-components";
import { Eye } from "lucide-react";

import {
  AttachmentUploader,
  attachmentItemsToPending,
  attachmentsStillUploading,
  pendingAttachmentsToPayload,
  type PendingAttachment,
} from "@/components/admin/email-config/attachment-uploader";
import { EmailComposerFields } from "@/components/admin/email-config/email-composer-fields";
import { EmailTemplatePreviewModal } from "@/components/admin/email-config/email-template-preview-modal";
import { RichTextEditor } from "@/components/admin/email-config/rich-text-editor";
import type { EmailSettingsData, EmailTemplateListItem } from "@/components/admin/email-config/types";
import { useToast } from "@/components/admin/toast-provider";
import { KNOWN_PLACEHOLDERS } from "@/lib/email/template-variables";
import {
  EMAIL_RECIPIENT_TYPES,
  EMAIL_TRIGGER_CATEGORIES,
  EMAIL_TRIGGER_CATEGORY_LABELS,
  EMAIL_TRIGGER_TYPES,
  type EmailRecipientType,
} from "@/lib/email/trigger-types";

const JSON_HEADERS = { "Content-Type": "application/json" };
const FALLBACK_SENDER_EMAIL = "recruiting@smart-hire.test";
const FALLBACK_COMPANY_NAME = "SmartHire";

const LANGUAGE_OPTIONS = [
  { id: "vi", label: "Vietnamese" },
  { id: "en", label: "English" },
];

type OffsetUnit = "minutes" | "hours" | "days";
const OFFSET_UNIT_OPTIONS: { id: OffsetUnit; label: string }[] = [
  { id: "minutes", label: "minutes" },
  { id: "hours", label: "hours" },
  { id: "days", label: "days" },
];

function decomposeOffset(totalMinutes: number): {
  sign: 1 | -1;
  amount: number;
  unit: OffsetUnit;
} {
  const sign = totalMinutes < 0 ? -1 : 1;
  const abs = Math.abs(totalMinutes);
  if (abs === 0) return { sign: 1, amount: 0, unit: "minutes" };
  if (abs % 1440 === 0) return { sign, amount: abs / 1440, unit: "days" };
  if (abs % 60 === 0) return { sign, amount: abs / 60, unit: "hours" };
  return { sign, amount: abs, unit: "minutes" };
}

function composeOffset(sign: 1 | -1, amount: number, unit: OffsetUnit): number {
  const multiplier = unit === "days" ? 1440 : unit === "hours" ? 60 : 1;
  return sign * amount * multiplier;
}

function Switch({
  isSelected,
  onChange,
  disabled,
  label,
}: {
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isSelected}
      disabled={disabled}
      onClick={() => onChange(!isSelected)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        isSelected ? "bg-accent" : "bg-divider"
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-250 ease-in-out ${
          isSelected ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const selectTriggerClass =
  "h-9 min-h-9 rounded-xl border border-divider bg-surface-primary px-3 text-sm";
const listBoxClass =
  "max-h-72 overflow-y-auto p-1 border border-divider rounded-xl bg-surface-primary shadow-xl";
const listBoxItemClass =
  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-secondary";
const sectionHeaderClass =
  "px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted";

export function EmailTemplateFormModal({
  isOpen,
  onOpenChange,
  template,
  canEdit,
  onSaved,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  template: EmailTemplateListItem | null;
  /** Whether the current user may save changes: true when creating, or when
   * editing a template they created (or if they're an Admin). Read-only
   * otherwise. */
  canEdit: boolean;
  onSaved: (template: EmailTemplateListItem) => void;
}) {
  const isEdit = !!template;

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<string>(EMAIL_TRIGGER_TYPES[0].value);
  const [recipientType, setRecipientType] = useState<EmailRecipientType>("candidate");
  const [language, setLanguage] = useState("vi");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isAutoSend, setIsAutoSend] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [defaultCc, setDefaultCc] = useState("");
  const [defaultBcc, setDefaultBcc] = useState("");
  const [offsetSign, setOffsetSign] = useState<1 | -1>(1);
  const [offsetAmount, setOffsetAmount] = useState(0);
  const [offsetUnit, setOffsetUnit] = useState<OffsetUnit>("minutes");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const { success, error: toastError } = useToast();

  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsData | null>(null);
  const defaultSenderEmail = emailSettings?.default_sender ?? FALLBACK_SENDER_EMAIL;
  const defaultSenderName = `${emailSettings?.company_name || FALLBACK_COMPANY_NAME} Recruiting`;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/email/settings", { credentials: "include" });
      const json = (await res.json()) as { settings?: EmailSettingsData };
      if (!cancelled) {
        setEmailSettings(json.settings ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (template) {
      setName(template.name);
      setTriggerType(template.trigger_type);
      setRecipientType(template.recipient_type);
      setLanguage(template.language);
      setSubject(template.subject_template);
      setBody(template.body_template);
      setIsAutoSend(template.is_auto_send);
      setRequireApproval(template.require_approval);
      setIsActive(template.is_active);
      setDefaultCc(template.default_cc ?? "");
      setDefaultBcc(template.default_bcc ?? "");
      const decomposed = decomposeOffset(template.send_offset_minutes);
      setOffsetSign(decomposed.sign);
      setOffsetAmount(decomposed.amount);
      setOffsetUnit(decomposed.unit);
      setAttachments(attachmentItemsToPending(template.attachments ?? []));
    } else {
      setName("");
      setTriggerType(EMAIL_TRIGGER_TYPES[0].value);
      setRecipientType("candidate");
      setLanguage("vi");
      setSubject("");
      setBody("");
      setIsAutoSend(false);
      setRequireApproval(false);
      setIsActive(true);
      setDefaultCc("");
      setDefaultBcc("");
      setOffsetSign(1);
      setOffsetAmount(0);
      setOffsetUnit("minutes");
      setAttachments([]);
    }
  }, [isOpen, template]);


  const disabled = !canEdit || busy;

  const handleSave = async () => {
    if (!canEdit) return;
    if (!name.trim()) {
      toastError("Name is required.");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toastError("Subject and body are required.");
      return;
    }
    if (attachmentsStillUploading(attachments)) {
      toastError("Wait for attachments to finish uploading before saving.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        triggerType,
        recipientType,
        language,
        subjectTemplate: subject,
        bodyTemplate: body,
        isAutoSend,
        requireApproval,
        isActive,
        defaultCc: defaultCc.trim() || null,
        defaultBcc: defaultBcc.trim() || null,
        sendOffsetMinutes: composeOffset(offsetSign, offsetAmount, offsetUnit),
        attachments: pendingAttachmentsToPayload(attachments),
      };

      const url = isEdit
        ? `/api/admin/email/templates/${template!.id}`
        : "/api/admin/email/templates";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        error?: string;
        template?: EmailTemplateListItem;
      };
      if (!res.ok || !json.template) {
        throw new Error(json.error ?? "Could not save template.");
      }
      success(isEdit ? "Template updated." : "Template created.");
      onSaved(json.template);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Could not save template.");
    } finally {
      setBusy(false);
    }
  };

  const triggerLabel =
    EMAIL_TRIGGER_TYPES.find((t) => t.value === triggerType)?.label ?? triggerType;

  return (
    <>
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-[820px] overflow-hidden p-0 rounded-2xl border border-divider bg-surface-primary shadow-2xl animate-in fade-in zoom-in-95 duration-200 font-sans">
          <Modal.CloseTrigger />
          {/* `!flex-row`: HeroUI's own `.modal__header` is `flex-col` and
              wins the cascade over a plain `flex` here, which would make
              `items-center` center this row's content horizontally instead
              of vertically. */}
          <Modal.Header className="!flex-row border-b border-divider px-6 py-4 bg-surface-secondary/20 flex items-center justify-between">
            <Modal.Heading className="text-sm font-bold text-foreground">
              {isEdit ? "Edit Email Template" : "Create Email Template"}
            </Modal.Heading>
          </Modal.Header>

          <Modal.Body className="max-h-[74vh] space-y-6 overflow-y-auto px-6 py-6">
            {!canEdit ? (
              <Alert status="warning" className="rounded-xl">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    Only the creator or an Admin can edit this template. Viewing read-only.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            {/* Template Information Section (Standard Fields) */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                Template Information
              </h3>

              {/* Name (Full Width) */}
              <TextField value={name} onChange={setName} isDisabled={disabled} className="flex flex-col gap-1 w-full">
                <Label className="text-xs font-semibold text-muted">Name</Label>
                <Input
                  className="mt-1 h-9 w-full rounded-xl border border-divider bg-surface-primary px-3 text-sm focus:border-accent outline-none"
                  placeholder="e.g. Interview invitation email"
                />
                <FieldError className="text-[10px] text-rose-500 mt-1" />
              </TextField>

              {/* Recipient */}
              <div className="flex flex-col gap-1 w-1/2 pr-2">
                <Label className="text-xs font-semibold text-muted">Recipient</Label>
                <Select
                  aria-label="Recipient"
                  isDisabled={disabled}
                  value={recipientType}
                  onChange={(key) => {
                    if (typeof key === "string")
                      setRecipientType(key as EmailRecipientType);
                  }}
                >
                  <Select.Trigger className={selectTriggerClass}>
                    <span className="truncate">{capitalizeFirstLetter(recipientType)}</span>
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox className={listBoxClass}>
                      {EMAIL_RECIPIENT_TYPES.map((r) => (
                        <ListBox.Item key={r} id={r} textValue={r} className={listBoxItemClass}>
                          {capitalizeFirstLetter(r)}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
            </div>

            {/* Email Content Section (Real Email Composer UI) */}
            <div className="border-t border-divider pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Email Content
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-lg border border-divider px-2.5 text-[11px] font-semibold text-muted hover:bg-surface-secondary hover:text-foreground"
                  isDisabled={!subject.trim() && !body.trim()}
                  onPress={() => setPreviewOpen(true)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </Button>
              </div>

              <EmailComposerFields
                from={`${defaultSenderName} <${defaultSenderEmail}>`}
                to={
                  <span className="text-xs font-semibold text-foreground bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-lg capitalize">
                    {recipientType}
                  </span>
                }
                cc={defaultCc}
                onCcChange={setDefaultCc}
                bcc={defaultBcc}
                onBccChange={setDefaultBcc}
                subject={subject}
                onSubjectChange={setSubject}
                subjectPlaceholder="e.g. Interview invitation for {{candidate_name}}"
                disabled={disabled}
              >
                {/* attachments are the template's defaults, auto-attached to every email sent from it */}
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Dear {{candidate_name}}, ..."
                  placeholders={KNOWN_PLACEHOLDERS}
                  disabled={disabled}
                  minHeightClassName="min-h-[16rem]"
                  footer={
                    <AttachmentUploader
                      attachments={attachments}
                      onChange={setAttachments}
                      disabled={disabled}
                      label="Default attachments"
                    />
                  }
                />
              </EmailComposerFields>
            </div>

            {/* Collapsible Advanced Settings (Language, Sending Rules, Send timing) -- CC/BCC live inline in the composer above */}
            <div className="border-t border-divider pt-5">
              <details className="group border border-divider rounded-xl bg-surface-secondary/5 overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted cursor-pointer hover:bg-surface-secondary/10 select-none">
                  <span>Advanced Settings (Trigger, Language, Sending Rules, Send Timing)</span>
                  <span className="transition-transform duration-200 group-open:rotate-180 text-[10px]">▼</span>
                </summary>
                <div className="p-4 border-t border-divider space-y-4 bg-surface-secondary/5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs font-semibold text-muted">Trigger</Label>
                      <Select
                        aria-label="Trigger"
                        isDisabled={disabled}
                        value={triggerType}
                        onChange={(key) => {
                          if (typeof key === "string") setTriggerType(key);
                        }}
                      >
                        <Select.Trigger className={selectTriggerClass}>
                          <span className="truncate">{capitalizeFirstLetter(triggerLabel)}</span>
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox className={listBoxClass}>
                            {EMAIL_TRIGGER_CATEGORIES.map((category) => (
                              <ListBox.Section key={category}>
                                <Header className={sectionHeaderClass}>
                                  {EMAIL_TRIGGER_CATEGORY_LABELS[category]}
                                </Header>
                                {EMAIL_TRIGGER_TYPES.filter((t) => t.category === category).map(
                                  (t) => (
                                    <ListBox.Item
                                      key={t.value}
                                      id={t.value}
                                      textValue={t.label}
                                      className={listBoxItemClass}
                                    >
                                      {capitalizeFirstLetter(t.label)}
                                      <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                  ),
                                )}
                              </ListBox.Section>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <Label className="text-xs font-semibold text-muted">Language</Label>
                      <Select
                        aria-label="Language"
                        isDisabled={disabled}
                        value={language}
                        onChange={(key) => {
                          if (typeof key === "string") setLanguage(key);
                        }}
                      >
                        <Select.Trigger className={selectTriggerClass}>
                          <span className="truncate">
                            {capitalizeFirstLetter(
                              LANGUAGE_OPTIONS.find((o) => o.id === language)?.label ?? language
                            )}
                          </span>
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox className={listBoxClass}>
                            {LANGUAGE_OPTIONS.map((opt) => (
                              <ListBox.Item
                                key={opt.id}
                                id={opt.id}
                                textValue={opt.label}
                                className={listBoxItemClass}
                              >
                                {capitalizeFirstLetter(opt.label)}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-divider bg-surface-secondary/20 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">Auto send email</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase transition-colors duration-150 ${isAutoSend ? "text-accent" : "text-muted"}`}>
                          {isAutoSend ? "ON" : "OFF"}
                          </span>
                        <Switch
                          isSelected={isAutoSend}
                          onChange={setIsAutoSend}
                          disabled={disabled}
                          label="Auto send email"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-divider/50 pt-3">
                      <span className="text-sm font-semibold text-foreground">Require HR approval</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase transition-colors duration-150 ${requireApproval ? "text-accent" : "text-muted"}`}>
                          {requireApproval ? "ON" : "OFF"}
                          </span>
                          {/* Disable this feature for now */}
                        <Switch
                          isSelected={requireApproval}
                          onChange={setRequireApproval}
                          disabled={true || disabled}
                          label="Require HR approval"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-divider/50 pt-3">
                      <span className="text-sm font-semibold text-foreground">Active</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase transition-colors duration-150 ${isActive ? "text-accent" : "text-muted"}`}>
                          {isActive ? "ON" : "OFF"}
                        </span>
                        <Switch
                          isSelected={isActive}
                          onChange={setIsActive}
                          disabled={disabled}
                          label="Active"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-semibold text-muted">Send timing</Label>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Select
                        aria-label="Before or after the trigger"
                        isDisabled={disabled}
                        value={offsetSign}
                        onChange={(key) => setOffsetSign(Number(key) as 1 | -1)}
                      >
                        <Select.Trigger className="h-9 min-h-9 w-24 rounded-xl border border-divider bg-surface-primary px-2.5 text-sm">
                          <span className="truncate">{offsetSign === 1 ? "After" : "Before"}</span>
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox className={listBoxClass}>
                            <ListBox.Item id={1} textValue="After" className={listBoxItemClass}>
                              After
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id={-1} textValue="Before" className={listBoxItemClass}>
                              Before
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      <input
                        type="number"
                        min={0}
                        value={offsetAmount}
                        disabled={disabled}
                        onChange={(e) => setOffsetAmount(Math.max(0, Number(e.target.value)))}
                        className="h-9 w-20 rounded-xl border border-divider bg-surface-primary px-2 text-sm outline-none focus:border-accent disabled:opacity-60"
                      />
                      <Select
                        aria-label="Time unit"
                        isDisabled={disabled}
                        value={offsetUnit}
                        onChange={(key) => {
                          if (typeof key === "string") setOffsetUnit(key as OffsetUnit);
                        }}
                      >
                        <Select.Trigger className="h-9 min-h-9 w-28 rounded-xl border border-divider bg-surface-primary px-2.5 text-sm">
                          <span className="truncate">
                            {capitalizeFirstLetter(
                              OFFSET_UNIT_OPTIONS.find((o) => o.id === offsetUnit)?.label ?? offsetUnit
                            )}
                          </span>
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox className={listBoxClass}>
                            {OFFSET_UNIT_OPTIONS.map((opt) => (
                              <ListBox.Item
                                key={opt.id}
                                id={opt.id}
                                textValue={opt.label}
                                className={listBoxItemClass}
                              >
                                {capitalizeFirstLetter(opt.label)}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      <span className="text-xs text-muted">the trigger event (0 = immediate)</span>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </Modal.Body>

          {canEdit ? (
            <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4 bg-surface-secondary/20 font-sans">
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
                isDisabled={busy || attachmentsStillUploading(attachments)}
                onPress={() => void handleSave()}
              >
                {busy ? "Saving…" : (isEdit ? "Save" : "Create")}
              </Button>
            </Modal.Footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
      </Modal.Backdrop>

      <EmailTemplatePreviewModal
        isOpen={previewOpen}
        onOpenChange={setPreviewOpen}
        name={name}
        subjectTemplate={subject}
        bodyTemplate={body}
        recipientType={recipientType}
        defaultCc={defaultCc}
        defaultBcc={defaultBcc}
        fromEmail={defaultSenderEmail}
        companyName={emailSettings?.company_name}
        signatureHtml={emailSettings?.signature_html}
        logoUrl={emailSettings?.logo_url}
      />
    </>
  );
}
