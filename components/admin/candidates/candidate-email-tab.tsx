"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, useOverlayState } from "@heroui/react";
import { ChevronDown, ChevronUp, Loader2, Mail, Reply, X } from "lucide-react";

import {
  BulkEmailModal,
  type BulkEmailRecipient,
} from "@/components/admin/jd/bulk-email-modal";
import { EMAIL_STATUS_STYLES } from "@/components/admin/email-config/email-status-styles";
import type {
  EmailMessageListItem,
  ReplyToContext,
} from "@/components/admin/email-config/types";
import { SectionCard } from "@/components/admin/shell/cards";
import { formatDisplayDateTime } from "@/lib/format-date";

type EmailScheduleItem = {
  id: string;
  template_id: string;
  scheduled_for: string;
};

function UpcomingSchedules({ campaignAppliedId }: { campaignAppliedId: string }) {
  const [schedules, setSchedules] = useState<EmailScheduleItem[]>([]);
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/email/schedules?campaignAppliedId=${encodeURIComponent(campaignAppliedId)}`,
        { credentials: "include" },
      );
      const json = (await res.json()) as { schedules?: EmailScheduleItem[] };
      const rows = json.schedules ?? [];
      setSchedules(rows);

      const missingIds = [...new Set(rows.map((s) => s.template_id))].filter(
        (id) => !(id in templateNames),
      );
      if (missingIds.length > 0) {
        const entries = await Promise.all(
          missingIds.map(async (id) => {
            const tRes = await fetch(`/api/admin/email/templates/${id}`, {
              credentials: "include",
            });
            const tJson = (await tRes.json()) as { template?: { name: string } };
            return [id, tJson.template?.name ?? `Template #${id}`] as const;
          }),
        );
        setTemplateNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- templateNames intentionally excluded to avoid refetch loops
  }, [campaignAppliedId]);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  const cancelSchedule = async (id: string) => {
    setCancellingId(id);
    try {
      await fetch(`/api/admin/email/schedules/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await fetchSchedules();
    } finally {
      setCancellingId(null);
    }
  };

  if (loading || schedules.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-accent/25 bg-accent/5 p-3.5">
      <p className="text-xs font-semibold text-accent">Upcoming scheduled emails</p>
      {schedules.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-3 rounded-lg bg-surface-primary px-3 py-2 text-xs"
        >
          <span className="text-foreground">
            {templateNames[s.template_id] ?? "…"} · {formatDisplayDateTime(s.scheduled_for)}
          </span>
          <button
            type="button"
            onClick={() => void cancelSchedule(s.id)}
            disabled={cancellingId === s.id}
            aria-label="Cancel scheduled email"
            className="text-muted hover:text-danger"
          >
            {cancellingId === s.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

const SNIPPET_LENGTH = 140;

/** Plain-text preview of an HTML email body, for the collapsed thread state --
 * a rough tag strip is enough here since it's discarded the moment the
 * message is expanded (which renders the real `body_html`). */
function htmlToSnippet(html: string, maxLength = SNIPPET_LENGTH): string {
  const text = html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}…`;
}

/** One message bubble in the thread. Every message is staff-sent today (no
 * inbound/candidate-reply ingestion exists yet -- see `ReplyToContext`'s doc
 * comment in `email-config/types.ts`), so the avatar/alignment is a single
 * style for now; this is the seam where an inbound message would get its own
 * (right-aligned/candidate-colored) treatment once that ships. */
function ThreadMessage({
  message,
  defaultExpanded,
  onReply,
}: {
  message: EmailMessageListItem;
  defaultExpanded: boolean;
  onReply: (message: EmailMessageListItem) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
        SH
      </div>
      <div className="min-w-0 flex-1 rounded-xl border border-divider bg-surface-secondary/10 p-3.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {message.from_email}
              <span className="ml-1.5 font-normal text-muted">
                to {message.to_email}
              </span>
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {formatDisplayDateTime(message.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_STATUS_STYLES[message.status] ?? ""}`}
            >
              {message.status}
            </span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted" />
            )}
          </div>
        </button>

        <p className="mt-2 text-sm font-semibold text-foreground">{message.subject}</p>

        {expanded ? (
          <div
            className="email-html-preview mt-1.5 max-w-none text-foreground"
            dangerouslySetInnerHTML={{ __html: message.body_html }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1 block truncate text-left text-xs text-muted hover:text-foreground"
          >
            {htmlToSnippet(message.body_html) || "(no content)"}
          </button>
        )}

        {message.error_message ? (
          <p className="mt-2 text-xs text-danger">{message.error_message}</p>
        ) : null}

        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold"
            onPress={() => onReply(message)}
          >
            <Reply className="h-3.5 w-3.5" />
            Reply
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CandidateEmailTab({
  campaignAppliedId,
  candidateId,
  candidateName,
  candidateEmail,
}: {
  /** The application to compose/schedule against -- always the currently
   * viewed application, regardless of `candidateId` below. */
  campaignAppliedId: string;
  /** When set, the list shows every email sent to this candidate across all
   * of their job applications instead of scoping to `campaignAppliedId`
   * alone. Composing and scheduled-email management still target
   * `campaignAppliedId`, since sending requires one specific application. */
  candidateId?: string;
  /** Shown as the "to" chip when composing a fresh (non-reply) email, before
   * any message in the thread exists to infer a recipient email from. */
  candidateName?: string | null;
  candidateEmail?: string | null;
}) {
  const [messages, setMessages] = useState<EmailMessageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<EmailMessageListItem | null>(null);
  const composeModal = useOverlayState();

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = candidateId
        ? `candidateId=${encodeURIComponent(candidateId)}`
        : `campaignAppliedId=${encodeURIComponent(campaignAppliedId)}`;
      const res = await fetch(`/api/admin/email/messages?${params}`, {
        credentials: "include",
      });
      const json = (await res.json()) as { error?: string; rows?: EmailMessageListItem[] };
      if (!res.ok) throw new Error(json.error ?? "Could not load email thread.");
      setMessages(json.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load email thread.");
    } finally {
      setLoading(false);
    }
  }, [campaignAppliedId, candidateId]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  // API returns newest-first (for the logs/table views) -- a thread reads
  // top-to-bottom oldest-first, like a conversation.
  const threadMessages = useMemo(() => [...messages].reverse(), [messages]);

  const replyToContext: ReplyToContext | null = replyTarget
    ? {
        subject: replyTarget.subject,
        bodyHtml: replyTarget.body_html,
        fromEmail: replyTarget.from_email,
        sentAt: replyTarget.sent_at,
      }
    : null;

  // Replying targets the application the original message actually belongs
  // to (relevant in the `candidateId`-wide thread, where that can differ
  // from the currently viewed application), falling back to the current
  // application for a fresh compose or a legacy row with no application on
  // file.
  const composeRecipients: BulkEmailRecipient[] = [
    {
      id: replyTarget?.campaign_applied_id ?? campaignAppliedId,
      candidate_name: candidateName ?? null,
      candidate_email: replyTarget?.to_email ?? candidateEmail ?? messages[0]?.to_email ?? null,
    },
  ];

  return (
    <SectionCard
      title="Email"
      description={
        candidateId
          ? "Every email sent to this candidate across all of their job applications, oldest first."
          : "Every email sent to this candidate for this application, oldest first."
      }
      actions={
        <Button
          variant="primary"
          size="sm"
          className="h-8 gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-accent-foreground"
          onPress={() => {
            setReplyTarget(null);
            composeModal.open();
          }}
        >
          <Mail className="h-3.5 w-3.5" />
          Soạn mail mới
        </Button>
      }
    >
      <div className="flex flex-col gap-3 pt-2">
        <UpcomingSchedules campaignAppliedId={campaignAppliedId} />

        {error ? (
          <Alert status="danger" className="rounded-xl">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {loading ? (
          <p className="py-6 text-center text-xs text-muted">Loading…</p>
        ) : threadMessages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-divider bg-surface-secondary/20 py-8 text-center text-sm text-muted">
            No emails sent yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {threadMessages.map((m, i) => (
              <ThreadMessage
                key={m.id}
                message={m}
                defaultExpanded={i === threadMessages.length - 1}
                onReply={(target) => {
                  setReplyTarget(target);
                  composeModal.open();
                }}
              />
            ))}
          </div>
        )}
      </div>

      <BulkEmailModal
        isOpen={composeModal.isOpen}
        onOpenChange={composeModal.setOpen}
        recipients={composeRecipients}
        onSent={() => void fetchMessages()}
        replyTo={replyToContext}
      />
    </SectionCard>
  );
}
