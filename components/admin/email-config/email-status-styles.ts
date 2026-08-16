/** Badge color classes for `email_messages.status`, shared by every place
 * that lists or details an email message (logs tab, candidate email tab,
 * bulk-send delivery result). */
export const EMAIL_STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-danger/10 text-danger",
  pending_approval: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sending: "bg-accent/10 text-accent",
  cancelled: "bg-surface-secondary/60 text-muted",
  draft: "bg-surface-secondary/60 text-muted",
};
