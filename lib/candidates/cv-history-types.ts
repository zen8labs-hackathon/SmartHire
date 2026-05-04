import type { ParsingStatus } from "@/lib/candidates/db-row";

/** Archived row snapshot attached to each CV replacement history entry. */
export type CandidateCvPreviousSnapshot = {
  id: string;
  name: string | null;
  role: string | null;
  cvUploadedAt: string | null;
  parsingStatus: ParsingStatus | string;
  parsedPayload: unknown;
  originalFilename: string;
};

export type CandidateCvHistoryRow = {
  id: number;
  previousCandidateId: string;
  replacementCandidateId: string;
  previousStatus: string;
  newStatus: string;
  matchedOn: string;
  previousFilename: string | null;
  previousCvUploadedAt: string | null;
  replacedByEmail: string | null;
  replacedAt: string | null;
  previousSnapshot: CandidateCvPreviousSnapshot | null;
};
