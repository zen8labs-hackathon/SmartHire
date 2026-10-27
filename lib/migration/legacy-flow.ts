import type { JobRow } from "@/lib/db/jobs";

/** Error code returned (HTTP 409) by write APIs for jobs still on the legacy flow. */
export const JOB_LEGACY_FLOW = "JOB_LEGACY_FLOW";

export const LEGACY_FLOW_MESSAGE =
  "This position still uses the legacy structure. Convert it to the new flow before making changes.";

export function isLegacyFlowJob(job: Pick<JobRow, "flow_version"> | null | undefined): boolean {
  return job?.flow_version === 1;
}

/** Standard 409 body for write endpoints guarding legacy jobs. */
export function legacyFlowResponse(): Response {
  return Response.json(
    { error: LEGACY_FLOW_MESSAGE, code: JOB_LEGACY_FLOW },
    { status: 409 },
  );
}
