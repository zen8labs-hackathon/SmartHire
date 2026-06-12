import React, { type DragEvent, type ChangeEvent } from "react";
import { Modal, Card, Button, TextField, Label, Input, TextArea, Select, ListBox } from "@heroui/react";
import { SectionLabel } from "./shared-components";
import { CheckCircle as CheckCircleIcon } from "lucide-react";
import { useJdDashboard } from "./context";

const HIRE_TYPE_OPTIONS = ["New hire", "Replacement"] as const;

export function JdEditModal() {
  const {
    editIntakeModal,
    editJdFileInputRef,
    ingestJdFileForEdit,
    editDragOver,
    setEditDragOver,
    editUploadPhase,
    editSelectedFileName,
    editUploadError,
    editForm,
    setEditField,
    editError,
    editSubmitting,
    handleEditSave,
  } = useJdDashboard();

  return (
    <Modal.Backdrop
      className="bg-black/40 backdrop-blur-sm"
      isOpen={editIntakeModal.isOpen}
      onOpenChange={editIntakeModal.setOpen}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-[860px] overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="items-start border-b border-divider px-6 py-5">
            <Modal.Heading className="text-xl">Hiring details</Modal.Heading>
          </Modal.Header>

          <Modal.Body className="max-h-[76vh] space-y-6 overflow-y-auto px-6 py-6">
            <input
              ref={editJdFileInputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              aria-hidden
              tabIndex={-1}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) void ingestJdFileForEdit(f);
              }}
            />

            {/* Attach JD (optional) — same flow as Create; fills overlapping intake fields */}
            <Card
              variant="secondary"
              className={
                editDragOver
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                  : undefined
              }
            >
              <Card.Content
                className="items-center gap-3 py-6 text-center"
                onDragOver={(e: DragEvent) => {
                  if (
                    editUploadPhase === "uploading" ||
                    editUploadPhase === "extracting"
                  )
                    return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setEditDragOver(true);
                }}
                onDragLeave={() => setEditDragOver(false)}
                onDrop={(e: DragEvent) => {
                  if (
                    editUploadPhase === "uploading" ||
                    editUploadPhase === "extracting"
                  )
                    return;
                  e.preventDefault();
                  setEditDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void ingestJdFileForEdit(f);
                }}
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                  {editUploadPhase === "done" ? (
                    <CheckCircleIcon className="size-6 text-success" />
                  ) : (
                    <span className="text-lg">+</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Attach JD Document{" "}
                  <span className="font-normal text-muted">(optional)</span>
                </p>
                <p className="text-xs text-muted">
                  PDF, DOCX or TXT — max 10 MB. After upload, AI fills the
                  form for you to review.
                </p>
                {editUploadPhase === "uploading" && (
                  <p className="text-xs text-accent">Uploading…</p>
                )}
                {editUploadPhase === "extracting" && (
                  <p className="text-xs text-accent">
                    Reading document with AI…
                  </p>
                )}
                {editUploadPhase === "done" && editSelectedFileName && (
                  <p className="text-xs font-medium text-success">
                    ✓ {editSelectedFileName}
                  </p>
                )}
                {(editUploadPhase === "done" || editUploadPhase === "error") &&
                  editUploadError && (
                    <p className="text-xs text-danger">{editUploadError}</p>
                  )}
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={
                    editUploadPhase === "uploading" ||
                    editUploadPhase === "extracting"
                  }
                  onPress={() => editJdFileInputRef.current?.click()}
                >
                  Browse Files
                </Button>
              </Card.Content>
            </Card>

            {/* 1 – Role & organisation */}
            <div className="space-y-4">
              <SectionLabel>Role &amp; organisation</SectionLabel>
              <TextField
                value={editForm.position}
                onChange={(v) => setEditField("position", v)}
                isRequired
              >
                <Label>Job title</Label>
                <Input placeholder="e.g. AI Engineer (Mid-level)" />
              </TextField>
              <div className="grid gap-4 md:grid-cols-3">
                <TextField
                  value={editForm.level}
                  onChange={(v) => setEditField("level", v)}
                >
                  <Label>Level</Label>
                  <Input placeholder="e.g. Junior, Mid, Senior, Lead" />
                </TextField>

                <TextField
                  value={editForm.headcount}
                  onChange={(v) => setEditField("headcount", v)}
                >
                  <Label>Headcount</Label>
                  <Input type="number" min="1" placeholder="e.g. 2" />
                </TextField>

                <Select
                  value={editForm.hire_type || undefined}
                  onChange={(key) => {
                    if (typeof key === "string") setEditField("hire_type", key);
                  }}
                >
                  <Label>New hire or replacement</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {HIRE_TYPE_OPTIONS.map((opt) => (
                        <ListBox.Item key={opt} id={opt} textValue={opt}>
                          {opt}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <TextField
                value={editForm.reporting}
                onChange={(v) => setEditField("reporting", v)}
              >
                <Label>Reports to</Label>
                <Input placeholder="e.g. VP of Engineering, CTO, Project Manager…" />
              </TextField>
            </div>

            {/* 2 – Project & team */}
            <div className="space-y-4">
              <SectionLabel>Project &amp; team</SectionLabel>

              <TextField
                value={editForm.project_info}
                onChange={(v) => setEditField("project_info", v)}
              >
                <Label>Project overview</Label>
                <TextArea
                  className="min-h-[7rem]"
                  placeholder="What is the project or product? Current phase, pace, expectations on workload or overtime…"
                />
              </TextField>

              <TextField
                value={editForm.duties_and_responsibilities}
                onChange={(v) => setEditField("duties_and_responsibilities", v)}
              >
                <Label>Role responsibilities in the project</Label>
                <TextArea
                  className="min-h-[6rem]"
                  placeholder="What will the hire own or deliver day to day within the project?"
                />
              </TextField>

              <TextField
                value={editForm.team_size}
                onChange={(v) => setEditField("team_size", v)}
              >
                <Label>Team size</Label>
                <TextArea
                  className="min-h-[4rem]"
                  placeholder="How many people and which roles? e.g. 6 people (1 BA, 2 FE, 2 BE, 1 QA)"
                />
              </TextField>
            </div>

            {/* 3 – Candidate requirements */}
            <div className="space-y-4">
              <SectionLabel>Candidate requirements</SectionLabel>

              <TextField
                value={editForm.experience_requirements_must_have}
                onChange={(v) => setEditField("experience_requirements_must_have", v)}
              >
                <Label>Must have</Label>
                <TextArea
                  className="min-h-[7rem]"
                  placeholder="Non‑negotiable skills, experience, domain knowledge, soft skills…"
                />
              </TextField>

              <TextField
                value={editForm.experience_requirements_nice_to_have}
                onChange={(v) => setEditField("experience_requirements_nice_to_have", v)}
              >
                <Label>Nice to have</Label>
                <TextArea
                  className="min-h-[5rem]"
                  placeholder="Optional strengths that would be a plus…"
                />
              </TextField>

              <TextField
                value={editForm.language_requirements}
                onChange={(v) => setEditField("language_requirements", v)}
              >
                <Label>Languages</Label>
                <TextArea
                  className="min-h-[4rem]"
                  placeholder="Which languages, level, certifications? e.g. English for technical docs, TOEIC 600+"
                />
              </TextField>

              <TextField
                value={editForm.other_requirements}
                onChange={(v) => setEditField("other_requirements", v)}
              >
                <Label>Other requirements</Label>
                <TextArea
                  className="min-h-[4rem]"
                  placeholder="Any other notes (only where appropriate and lawful)."
                />
              </TextField>
            </div>

            {/* 4 – Growth & compensation */}
            <div className="space-y-4">
              <SectionLabel>Growth &amp; compensation</SectionLabel>

              <TextField
                value={editForm.career_development}
                onChange={(v) => setEditField("career_development", v)}
              >
                <Label>Growth &amp; career path</Label>
                <TextArea
                  className="min-h-[5rem]"
                  placeholder="Development path, promotion outlook, learning opportunities…"
                />
              </TextField>

              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  value={editForm.salary_range}
                  onChange={(v) => setEditField("salary_range", v)}
                >
                  <Label>Salary range (gross)</Label>
                  <Input placeholder="e.g. 20,000,000 – 35,000,000 VND" />
                </TextField>

                <TextField
                  value={editForm.project_allowances}
                  onChange={(v) => setEditField("project_allowances", v)}
                >
                  <Label>Allowances / project bonuses</Label>
                  <Input placeholder="e.g. lunch allowance, quarterly KPI bonus…" />
                </TextField>
              </div>
            </div>

            {/* 5 – Process & timeline */}
            <div className="space-y-4">
              <SectionLabel>Process &amp; timeline</SectionLabel>

              <TextField
                value={editForm.interview_process}
                onChange={(v) => setEditField("interview_process", v)}
              >
                <Label>Interview process</Label>
                <TextArea
                  className="min-h-[6rem]"
                  placeholder={
                    "How many stages? Who joins each stage? Any tests?\ne.g. Stage 1: HR screen / Stage 2: Technical + CTO / Stage 3: Offer"
                  }
                />
              </TextField>

              <TextField
                value={editForm.hiring_deadline}
                onChange={(v) => setEditField("hiring_deadline", v)}
              >
                <Label>Hiring deadline</Label>
                <Input type="date" />
              </TextField>
            </div>

            {editError && (
              <p className="text-sm text-danger">{editError}</p>
            )}
          </Modal.Body>

          <Modal.Footer className="justify-between border-t border-divider px-6 py-5">
            <Button
              variant="ghost"
              onPress={editIntakeModal.close}
              isDisabled={
                editSubmitting ||
                editUploadPhase === "uploading" ||
                editUploadPhase === "extracting"
              }
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              isDisabled={
                editSubmitting ||
                editUploadPhase === "uploading" ||
                editUploadPhase === "extracting"
              }
              onPress={() => void handleEditSave()}
            >
              {editSubmitting ? "Saving…" : "Save details"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
export default JdEditModal;
