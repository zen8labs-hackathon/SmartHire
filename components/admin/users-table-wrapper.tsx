"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Table,
  Label,
  ListBox,
  Select,
  Modal,
  Button,
  Input,
  TextField,
} from "@heroui/react";
import {
  DataTableToolbar,
  DataTablePagination,
  DataTableStats,
} from "@/components/admin/shell/table-system";
import { SectionCard } from "@/components/admin/shell/cards";
import { usePageQueryParam } from "@/components/admin/shell/use-page-query-param";
import { useDebouncedValue } from "@/components/admin/shell/use-debounced-value";
import type {
  UsersListCounts,
  UsersRoleFilter,
} from "@/lib/admin/users-list-query";
import type { ChapterMembership } from "@/lib/admin/list-org-users";
import {
  Users,
  Shield,
  Compass,
  UserCheck,
  Edit2,
  Key,
  Trash2,
} from "lucide-react";
import {
  AddUserForm,
  type AddUserChapterOption,
} from "@/components/admin/add-user-form";
import {
  EditUserForm,
  type EditUserData,
} from "@/components/admin/edit-user-form";
import {
  adminDeleteUser,
  adminGetUserDetails,
  adminUpdateUserPassword,
} from "@/app/admin/actions";
import { useToast } from "@/components/admin/toast-provider";
import type { ProfileRole } from "@/lib/db/users";

export type OrgUser = {
  id: string;
  email: string | null;
  accessSummary: string;
  role: ProfileRole;
  chapterMemberships?: ChapterMembership[];
};

type Pagination = { total: number; limit: number; offset: number };

export type UsersTableWrapperProps = {
  initialUsers: OrgUser[];
  initialPagination: Pagination;
  initialCounts: UsersListCounts;
  chapters: readonly AddUserChapterOption[];
  /** The signed-in HR/admin viewing this page -- disables self-deletion in the table. */
  currentUserId: string;
};

const ROLE_OPTIONS: { id: UsersRoleFilter; label: string }[] = [
  { id: "all", label: "All roles" },
  { id: "admin", label: "Admin" },
  { id: "hr", label: "HR" },
  { id: "chapter", label: "Chapter Recruiters" },
  { id: "dashboard", label: "Dashboard only" },
];

const BADGE_BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

function RoleBadges({ user }: { user: OrgUser }) {
  const chapterMemberships = user.chapterMemberships ?? [];
  const isAdmin = user.role === "admin";
  const isHr = user.role === "hr";

  if (!isAdmin && !isHr && chapterMemberships.length === 0) {
    return (
      <span
        className={`${BADGE_BASE} bg-surface-tertiary text-foreground border border-divider`}
      >
        Dashboard only
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isAdmin ? (
        <span
          className={`${BADGE_BASE} bg-rose-500/10 text-rose-600 dark:text-rose-400`}
        >
          Admin
        </span>
      ) : null}
      {isHr ? (
        <span
          className={`${BADGE_BASE} bg-brand-gold/15 text-brand-green dark:text-brand-gold`}
        >
          HR
        </span>
      ) : null}
      {chapterMemberships.map((c) => (
        <span
          key={c.chapterId}
          className={`${BADGE_BASE} ${
            c.role === "head"
              ? "bg-emerald-500 text-white"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {c.chapterName} · {c.role === "head" ? "Head" : "Member"}
        </span>
      ))}
    </div>
  );
}

export function UsersTableWrapper({
  initialUsers,
  initialPagination,
  initialCounts,
  chapters,
  currentUserId,
}: UsersTableWrapperProps) {
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 350);
  const [roleFilter, setRoleFilter] = useState<UsersRoleFilter>("all");
  const [page, setPage] = usePageQueryParam();
  const [pageSize, setPageSize] = useState(initialPagination.limit);

  const [users, setUsers] = useState<OrgUser[]>(initialUsers);
  const [pagination, setPagination] = useState<Pagination>(initialPagination);
  const [counts, setCounts] = useState<UsersListCounts>(initialCounts);
  const [loading, setLoading] = useState(false);

  // Modal & overlay states
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserData, setEditUserData] = useState<EditUserData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [passwordUserEmail, setPasswordUserEmail] = useState<string | null>(
    null,
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserEmail, setDeleteUserEmail] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    [setPage],
  );

  const skipInitialFetchRef = useRef(true);
  const skipInitialPageResetRef = useRef(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearchQuery.trim())
        params.set("q", debouncedSearchQuery.trim());
      if (roleFilter !== "all") params.set("role", roleFilter);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));

      const res = await fetch(`/api/admin/users?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        users?: OrgUser[];
        pagination?: Pagination;
        counts?: UsersListCounts;
      };
      setUsers(json.users ?? []);
      setPagination(
        json.pagination ?? { total: 0, limit: pageSize, offset: 0 },
      );
      setCounts(
        json.counts ?? {
          total: 0,
          admin: 0,
          hr: 0,
          recruiter: 0,
          dashboardOnly: 0,
        },
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchQuery, roleFilter, page, pageSize]);

  useEffect(() => {
    if (skipInitialPageResetRef.current) {
      skipInitialPageResetRef.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearchQuery, roleFilter]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    void fetchUsers();
  }, [fetchUsers]);

  const handleInviteSuccess = () => {
    setInviteModalOpen(false);
    void fetchUsers();
  };

  const handleStartEdit = async (user: OrgUser) => {
    setEditingUserId(user.id);
    setLoadingDetails(true);
    setEditModalOpen(true);
    try {
      const details = await adminGetUserDetails(user.id);
      setEditUserData({
        id: details.id,
        email: details.email,
        recruitingAccess: details.recruitingAccess,
        chapterIds: details.chapterIds,
        chapterHeadIds: details.chapterHeadIds,
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to load user details.");
      setEditModalOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleEditSuccess = () => {
    setEditModalOpen(false);
    setEditUserData(null);
    void fetchUsers();
  };

  const handleStartChangePassword = (user: OrgUser) => {
    setPasswordUserId(user.id);
    setPasswordUserEmail(user.email);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordModalOpen(true);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUserId) return;
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setPasswordSubmitting(true);
    try {
      const res = await adminUpdateUserPassword(passwordUserId, newPassword);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success(res?.message || "Password updated successfully.");
        setPasswordModalOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleStartDelete = (user: OrgUser) => {
    setDeleteUserId(user.id);
    setDeleteUserEmail(user.email);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteUserId) return;
    setDeleteSubmitting(true);
    try {
      const res = await adminDeleteUser(deleteUserId);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success(res?.message || "User account deleted successfully.");
        setDeleteDialogOpen(false);
        void fetchUsers();
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const totalCount = pagination.total;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx =
    totalCount === 0 ? 0 : Math.min(startIdx - 1 + pageSize, totalCount);

  const stats = [
    {
      label: "Total Accounts",
      value: counts.total,
      icon: <Users className="h-4.5 w-4.5" />,
      description: "Active profiles in workspace",
    },
    {
      label: "Admin",
      value: counts.admin,
      icon: <Shield className="h-4.5 w-4.5 text-rose-500" />,
      description: "Workspace administrators",
    },
    {
      label: "HR",
      value: counts.hr,
      icon: <Shield className="h-4.5 w-4.5 text-accent" />,
      description: "Full recruitment control",
    },
    {
      label: "Chapter Recruiters",
      value: counts.recruiter,
      icon: <Compass className="h-4.5 w-4.5" />,
      description: "Chapter-specific roles",
    },
    // {
    //   label: "Dashboard only",
    //   value: counts.dashboardOnly,
    //   icon: <UserCheck className="h-4.5 w-4.5" />,
    //   description: "Base dashboard view"
    // }
  ];

  const roleFilterElement = (
    <Select
      value={roleFilter}
      onChange={(key) => {
        if (typeof key === "string") setRoleFilter(key as UsersRoleFilter);
      }}
      className="w-48"
    >
      <Select.Trigger className="w-full h-9 rounded-xl border border-divider bg-surface-secondary/40 text-xs">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox className="p-1 border border-divider rounded-2xl bg-surface-primary shadow-xl">
          {ROLE_OPTIONS.map((opt) => (
            <ListBox.Item
              key={opt.id}
              id={opt.id}
              textValue={opt.label}
              className="text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-surface-secondary cursor-pointer"
            >
              {opt.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  return (
    <>
      {/* Dynamic Statistics Panel */}
      <DataTableStats stats={stats} />

      {/* Reusable Toolbar */}
      <DataTableToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search users by email or username..."
        createButtonLabel="Add User"
        onCreate={() => setInviteModalOpen(true)}
        filters={roleFilterElement}
        onRefresh={fetchUsers}
        isRefreshing={loading}
      />

      {/* Main Table Container */}
      <SectionCard>
        <Table aria-label="Team user accounts">
          <Table.ScrollContainer>
            <Table.Content>
              <Table.Header>
                <Table.Column isRowHeader>Email</Table.Column>
                <Table.Column>Access Summary</Table.Column>
                <Table.Column className="text-right">Actions</Table.Column>
              </Table.Header>
              <Table.Body>
                {users.length === 0 ? (
                  <Table.Row id="users-empty">
                    <Table.Cell
                      colSpan={3}
                      className="py-12 text-center text-sm text-muted font-medium"
                    >
                      No user accounts match your search.
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  users.map((row) => (
                    <Table.Row key={row.id} id={row.id}>
                      <Table.Cell className="font-mono text-sm text-foreground py-3.5">
                        {row.email}
                      </Table.Cell>
                      <Table.Cell className="text-sm py-3.5">
                        <RoleBadges user={row} />
                      </Table.Cell>
                      <Table.Cell className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            isIconOnly
                            size="sm"
                            className="h-8 w-8 rounded-lg border border-divider hover:bg-surface-secondary text-muted hover:text-foreground cursor-pointer"
                            aria-label="Edit Access"
                            onPress={() => handleStartEdit(row)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            isIconOnly
                            size="sm"
                            className="h-8 w-8 rounded-lg border border-divider hover:bg-surface-secondary text-muted hover:text-foreground cursor-pointer"
                            aria-label="Change Password"
                            onPress={() => handleStartChangePassword(row)}
                          >
                            <Key className="h-3.5 w-3.5" />
                          </Button>
                          {currentUserId !== row.id && (
                            <Button
                              variant="ghost"
                              isIconOnly
                              size="sm"
                              className="h-8 w-8 rounded-lg border border-divider hover:bg-surface-secondary text-danger/70 hover:text-danger cursor-pointer"
                              aria-label="Delete User"
                              onPress={() => handleStartDelete(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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
          pageSize={pageSize}
          setPageSize={handlePageSizeChange}
        />
      </SectionCard>

      {/* Invite User Modal */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm z-[100]"
        isOpen={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
      >
        <Modal.Container className="z-[100] w-full max-w-md">
          <Modal.Dialog className="max-h-[90vh] w-full overflow-hidden rounded-2xl border border-divider bg-surface-primary p-0 shadow-2xl">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading className="text-base font-semibold">
                Invite User
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="px-6 py-5 overflow-y-auto">
              <AddUserForm
                chapters={chapters}
                onSuccess={handleInviteSuccess}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Edit Access Modal */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm z-[100]"
        isOpen={editModalOpen}
        onOpenChange={setEditModalOpen}
      >
        <Modal.Container className="z-[100] w-full max-w-md">
          <Modal.Dialog className="max-h-[90vh] w-full overflow-hidden rounded-2xl border border-divider bg-surface-primary p-0 shadow-2xl">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading className="text-base font-semibold">
                Edit User Access
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="px-6 py-5 overflow-y-auto min-h-[150px]">
              {loadingDetails ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="text-xs text-muted font-medium animate-pulse">
                    Loading user details...
                  </span>
                </div>
              ) : editUserData ? (
                <EditUserForm
                  chapters={chapters}
                  initialData={editUserData}
                  onSuccess={handleEditSuccess}
                  onCancel={() => setEditModalOpen(false)}
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Change Password Modal */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm z-[100]"
        isOpen={passwordModalOpen}
        onOpenChange={setPasswordModalOpen}
      >
        <Modal.Container className="z-[100] w-full max-w-md">
          <Modal.Dialog className="max-h-[90vh] w-full overflow-hidden rounded-2xl border border-divider bg-surface-primary p-0 shadow-2xl">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading className="text-base font-semibold">
                Change Password
              </Modal.Heading>
            </Modal.Header>
            <form onSubmit={handlePasswordSubmit}>
              <Modal.Body className="px-6 py-5 flex flex-col gap-4">
                <TextField
                  isReadOnly
                  name="email"
                  value={passwordUserEmail ?? ""}
                >
                  <Label>Email</Label>
                  <Input className="opacity-70 cursor-not-allowed bg-surface-secondary/20" />
                </TextField>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-foreground/80 tracking-wide">
                    New Password
                  </Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-divider bg-surface-secondary/40 text-sm text-foreground outline-none transition-all duration-200 hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:bg-background"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-foreground/80 tracking-wide">
                    Confirm New Password
                  </Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-divider bg-surface-secondary/40 text-sm text-foreground outline-none transition-all duration-200 hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:bg-background"
                    required
                  />
                </div>
              </Modal.Body>
              <Modal.Footer className="border-t border-divider px-6 py-4 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onPress={() => setPasswordModalOpen(false)}
                  isDisabled={passwordSubmitting}
                  className="h-9 px-4 rounded-xl border border-divider text-xs font-semibold hover:bg-surface-secondary cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={passwordSubmitting}
                  className="h-9 px-4 rounded-xl bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/90 cursor-pointer"
                >
                  {passwordSubmitting ? "Updating..." : "Update Password"}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Delete User Modal */}
      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm z-[100]"
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <Modal.Container className="z-[100] w-full max-w-sm">
          <Modal.Dialog className="max-h-[90vh] w-full overflow-hidden rounded-2xl border border-divider bg-surface-primary p-0 shadow-2xl">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5 bg-danger/5">
              <Modal.Heading className="text-base font-semibold text-danger">
                Delete User Account
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="px-6 py-5 text-sm text-foreground leading-normal">
              Are you sure you want to permanently delete the account for{" "}
              <strong className="font-mono text-xs">{deleteUserEmail}</strong>?
              This action cannot be undone and will remove all their access
              permissions and roles.
            </Modal.Body>
            <Modal.Footer className="border-t border-divider px-6 py-4 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onPress={() => setDeleteDialogOpen(false)}
                isDisabled={deleteSubmitting}
                className="h-9 px-4 rounded-xl border border-divider text-xs font-semibold hover:bg-surface-secondary cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isDisabled={deleteSubmitting}
                onPress={handleDeleteConfirm}
                className="h-9 px-4 rounded-xl bg-danger hover:bg-danger/90 text-white text-xs font-semibold shadow-md cursor-pointer"
              >
                {deleteSubmitting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
