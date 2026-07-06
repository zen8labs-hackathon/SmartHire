"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Table, Card } from "@heroui/react";
import {
  DataTableToolbar,
  DataTablePagination,
  DataTableStats
} from "@/components/admin/shell/table-system";
import { SectionCard } from "@/components/admin/shell/cards";
import { Users, Shield, Compass, UserCheck } from "lucide-react";

export type OrgUser = {
  id: string;
  email: string | null;
  accessSummary: string;
};

export type UsersTableWrapperProps = {
  users: OrgUser[];
};

export function UsersTableWrapper({ users }: UsersTableWrapperProps) {
  const router = useRouter();
  const [isPendingRefresh, startRefreshTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // 1. Client-side search filtering
  const filteredUsers = users.filter((u) => {
    const email = u.email?.toLowerCase() ?? "";
    const summary = u.accessSummary.toLowerCase();
    const query = searchQuery.toLowerCase();
    return email.includes(query) || summary.includes(query);
  });

  // 2. Pagination calculation
  const totalCount = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = totalCount === 0 ? 0 : Math.min(startIdx - 1 + pageSize, totalCount);
  const paginatedUsers = filteredUsers.slice(startIdx - 1, endIdx);

  // 3. Statistics calculation
  const totalAccounts = users.length;
  const hrCount = users.filter((u) => u.accessSummary.toUpperCase().includes("HR")).length;
  const recruiterCount = users.filter((u) => u.accessSummary.toUpperCase().includes("CHAPTER")).length;
  const dashboardOnlyCount = totalAccounts - hrCount - recruiterCount;

  const stats = [
    {
      label: "Total Accounts",
      value: totalAccounts,
      icon: <Users className="h-4.5 w-4.5" />,
      description: "Active profiles in workspace"
    },
    {
      label: "HR Administrators",
      value: hrCount,
      icon: <Shield className="h-4.5 w-4.5 text-accent" />,
      description: "Full control access"
    },
    {
      label: "Chapter Recruiters",
      value: recruiterCount,
      icon: <Compass className="h-4.5 w-4.5" />,
      description: "Chapter-specific roles"
    },
    {
      label: "Dashboard Access",
      value: dashboardOnlyCount,
      icon: <UserCheck className="h-4.5 w-4.5" />,
      description: "Base dashboard view"
    }
  ];

  const handleRefresh = () => {
    startRefreshTransition(() => {
      router.refresh();
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1); // Reset to first page on search
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Dynamic Statistics Panel */}
      <DataTableStats stats={stats} />

      {/* Reusable Toolbar */}
      <DataTableToolbar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search users by email or role..."
        onRefresh={handleRefresh}
        isRefreshing={isPendingRefresh}
      />

      {/* Main Table Container */}
      <SectionCard title="Team Accounts" description="List of authorized recruiting members and their roles.">
        <Table aria-label="Team user accounts">
          <Table.ScrollContainer>
            <Table.Content>
              <Table.Header>
                <Table.Column isRowHeader>Email</Table.Column>
                <Table.Column>Access Summary</Table.Column>
              </Table.Header>
              <Table.Body>
                {paginatedUsers.length === 0 ? (
                  <Table.Row id="users-empty">
                    <Table.Cell
                      colSpan={2}
                      className="py-12 text-center text-sm text-muted font-medium"
                    >
                      No user accounts match your search.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  paginatedUsers.map((row) => (
                    <Table.Row key={row.id} id={row.id}>
                      <Table.Cell className="font-mono text-sm text-foreground py-3.5">
                        {row.email}
                      </Table.Cell>
                      <Table.Cell className="text-sm py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.accessSummary.toUpperCase().includes("HR")
                            ? "bg-accent/10 text-accent"
                            : "bg-surface-tertiary text-foreground border border-divider"
                        }`}>
                          {row.accessSummary}
                        </span>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>

        {/* Reusable Pagination Controls */}
        <DataTablePagination
          page={safePage}
          totalPages={totalPages}
          setPage={setPage}
          startIdx={startIdx}
          endIdx={endIdx}
          totalCount={totalCount}
          itemTypeLabel="accounts"
        />
      </SectionCard>
    </div>
  );
}
