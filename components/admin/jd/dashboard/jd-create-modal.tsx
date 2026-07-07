import React, { type DragEvent, type ChangeEvent } from "react";
import { Modal, Card, Button, TextField, Label, Input } from "@heroui/react";
import { JdViewerEmailsField } from "@/components/admin/jd/jd-viewer-email-search";
import { SectionLabel, ChapterPicker } from "./shared-components";
import { CheckCircle as CheckCircleIcon } from "lucide-react";
import { useJdDashboard } from "./context";
import { JdPipelineStageSelect } from "./jd-stage-select";

export function JdCreateModal() {
  const {
    jdModal,
    jdDragOver,
    setJdDragOver,
    jdUploadPhase,
    ingestJdFile,
    jdSelectedFileName,
    jdUploadError,
    jdFileInputRef,
    form,
    setField,
    authHeaders,
    setCreateViewerEmails,
    createViewerEmails,
    createViewerChapterIds,
    setCreateViewerChapterIds,
    chapters,
    formError,
    formSubmitting,
    createFieldErrors,
    discardJdDraft,
    handleSave,
    allPipelineStages,
    selectedStageIds,
    setSelectedStageIds,
  } = useJdDashboard();

  return (
    <Modal.Backdrop
      className="bg-black/40 backdrop-blur-sm"
      isOpen={jdModal.isOpen}
      onOpenChange={jdModal.setOpen}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-[820px] overflow-hidden p-0">
          <Modal.CloseTrigger />
          <Modal.Header className="items-start border-b border-divider px-6 py-5">
            <Modal.Heading className="text-xl">Create New Definition</Modal.Heading>
          </Modal.Header>

          <Modal.Body className="max-h-[72vh] space-y-6 overflow-y-auto px-6 py-6">
            {/* Hidden file input driving the "Browse Files" button and the
                drag-and-drop zone below. Lives here (rather than in
                JdHeader) since it's only ever used in the context of this
                modal. */}
            <input
              ref={jdFileInputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              aria-hidden
              tabIndex={-1}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) void ingestJdFile(f);
              }}
            />
            {/* File upload (optional) */}
            <Card
              variant="secondary"
              className={
                jdDragOver
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-background"
                  : undefined
              }
            >
              <Card.Content
                className="items-center gap-3 py-6 text-center"
                onDragOver={(e: DragEvent) => {
                  if (
                    jdUploadPhase === "uploading" ||
                    jdUploadPhase === "extracting"
                  )
                    return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setJdDragOver(true);
                }}
                onDragLeave={() => setJdDragOver(false)}
                onDrop={(e: DragEvent) => {
                  if (
                    jdUploadPhase === "uploading" ||
                    jdUploadPhase === "extracting"
                  )
                    return;
                  e.preventDefault();
                  setJdDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void ingestJdFile(f);
                }}
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                  {jdUploadPhase === "done" ? (
                    <CheckCircleIcon className="size-6 text-success" />
                  ) : (
                    <span className="text-lg">+</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Attach JD Document{" "}
                  <span className="font-normal text-danger">*</span>
                </p>
                <p className="text-xs text-muted">
                  PDF, DOCX or TXT — max 10 MB. After upload, AI fills the
                  form for you to review.
                </p>
                {jdUploadPhase === "uploading" && (
                  <p className="text-xs text-accent">Uploading…</p>
                )}
                {jdUploadPhase === "extracting" && (
                  <p className="text-xs text-accent">
                    Reading document with AI…
                  </p>
                )}
                {jdUploadPhase === "done" && jdSelectedFileName && (
                  <p className="text-xs font-medium text-success">
                    ✓ {jdSelectedFileName}
                  </p>
                )}
                {(jdUploadPhase === "done" || jdUploadPhase === "error") &&
                  jdUploadError && (
                    <p className="text-xs text-danger">{jdUploadError}</p>
                  )}
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={
                    jdUploadPhase === "uploading" ||
                    jdUploadPhase === "extracting"
                  }
                  onPress={() => jdFileInputRef.current?.click()}
                >
                  Browse Files
                </Button>
              </Card.Content>
            </Card>

            <div className="space-y-4">
              <SectionLabel>Role details</SectionLabel>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  value={form.position}
                  onChange={(v) => setField("position", v)}
                  isRequired
                >
                  <Label>Job title</Label>
                  <Input placeholder="e.g. AI Engineer (Mid-level)" />
                </TextField>

                <TextField
                  value={form.department}
                  onChange={(v) => setField("department", v)}
                >
                  <Label>Department / team</Label>
                  <Input placeholder="e.g. Solutions Team" />
                </TextField>

                <div className="flex flex-col gap-1">
                  <TextField
                    value={form.start_date}
                    onChange={(v) => setField("start_date", v)}
                    isRequired
                    isInvalid={!!createFieldErrors.start_date}
                  >
                    <Label>Start date</Label>
                    <Input type="date" />
                  </TextField>
                  {createFieldErrors.start_date && (
                    <p className="text-xs text-danger">{createFieldErrors.start_date}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <TextField
                    value={form.hiring_deadline}
                    onChange={(v) => setField("hiring_deadline", v)}
                    isRequired
                    isInvalid={!!createFieldErrors.hiring_deadline}
                  >
                    <Label>Hiring deadline</Label>
                    <Input type="date" />
                  </TextField>
                  {createFieldErrors.hiring_deadline && (
                    <p className="text-xs text-danger">{createFieldErrors.hiring_deadline}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <SectionLabel>Recruiter access</SectionLabel>
              <p className="text-xs text-muted">
                Optional. Add individual accounts by email and/or grant every
                member of a chapter. Non-HR recruiters only see jobs they are
                given here.
              </p>
              <JdViewerEmailsField
                emails={createViewerEmails}
                onChange={setCreateViewerEmails}
                getHeaders={authHeaders}
              />
              <div className="space-y-2">
                <Label className="text-xs text-muted">
                  Viewer chapters (whole chapter)
                </Label>
                <ChapterPicker
                  chapters={chapters}
                  selectedIds={createViewerChapterIds}
                  onChange={setCreateViewerChapterIds}
                />
              </div>
            </div>

            <div className="space-y-3">
              <SectionLabel>Pipeline Configuration</SectionLabel>
              <JdPipelineStageSelect
                allPipelineStages={allPipelineStages}
                selectedStageIds={selectedStageIds}
                onChange={setSelectedStageIds}
              />
            </div>

            {formError && (
              <p className="text-sm text-danger">{formError}</p>
            )}
          </Modal.Body>

          <Modal.Footer className="justify-between border-t border-divider px-6 py-5">
            <Button
              variant="ghost"
              onPress={() => void discardJdDraft()}
              isDisabled={
                formSubmitting ||
                jdUploadPhase === "uploading" ||
                jdUploadPhase === "extracting"
              }
            >
              Discard draft
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                isDisabled={
                  formSubmitting ||
                  jdUploadPhase === "uploading" ||
                  jdUploadPhase === "extracting"
                }
                onPress={() => void handleSave(true)}
              >
                Save draft
              </Button>
              <Button
                variant="primary"
                isDisabled={
                  formSubmitting ||
                  jdUploadPhase === "uploading" ||
                  jdUploadPhase === "extracting"
                }
                onPress={() => void handleSave(false)}
              >
                {formSubmitting ? "Saving…" : "Create"}
              </Button>
            </div>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
export default JdCreateModal;
