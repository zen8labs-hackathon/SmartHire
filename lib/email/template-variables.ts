import type { CandidateRow } from "@/lib/db/candidates";
import type { CandidateScheduleRow } from "@/lib/db/candidate-schedules";
import type { JobRow } from "@/lib/db/jobs";
import type { EmailTemplateVariables } from "@/lib/email/render-template";

/** Sourced for the "insert placeholder" helper in the template/compose editors. */
export const KNOWN_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "candidate_name", label: "Tên ứng viên" },
  { key: "candidate_email", label: "Email ứng viên" },
  { key: "receiver_name", label: "Tên người nhận" },
  { key: "receiver_email", label: "Email người nhận" },
  { key: "position", label: "Vị trí ứng tuyển" },
  { key: "department", label: "Phòng ban" },
  { key: "hr_name", label: "Tên người gửi (HR)" },
  { key: "company_name", label: "Tên công ty" },
  { key: "interview_date", label: "Ngày phỏng vấn" },
  { key: "interview_time", label: "Giờ phỏng vấn" },
  { key: "interview_location", label: "Địa điểm phỏng vấn" },
  { key: "user_name", label: "Tên tài khoản người gửi" },
  { key: "user_email", label: "Email tài khoản người gửi" },
  { key: "user_phone", label: "SĐT tài khoản người gửi" },
  { key: "pipeline_stage", label: "Giai đoạn tuyển dụng hiện tại" },
];

export function buildCandidateEmailVariables(params: {
  candidate: CandidateRow;
  job?: JobRow | null;
  schedule?: CandidateScheduleRow | null;
  senderName?: string | null;
  companyName?: string | null;
  timezone?: string;
  senderUser?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  pipelineStage?: string | null;
}): EmailTemplateVariables {
  const { candidate, job, schedule, senderName, companyName, timezone, senderUser, pipelineStage } =
    params;
  const tz = timezone ?? "Asia/Ho_Chi_Minh";

  const vars: EmailTemplateVariables = {
    candidate_name: candidate.name ?? "",
    candidate_email: candidate.email ?? "",
    receiver_name: candidate.name ?? "",
    receiver_email: candidate.email ?? "",
    position: job?.position ?? "",
    department: job?.department ?? "",
    hr_name: senderName ?? "",
    company_name: companyName ?? "",
    user_name: senderUser?.name ?? "",
    user_email: senderUser?.email ?? "",
    user_phone: senderUser?.phone ?? "",
    pipeline_stage: pipelineStage ?? "",
  };

  if (schedule) {
    vars.interview_date = new Intl.DateTimeFormat("vi-VN", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(schedule.scheduled_at);
    vars.interview_time = new Intl.DateTimeFormat("vi-VN", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    }).format(schedule.scheduled_at);
    vars.interview_location = schedule.location ?? "";
  }

  return vars;
}
