import React, { useMemo, type DragEvent, type ChangeEvent } from "react";
import {
  Modal,
  Card,
  Button,
  TextField,
  Label,
  Input,
  DateField,
  DateRangePicker,
  RangeCalendar,
} from "@heroui/react";
import { Dialog, type RangeValue } from "react-aria-components";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { JdViewerEmailsField } from "@/components/admin/jd/jd-viewer-email-search";
import { SectionLabel, ChapterPicker } from "./shared-components";
import {
  CheckCircle as CheckCircleIcon,
  Calendar as CalendarIcon,
} from "lucide-react";
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

  const dateRangeValue = useMemo<RangeValue<CalendarDate> | null>(() => {
    if (
      !form.start_date ||
      !form.hiring_deadline ||
      form.start_date > form.hiring_deadline
    )
      return null;
    try {
      return {
        start: parseDate(form.start_date),
        end: parseDate(form.hiring_deadline),
      };
    } catch {
      return null;
    }
  }, [form.start_date, form.hiring_deadline]);

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
            <Modal.Heading className="text-xl">
              Create New Definition
            </Modal.Heading>
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
                  PDF, DOCX or TXT — max 10 MB. After upload, AI fills the form
                  for you to review.
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

                <div className="flex flex-col gap-1 md:col-span-1">
                  <Label className="text-xs font-medium text-foreground">
                    Hiring Date{" "}
                    <span className="font-normal text-danger">*</span>
                  </Label>
                  <DateRangePicker
                    value={dateRangeValue}
                    onChange={(val) => {
                      if (val?.start && val?.end) {
                        setField("start_date", val.start.toString());
                        setField("hiring_deadline", val.end.toString());
                      } else {
                        setField("start_date", "");
                        setField("hiring_deadline", "");
                      }
                    }}
                    isInvalid={
                      !!(
                        createFieldErrors.start_date ||
                        createFieldErrors.hiring_deadline
                      )
                    }
                    className="w-full"
                  >
                    <DateField.Group
                      fullWidth
                      variant="primary"
                      className="border-divider bg-surface-secondary/40 text-foreground shadow-sm h-10 rounded-xl py-1 px-3 text-sm"
                    >
                      <DateField.InputContainer className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                        <DateField.Input slot="start" className="outline-none">
                          {(segment) => <DateField.Segment segment={segment} />}
                        </DateField.Input>
                        <DateRangePicker.RangeSeparator className="shrink-0 px-0.5 text-muted">
                          –
                        </DateRangePicker.RangeSeparator>
                        <DateField.Input slot="end" className="outline-none">
                          {(segment) => <DateField.Segment segment={segment} />}
                        </DateField.Input>
                      </DateField.InputContainer>
                      <DateField.Suffix>
                        <DateRangePicker.Trigger className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-surface-tertiary">
                          <CalendarIcon className="h-3.5 w-3.5" />
                        </DateRangePicker.Trigger>
                      </DateField.Suffix>
                    </DateField.Group>
                    <DateRangePicker.Popover>
                      <Dialog className="outline-none border border-divider rounded-2xl bg-surface-primary p-4 shadow-2xl z-50">
                        <RangeCalendar>
                          <RangeCalendar.Header className="flex items-center justify-between mb-2">
                            <RangeCalendar.NavButton slot="previous" />
                            <RangeCalendar.Heading className="text-xs font-bold" />
                            <RangeCalendar.NavButton slot="next" />
                          </RangeCalendar.Header>
                          <RangeCalendar.Grid
                            weekdayStyle="short"
                            className="border-collapse"
                          >
                            <RangeCalendar.GridHeader>
                              {(day) => (
                                <RangeCalendar.HeaderCell className="text-[10px] text-muted font-bold py-1">
                                  {day}
                                </RangeCalendar.HeaderCell>
                              )}
                            </RangeCalendar.GridHeader>
                            <RangeCalendar.GridBody>
                              {(date) => (
                                <RangeCalendar.Cell
                                  date={date}
                                  className="w-8 h-8 text-center text-xs font-medium cursor-pointer relative p-0"
                                >
                                  {({ formattedDate }) => (
                                    <>
                                      <RangeCalendar.CellIndicator className="absolute inset-0 bg-accent/10 rounded-lg" />
                                      <span className="relative z-[1] flex items-center justify-center h-full w-full rounded-lg hover:bg-accent/15">
                                        {formattedDate}
                                      </span>
                                    </>
                                  )}
                                </RangeCalendar.Cell>
                              )}
                            </RangeCalendar.GridBody>
                          </RangeCalendar.Grid>
                        </RangeCalendar>
                      </Dialog>
                    </DateRangePicker.Popover>
                  </DateRangePicker>
                  {(createFieldErrors.start_date ||
                    createFieldErrors.hiring_deadline) && (
                    <p className="text-xs text-danger">
                      {createFieldErrors.start_date ||
                        createFieldErrors.hiring_deadline}
                    </p>
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
                  Viewer chapters (chapter heads)
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

            {formError && <p className="text-sm text-danger">{formError}</p>}
          </Modal.Body>

          <Modal.Footer className="justify-end border-t border-divider px-6 py-5">
            <Button
              variant="secondary"
              onPress={() => void discardJdDraft()}
              isDisabled={
                formSubmitting ||
                jdUploadPhase === "uploading" ||
                jdUploadPhase === "extracting"
              }
            >
              Close
            </Button>
            <div className="flex gap-2">
              <Button
                variant="primary"
                isDisabled={
                  formSubmitting ||
                  jdUploadPhase === "uploading" ||
                  jdUploadPhase === "extracting"
                }
                onPress={() => void handleSave()}
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
