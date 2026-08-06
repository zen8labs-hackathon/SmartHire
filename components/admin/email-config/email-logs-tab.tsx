"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListBox, Select, Table } from "@heroui/react";

import { EmailMessageDetailModal } from "@/components/admin/email-config/email-message-detail-modal";
import { EMAIL_STATUS_STYLES } from "@/components/admin/email-config/email-status-styles";
import type { EmailMessageListItem } from "@/components/admin/email-config/types";
import { SectionCard } from "@/components/admin/shell/cards";
import {
  DataTablePagination,
  DataTableToolbar,
} from "@/components/admin/shell/table-system";
import { useToast } from "@/components/admin/toast-provider";
import { formatDisplayDateTime } from "@/lib/format-date";

const STATUSES = [
  "draft",
  "pending_approval",
  "sending",
  "sent",
  "failed",
  "cancelled",
] as const;

const DEFAULT_PAGE_SIZE = 20;

export function EmailLogsTab() {
  const { error: toastError } = useToast();

  const [messages, setMessages] = useState<EmailMessageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<EmailMessageListItem | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/email/messages?${params}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        error?: string;
        rows?: EmailMessageListItem[];
        total?: number;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load email logs.");
      setMessages(json.rows ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Could not load email logs.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, toastError]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, total);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const filtersElement = useMemo(
    () => (
      <Select
        aria-label="Filter by status"
        value={statusFilter}
        onChange={(key) => {
          if (typeof key !== "string") return;
          setStatusFilter(key);
          setPage(1);
        }}
        className="w-48"
      >
        <Select.Trigger className="h-9 min-h-9 rounded-xl border border-divider bg-surface-secondary/40 px-2.5 text-xs font-semibold">
          <span className="capitalize">
            {statusFilter === "all" ? "All statuses" : statusFilter}
          </span>
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox className="p-1 border border-divider rounded-xl bg-surface-primary shadow-xl">
            <ListBox.Item
              id="all"
              textValue="All statuses"
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-secondary"
            >
              All statuses
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {STATUSES.map((s) => (
              <ListBox.Item
                key={s}
                id={s}
                textValue={s}
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs capitalize cursor-pointer hover:bg-surface-secondary"
              >
                {s}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    ),
    [statusFilter],
  );

  return (
    <SectionCard>
      <div className="flex flex-col gap-3">
        <DataTableToolbar
          filters={filtersElement}
          onRefresh={() => void fetchMessages()}
          isRefreshing={loading}
        />

        <Table aria-label="Email logs">
          <Table.ScrollContainer>
            <Table.Content>
              <Table.Header>
                <Table.Column isRowHeader>To</Table.Column>
                <Table.Column>Subject</Table.Column>
                <Table.Column>Trigger</Table.Column>
                <Table.Column>Type</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column>Sent at</Table.Column>
              </Table.Header>
              <Table.Body
                key={
                  loading
                    ? "email-logs-loading"
                    : messages.length === 0
                      ? "email-logs-empty"
                      : "email-logs-data"
                }
              >
                {loading ? (
                  <Table.Row id="email-logs-row-loading">
                    <Table.Cell
                      colSpan={6}
                      className="py-12 text-center text-sm text-muted font-medium"
                    >
                      Loading email logs...
                    </Table.Cell>
                  </Table.Row>
                ) : messages.length === 0 ? (
                  <Table.Row id="email-logs-row-empty">
                    <Table.Cell
                      colSpan={6}
                      className="py-12 text-center text-sm text-muted font-medium"
                    >
                      No emails sent yet.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  messages.map((m) => (
                    <Table.Row
                      key={m.id}
                      id={m.id}
                      className="cursor-pointer"
                      onAction={() => setSelected(m)}
                    >
                      <Table.Cell className="py-3.5 text-foreground">{m.to_email}</Table.Cell>
                      <Table.Cell className="max-w-xs truncate py-3.5 text-foreground">
                        {m.subject}
                      </Table.Cell>
                      <Table.Cell className="py-3.5 text-muted">
                        {m.trigger_type ?? "—"}
                      </Table.Cell>
                      <Table.Cell className="py-3.5 text-muted capitalize">{m.type}</Table.Cell>
                      <Table.Cell className="py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_STATUS_STYLES[m.status] ?? ""}`}
                        >
                          {m.status}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="py-3.5 text-muted">
                        {m.sent_at ? formatDisplayDateTime(m.sent_at) : "—"}
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>

        <DataTablePagination
          page={safePage}
          totalPages={totalPages}
          setPage={setPage}
          startIdx={startIdx}
          endIdx={endIdx}
          totalCount={total}
          itemTypeLabel="emails"
          pageSize={pageSize}
          setPageSize={handlePageSizeChange}
        />
      </div>

      <EmailMessageDetailModal
        message={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </SectionCard>
  );
}
