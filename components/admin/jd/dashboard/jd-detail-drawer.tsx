import React from "react";
import { Drawer, Chip, Separator, Label, Button } from "@heroui/react";
import { JdViewerEmailsField } from "@/components/admin/jd/jd-viewer-email-search";
import { SectionLabel, ChapterPicker } from "./shared-components";
import { statusChipColor, formatJdCalendarDate, formatDate, formatHireTypeDisplay } from "./helpers";
import { ALL_PIPELINE_STATUSES } from "@/lib/candidates/pipeline-allowed-transitions";
import { candidateStatusUiLabel } from "@/lib/candidates/pipeline-phase";
import { useJdDashboard } from "./context";

export function JdDetailDrawer() {
  const {
    drawerOpen,
    setDrawerOpen,
    activeRow,
    drawerStatusCountsError,
    drawerStatusCounts,
    canManageJds,
    openEdit,
    drawerViewersLoading,
    authHeaders,
    setDrawerViewerEmails,
    drawerViewerEmails,
    chapters,
    drawerViewerChapterIds,
    setDrawerViewerChapterIds,
    drawerViewersError,
    drawerViewersBusy,
    saveDrawerViewers,
  } = useJdDashboard();

  return (
    <Drawer.Backdrop isOpen={drawerOpen} onOpenChange={setDrawerOpen}>
      <Drawer.Content placement="right">
        <Drawer.Dialog className="w-full max-w-md sm:max-w-lg">
          <Drawer.CloseTrigger />
          {activeRow ? (
            <>
              <Drawer.Header>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip
                    color={statusChipColor(activeRow.status)}
                    size="sm"
                    variant="soft"
                  >
                    {activeRow.status}
                  </Chip>
                  {activeRow.department && (
                    <Chip size="sm" variant="soft">
                      {activeRow.department}
                    </Chip>
                  )}
                </div>
                <Drawer.Heading className="mt-2">{activeRow.position}</Drawer.Heading>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted">
                  {activeRow.employment_status ? (
                    <span>JD status: {activeRow.employment_status}</span>
                  ) : null}
                  {activeRow.start_date ? (
                    <span>
                      Hiring starts: {formatJdCalendarDate(activeRow.start_date)}
                    </span>
                  ) : null}
                  {activeRow.end_date ? (
                    <span>
                      Hiring ends: {formatJdCalendarDate(activeRow.end_date)}
                    </span>
                  ) : null}
                  {activeRow.work_location && (
                    <span>📍 {activeRow.work_location}</span>
                  )}
                  {activeRow.reporting && (
                    <span>Reports to: {activeRow.reporting}</span>
                  )}
                </div>
              </Drawer.Header>

              <Drawer.Body className="flex flex-col gap-6">
                <section className="rounded-xl border border-divider bg-surface-secondary/40 px-4 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Applicants by pipeline status
                  </h3>
                  {drawerStatusCountsError ? (
                    <p className="mt-2 text-sm text-danger">{drawerStatusCountsError}</p>
                  ) : drawerStatusCounts == null ? (
                    <p className="mt-2 text-sm text-muted">Loading counts…</p>
                  ) : (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                      {ALL_PIPELINE_STATUSES.map((st) => (
                        <div
                          key={st}
                          className="flex items-baseline justify-between gap-2 text-sm"
                        >
                          <dt className="text-muted">{candidateStatusUiLabel(st)}</dt>
                          <dd className="tabular-nums font-semibold text-foreground">
                            {drawerStatusCounts[st] ?? 0}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>

                {/* Intake fields */}
                {(activeRow.level || activeRow.headcount != null || activeRow.hire_type || activeRow.reporting) && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Role &amp; organisation</h3>
                    <dl className="space-y-1 text-sm text-muted">
                      {activeRow.level && <div><dt className="inline font-medium text-foreground">Level: </dt><dd className="inline">{activeRow.level}</dd></div>}
                      {activeRow.headcount != null && <div><dt className="inline font-medium text-foreground">Headcount: </dt><dd className="inline">{activeRow.headcount}</dd></div>}
                      {activeRow.hire_type && <div><dt className="inline font-medium text-foreground">Hire type: </dt><dd className="inline">{formatHireTypeDisplay(activeRow.hire_type)}</dd></div>}
                      {activeRow.reporting && <div><dt className="inline font-medium text-foreground">Reports to: </dt><dd className="inline">{activeRow.reporting}</dd></div>}
                    </dl>
                  </section>
                )}

                {(activeRow.project_info || activeRow.duties_and_responsibilities || activeRow.team_size) && (
                  <>
                    <Separator />
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Project &amp; team</h3>
                      {activeRow.project_info && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Project overview</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.project_info}</p>
                        </div>
                      )}
                      {activeRow.duties_and_responsibilities && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Responsibilities</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.duties_and_responsibilities}</p>
                        </div>
                      )}
                      {activeRow.team_size && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Team size</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.team_size}</p>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {(activeRow.experience_requirements_must_have || activeRow.experience_requirements_nice_to_have || activeRow.language_requirements || activeRow.other_requirements) && (
                  <>
                    <Separator />
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Candidate requirements</h3>
                      {activeRow.experience_requirements_must_have && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Must have</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.experience_requirements_must_have}</p>
                        </div>
                      )}
                      {activeRow.experience_requirements_nice_to_have && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Nice to have</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.experience_requirements_nice_to_have}</p>
                        </div>
                      )}
                      {activeRow.language_requirements && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Languages</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.language_requirements}</p>
                        </div>
                      )}
                      {activeRow.other_requirements && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Other requirements</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.other_requirements}</p>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {(activeRow.career_development || activeRow.salary_range || activeRow.project_allowances) && (
                  <>
                    <Separator />
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Growth &amp; compensation</h3>
                      {activeRow.career_development && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Growth &amp; path</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.career_development}</p>
                        </div>
                      )}
                      {activeRow.salary_range && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Salary (gross)</p>
                          <p className="mt-1 text-sm text-muted">{activeRow.salary_range}</p>
                        </div>
                      )}
                      {activeRow.project_allowances && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Allowances / bonuses</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.project_allowances}</p>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {(activeRow.interview_process || activeRow.hiring_deadline) && (
                  <>
                    <Separator />
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Process &amp; timeline</h3>
                      {activeRow.interview_process && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Interview process</p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{activeRow.interview_process}</p>
                        </div>
                      )}
                      {activeRow.hiring_deadline && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Hiring deadline</p>
                          <p className="mt-1 text-sm text-muted">{formatJdCalendarDate(activeRow.hiring_deadline)}</p>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {activeRow.role_overview && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-sm font-semibold text-foreground">
                        Role overview
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {activeRow.role_overview}
                      </p>
                    </section>
                  </>
                )}

                {activeRow.what_we_offer && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-sm font-semibold text-foreground">
                        What we offer
                      </h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                        {activeRow.what_we_offer}
                      </p>
                    </section>
                  </>
                )}

                {canManageJds ? (
                  <>
                    <Separator />
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Recruiter access
                      </h3>
                      <p className="text-xs text-muted">
                        Emails must match existing accounts. You can also add
                        whole chapters. HR always has full access.
                      </p>
                      {drawerViewersLoading ? (
                        <p className="text-xs text-muted">Loading viewers…</p>
                      ) : (
                        <>
                          <JdViewerEmailsField
                            emails={drawerViewerEmails}
                            onChange={setDrawerViewerEmails}
                            getHeaders={authHeaders}
                          />
                          <div className="space-y-2">
                            <Label className="text-xs text-muted">
                              Viewer chapters (whole chapter)
                            </Label>
                            <ChapterPicker
                              chapters={chapters}
                              selectedIds={drawerViewerChapterIds}
                              onChange={setDrawerViewerChapterIds}
                            />
                          </div>
                        </>
                      )}
                      {drawerViewersError ? (
                        <p className="text-sm text-danger" role="alert">
                          {drawerViewersError}
                        </p>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={
                          drawerViewersBusy || drawerViewersLoading
                        }
                        onPress={() => void saveDrawerViewers()}
                      >
                        {drawerViewersBusy ? "Saving…" : "Save viewers"}
                      </Button>
                    </section>
                  </>
                ) : null}

                <Separator />

                <section className="space-y-1 text-xs text-muted">
                  <p>Created: {formatDate(activeRow.created_at)}</p>
                  <p>Last updated: {formatDate(activeRow.updated_at)}</p>
                  {activeRow.update_note && (
                    <p>Update note: {activeRow.update_note}</p>
                  )}
                </section>
              </Drawer.Body>

              <Drawer.Footer className="flex flex-wrap gap-2">
                <Button slot="close" variant="secondary">
                  Close
                </Button>
                {canManageJds ? (
                  <Button variant="primary" onPress={() => openEdit(activeRow)}>
                    Hiring details
                  </Button>
                ) : null}
              </Drawer.Footer>
            </>
          ) : null}
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
export default JdDetailDrawer;
