"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useOverlayState, Card, Table, Button, Chip, Modal, Tooltip } from "@heroui/react";
import { Plus as PlusIcon, Pencil as PencilIcon, Trash2 as TrashIcon } from "lucide-react";

import { AddUserForm } from "@/components/admin/add-user-form";
import { EditUserAccessForm } from "@/components/admin/edit-user-access-form";
import { adminDeleteUser, type AdminDeleteUserState } from "@/app/admin/actions";
import type { OrgUserRow } from "@/lib/admin/list-org-users";
import type { ChapterOption } from "@/components/admin/chapter-role-picker";

function AccessBadges({ user }: { user: OrgUserRow }) {
  if (user.isAdmin || user.workChapter === "HR" || user.chapterMemberships.length > 0) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {user.isAdmin ? (
          <Chip color="warning" variant="soft" size="sm">
            Admin
          </Chip>
        ) : null}
        {user.workChapter === "HR" ? (
          <Chip color="accent" variant="soft" size="sm">
            HR
          </Chip>
        ) : null}
        {user.chapterMemberships.map((m) => (
          <Chip
            key={m.chapterId}
            color={m.role === "head" ? "success" : "default"}
            variant="soft"
            size="sm"
          >
            {m.chapterName} · {m.role}
          </Chip>
        ))}
      </div>
    );
  }
  return <span className="text-sm text-muted">Dashboard only</span>;
}

function DeleteUserModal({
  user,
  isOpen,
  onOpenChange,
}: {
  user: OrgUserRow | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const [state, formAction] = useActionState<AdminDeleteUserState, FormData>(
    adminDeleteUser,
    null,
  );

  useEffect(() => {
    if (state?.message) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Modal.Backdrop
      className="bg-black/40 backdrop-blur-sm"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-sm overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="border-b border-divider px-6 py-5">
            <Modal.Heading>Delete user</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="px-6 py-5">
            <p className="text-sm text-muted">
              This permanently deletes{" "}
              <span className="font-mono text-foreground">{user?.email}</span>{" "}
              and all their recruiting access. This action cannot be undone.
            </p>
            {state?.error ? (
              <p className="mt-3 text-sm text-danger">{state.error}</p>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="justify-end gap-2 border-t border-divider px-6 py-4">
            <form action={formAction}>
              <input type="hidden" name="user_id" value={user?.id ?? ""} />
              <div className="flex gap-2">
                <Button variant="secondary" onPress={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <DeleteSubmitButton />
              </div>
            </form>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className="bg-danger text-white hover:bg-danger/90"
      isDisabled={pending}
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}

export function UsersManager({
  users,
  chapters,
}: {
  users: OrgUserRow[];
  chapters: readonly ChapterOption[];
}) {
  const addModal = useOverlayState();
  const editModal = useOverlayState();
  const deleteModal = useOverlayState();
  const [editingUser, setEditingUser] = useState<OrgUserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<OrgUserRow | null>(null);

  return (
    <>
      <Card variant="secondary" className="border-divider">
        <Card.Header className="flex flex-row items-center justify-between gap-4 border-b border-divider px-5 py-4">
          <div>
            <Card.Title className="text-base">Team accounts</Card.Title>
            <Card.Description>
              {users.length} user{users.length === 1 ? "" : "s"} in this project.
            </Card.Description>
          </div>
          <Button variant="primary" size="sm" onPress={addModal.open}>
            <PlusIcon className="size-4" />
            Add user
          </Button>
        </Card.Header>
        <Card.Content className="p-0">
          <Table aria-label="Team user accounts">
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader>Email</Table.Column>
                  <Table.Column>Access</Table.Column>
                  <Table.Column>Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {users.length === 0 ? (
                    <Table.Row id="users-empty">
                      <Table.Cell
                        colSpan={3}
                        className="py-10 text-center text-sm text-muted"
                      >
                        No users found.
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    users.map((row) => (
                      <Table.Row key={row.id} id={row.id}>
                        <Table.Cell className="font-mono text-sm text-foreground">
                          {row.email}
                        </Table.Cell>
                        <Table.Cell>
                          <AccessBadges user={row} />
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center gap-1">
                            <Tooltip delay={0}>
                              <Button
                                aria-label={`Edit ${row.email}`}
                                variant="ghost"
                                size="sm"
                                className="min-w-0 px-2"
                                onPress={() => {
                                  setEditingUser(row);
                                  editModal.open();
                                }}
                              >
                                <PencilIcon className="size-4" />
                              </Button>
                              <Tooltip.Content placement="top" showArrow>
                                <Tooltip.Arrow />
                                <p>Edit access</p>
                              </Tooltip.Content>
                            </Tooltip>
                            <Tooltip delay={0}>
                              <Button
                                aria-label={`Delete ${row.email}`}
                                variant="ghost"
                                size="sm"
                                className="min-w-0 px-2 text-danger hover:bg-danger/10"
                                onPress={() => {
                                  setDeletingUser(row);
                                  deleteModal.open();
                                }}
                              >
                                <TrashIcon className="size-4" />
                              </Button>
                              <Tooltip.Content placement="top" showArrow>
                                <Tooltip.Arrow />
                                <p>Delete</p>
                              </Tooltip.Content>
                            </Tooltip>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>

      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={addModal.isOpen}
        onOpenChange={addModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading>Invite user</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[75vh] overflow-y-auto px-6 py-5">
              <AddUserForm chapters={chapters} onCreated={addModal.close} />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop
        className="bg-black/40 backdrop-blur-sm"
        isOpen={editModal.isOpen}
        onOpenChange={editModal.setOpen}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-md overflow-hidden p-0">
            <Modal.CloseTrigger />
            <Modal.Header className="border-b border-divider px-6 py-5">
              <Modal.Heading>Edit user access</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="max-h-[75vh] overflow-y-auto px-6 py-5">
              {editingUser ? (
                <EditUserAccessForm
                  key={editingUser.id}
                  user={editingUser}
                  chapters={chapters}
                  onSaved={editModal.close}
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <DeleteUserModal
        user={deletingUser}
        isOpen={deleteModal.isOpen}
        onOpenChange={deleteModal.setOpen}
      />
    </>
  );
}

export default UsersManager;
