import { z } from "zod";

import { CANDIDATE_PIPELINE_STATUSES } from "@/lib/candidates/types";

/** Shared Zod enum for API bodies — matches DB `candidates_status_check`. */
export const zCandidatePipelineStatus = z.enum(
  CANDIDATE_PIPELINE_STATUSES as unknown as [string, ...string[]],
);
