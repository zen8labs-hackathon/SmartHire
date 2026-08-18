import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/job-permissions", () => ({
  listAllowedChaptersForJob: vi.fn(),
}));
vi.mock("@/lib/db/profile-chapters", () => ({
  listHeadEmailsForChapters: vi.fn(),
}));
vi.mock("@/lib/db/users", () => ({
  listUsersByRoles: vi.fn(),
}));
vi.mock("@/lib/admin/jd-viewer-sync", () => ({
  fetchViewerEmailsForJobDescription: vi.fn(),
}));

import { listAllowedChaptersForJob } from "@/lib/db/job-permissions";
import { listHeadEmailsForChapters } from "@/lib/db/profile-chapters";
import { listUsersByRoles } from "@/lib/db/users";
import { fetchViewerEmailsForJobDescription } from "@/lib/admin/jd-viewer-sync";
import { getDefaultInterviewParticipantEmails } from "@/lib/candidates/interview-participant-suggestions";

const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listUsersByRoles).mockResolvedValue([]);
});

describe("getDefaultInterviewParticipantEmails", () => {
  it("skips job-scoped lookups and only returns admin/hr when jobId is null", async () => {
    vi.mocked(listUsersByRoles).mockResolvedValue([
      { email: "admin@x.com" } as never,
      { email: "hr@x.com" } as never,
    ]);

    const result = await getDefaultInterviewParticipantEmails(db, null);

    expect(fetchViewerEmailsForJobDescription).not.toHaveBeenCalled();
    expect(listAllowedChaptersForJob).not.toHaveBeenCalled();
    expect(result).toEqual(["admin@x.com", "hr@x.com"]);
  });

  it("combines job-allowed-profile emails, chapter head emails, and admin/hr, deduped and sorted", async () => {
    vi.mocked(fetchViewerEmailsForJobDescription).mockResolvedValue(["viewer@x.com"]);
    vi.mocked(listAllowedChaptersForJob).mockResolvedValue([
      { job_id: "job-1", chapter_id: "c-1", granted_by: null, created_at: new Date() } as never,
    ]);
    vi.mocked(listHeadEmailsForChapters).mockResolvedValue(["head@x.com", "viewer@x.com"]);
    vi.mocked(listUsersByRoles).mockResolvedValue([{ email: "Admin@X.com" } as never]);

    const result = await getDefaultInterviewParticipantEmails(db, "job-1");

    expect(listHeadEmailsForChapters).toHaveBeenCalledWith(db, ["c-1"]);
    expect(result).toEqual(["admin@x.com", "head@x.com", "viewer@x.com"]);
  });

  it("skips the chapter-head lookup entirely when the job has no allowed chapters", async () => {
    vi.mocked(fetchViewerEmailsForJobDescription).mockResolvedValue([]);
    vi.mocked(listAllowedChaptersForJob).mockResolvedValue([]);

    await getDefaultInterviewParticipantEmails(db, "job-1");

    expect(listHeadEmailsForChapters).not.toHaveBeenCalled();
  });
});
