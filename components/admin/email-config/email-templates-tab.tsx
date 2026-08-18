"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ListBox, Modal, Select } from "@heroui/react";
import { Eye, FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { EmailTemplateFormModal } from "@/components/admin/email-config/email-template-form-modal";
import { EmailTemplatePreviewModal } from "@/components/admin/email-config/email-template-preview-modal";
import type { EmailSettingsData, EmailTemplateListItem } from "@/components/admin/email-config/types";
import { SectionCard } from "@/components/admin/shell/cards";
import { DataTablePagination } from "@/components/admin/shell/table-system";
import { useToast } from "@/components/admin/toast-provider";
import {
  EMAIL_TRIGGER_CATEGORIES,
  EMAIL_TRIGGER_CATEGORY_LABELS,
  EMAIL_TRIGGER_TYPES,
  type EmailTriggerCategory,
} from "@/lib/email/trigger-types";

const TRIGGER_LABEL_BY_VALUE = new Map<string, string>(
  EMAIL_TRIGGER_TYPES.map((t) => [t.value, t.label]),
);
const CATEGORY_BY_TRIGGER_VALUE = new Map<string, EmailTriggerCategory>(
  EMAIL_TRIGGER_TYPES.map((t) => [t.value, t.category]),
);

const CATEGORY_FILTER_OPTIONS: { id: EmailTriggerCategory | "all"; label: string }[] = [
  { id: "all", label: "All categories" },
  ...EMAIL_TRIGGER_CATEGORIES.map((c) => ({ id: c, label: EMAIL_TRIGGER_CATEGORY_LABELS[c] })),
];

const DEFAULT_PAGE_SIZE = 9;
const PAGE_SIZE_OPTIONS = [9, 18, 36, 60];

/** Anyone can create a template, but only its creator or an Admin can edit/delete it. */
function canManageTemplate(
  t: EmailTemplateListItem,
  isAdmin: boolean,
  currentUserId: string,
): boolean {
  return isAdmin || t.created_by === currentUserId;
}

export function SheetSkeleton() {
  return <div className="relative w-[76px] h-[90px] bg-white border border-gray-200 rounded-sm shadow-[0_5px_12px_-6px_rgba(16,24,40,0.18)] p-[11px_9px_9px]
  before:content-[''] before:absolute before:top-0 before:right-0
  before:[border-style:solid] before:[border-width:0_11px_11px_0]
  before:[border-color:transparent_#f9fafb_transparent_transparent]
  after:content-[''] after:absolute after:top-0 after:right-0
  after:[border-style:solid] after:[border-width:0_11px_11px_0]
  after:[border-color:transparent_#fff_transparent_transparent]
  after:[filter:drop-shadow(-1px_1px_1px_rgba(16,24,40,0.16))]
  after:[clip-path:polygon(100%_0,0_0,100%_100%)]
  after:scale-[0.86] after:translate-x-px after:translate-y-px">

    <div className="w-[70%] h-1.5 rounded-[3px] bg-gray-300 mb-2"></div>
    <div className="w-[88%] h-1 rounded-[3px] bg-[#eceef1] mb-[5px]"></div>
    <div className="w-[72%] h-1 rounded-[3px] bg-[#eceef1] mb-[5px]"></div>
    <div className="w-[80%] h-1 rounded-[3px] bg-[#eceef1] mb-[5px]"></div>
    <div className="w-1/2 h-1 rounded-[3px] bg-[#eceef1] mb-[5px]"></div>
  </div>
}

export function EmailTemplatesTab({
  initialTemplates,
  isAdmin,
  currentUserId,
}: {
  initialTemplates: EmailTemplateListItem[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const { success, error: toastError } = useToast();

  const [templates, setTemplates] = useState(initialTemplates);
  const [categoryFilter, setCategoryFilter] = useState<EmailTriggerCategory | "all">(
    "all",
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplateListItem | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplateListItem | null>(
    null,
  );
  const [previewSettings, setPreviewSettings] = useState<EmailSettingsData | null>(null);

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/email/settings", { credentials: "include" });
      const json = (await res.json()) as { settings?: EmailSettingsData };
      if (!cancelled) setPreviewSettings(json.settings ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewOpen]);

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return templates;
    return templates.filter(
      (t) => CATEGORY_BY_TRIGGER_VALUE.get(t.trigger_type) === categoryFilter,
    );
  }, [templates, categoryFilter]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = totalCount === 0 ? 0 : Math.min(startIdx - 1 + pageSize, totalCount);
  const paginated = useMemo(
    () => filtered.slice(startIdx - 1, endIdx),
    [filtered, startIdx, endIdx],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const openCreate = useCallback(() => {
    setEditingTemplate(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((template: EmailTemplateListItem) => {
    setEditingTemplate(template);
    setFormOpen(true);
  }, []);

  const handleSaved = useCallback((saved: EmailTemplateListItem) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === saved.id);
      return exists
        ? prev.map((t) => (t.id === saved.id ? saved : t))
        : [...prev, saved];
    });
    setFormOpen(false);
  }, []);

  const handleDelete = useCallback(
    async (template: EmailTemplateListItem) => {
      if (!confirm(`Delete template "${template.name}"?`)) return;
      setDeletingId(template.id);
      try {
        const res = await fetch(`/api/admin/email/templates/${template.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Could not delete template.");
        }
        setTemplates((prev) => prev.filter((t) => t.id !== template.id));
        success(`Template "${template.name}" deleted.`);
      } catch (e) {
        toastError(e instanceof Error ? e.message : "Could not delete template.");
      } finally {
        setDeletingId(null);
      }
    },
    [success, toastError],
  );

  const categoryFilterLabel =
    CATEGORY_FILTER_OPTIONS.find((o) => o.id === categoryFilter)?.label ?? "All categories";

  return (
    <SectionCard>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">Category:</span>
            <Select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(key) => {
                if (typeof key === "string")
                  setCategoryFilter(key as EmailTriggerCategory | "all");
              }}
              className="w-48"
            >
              <Select.Trigger className="h-9 min-h-9 rounded-xl border border-divider bg-surface-secondary/40 px-2.5 text-xs font-semibold">
                <span className="truncate">{categoryFilterLabel}</span>
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox className="max-h-72 overflow-y-auto p-1 border border-divider rounded-xl bg-surface-primary shadow-xl">
                  {CATEGORY_FILTER_OPTIONS.map((opt) => (
                    <ListBox.Item
                      key={opt.id}
                      id={opt.id}
                      textValue={opt.label}
                      className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-secondary"
                    >
                      {opt.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>

          <Button
            variant="primary"
            className="h-9 gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-semibold text-accent-foreground"
            onPress={openCreate}
          >
            <Plus className="h-3.5 w-3.5" />
            New Template
          </Button>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-divider bg-surface-secondary/20 py-8 text-center text-sm text-muted">
            No templates yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-200">
            {paginated.map((t) => {
              const triggerCat = CATEGORY_BY_TRIGGER_VALUE.get(t.trigger_type) as EmailTriggerCategory;
              const triggerCatLabel = EMAIL_TRIGGER_CATEGORY_LABELS[triggerCat] ?? "—";
              const triggerLabel = TRIGGER_LABEL_BY_VALUE.get(t.trigger_type) ?? t.trigger_type;

              return (
                <div
                  key={t.id}
                  className="flex flex-col gap-3 rounded-2xl border border-divider bg-surface-primary p-4 shadow-sm transition-all duration-200 hover:border-accent/40 hover:shadow-md"
                >
                  {/* Thumbnail: a generic "document" preview -- templates have
                      no thumbnail/attachment of their own, this just gives
                      the grid the same document-card visual language as
                      other file listings in the app. */}
                  <div className="bg-grid-pattern relative flex h-28 items-center justify-center overflow-hidden rounded-xl bg-surface-secondary/50">
                    <span className="absolute left-2 top-2 rounded-md bg-surface-primary/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted shadow-sm">
                      Doc
                    </span>
                    <div className="flex h-20 w-18 items-center justify-center rounded-lg bg-surface-primary shadow-sm">
                      {/* <FileText className="h-10 w-10 text-muted/60" /> */}
                      <SheetSkeleton />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {/* Header: Title and status badge */}
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-sm font-bold text-foreground" title={t.name}>
                        {t.name}
                      </h4>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {t.is_active ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata items */}
                    {/* <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-muted">
                        <span>Trigger Category</span>
                        <span className="font-semibold text-foreground">
                          {capitalizeFirstLetter(triggerCatLabel.toLowerCase())}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-muted">
                        <span>Trigger Type</span>
                        <span className="font-semibold text-foreground">
                          {capitalizeFirstLetter(triggerLabel.toLowerCase())}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-muted">
                        <span>Auto-send</span>
                        <span>
                          {t.is_auto_send ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Auto
                            </span>
                          ) : (
                            <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[9px] font-semibold text-muted">
                              Manual
                            </span>
                          )}
                        </span>
                      </div>
                    </div> */}
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-between border-t border-divider/60 pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 rounded-full border border-divider px-3 text-[11px] font-semibold text-muted hover:bg-surface-secondary hover:text-foreground"
                      onPress={() => {
                        setPreviewTemplate(t);
                        setPreviewOpen(true);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </Button>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        isIconOnly
                        aria-label={canManageTemplate(t, isAdmin, currentUserId) ? "Edit template" : "View template details"}
                        className="h-8 w-8 rounded-full border border-divider text-muted hover:bg-surface-secondary hover:text-foreground"
                        onPress={() => openEdit(t)}
                      >
                        {canManageTemplate(t, isAdmin, currentUserId) ? (
                          <Pencil className="h-3.5 w-3.5" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {canManageTemplate(t, isAdmin, currentUserId) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          isIconOnly
                          aria-label="Delete template"
                          className="h-8 w-8 rounded-full bg-danger/10 text-danger hover:bg-danger/20"
                          isDisabled={deletingId === t.id}
                          onPress={() => void handleDelete(t)}
                        >
                          {deletingId === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filtered.length > 0 ? (
          <DataTablePagination
            page={safePage}
            totalPages={totalPages}
            setPage={setPage}
            startIdx={startIdx}
            endIdx={endIdx}
            totalCount={totalCount}
            itemTypeLabel="templates"
            pageSize={pageSize}
            setPageSize={handlePageSizeChange}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        ) : null}
      </div>

      <EmailTemplateFormModal
        isOpen={formOpen}
        onOpenChange={setFormOpen}
        template={editingTemplate}
        canEdit={!editingTemplate || canManageTemplate(editingTemplate, isAdmin, currentUserId)}
        onSaved={handleSaved}
      />

      {previewTemplate ? (
        <EmailTemplatePreviewModal
          isOpen={previewOpen}
          onOpenChange={setPreviewOpen}
          name={previewTemplate.name}
          subjectTemplate={previewTemplate.subject_template}
          bodyTemplate={previewTemplate.body_template}
          triggerType={previewTemplate.trigger_type}
          defaultCc={previewTemplate.default_cc}
          defaultBcc={previewTemplate.default_bcc}
          fromEmail={previewSettings?.default_sender}
          companyName={previewSettings?.company_name}
          layoutType={previewSettings?.layout_type}
          customLayoutHtml={previewSettings?.custom_layout_html}
          logoUrl={previewSettings?.logo_url}
        />
      ) : null}
    </SectionCard>
  );
}

function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

