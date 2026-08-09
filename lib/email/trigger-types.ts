// Values for email_templates.trigger_type / job_email_recipients.trigger_type / email_messages.trigger_type.
// Stored as free-text columns (see migrations/1785731317733_email-templates-and-messages.sql),
// so this is the single source of truth callers should import from instead of hardcoding strings.

export const EMAIL_TRIGGER_CATEGORIES = [
  "general",
  "application",
  "screening",
  "interview",
  "decision",
  "onboarding",
  "internal",
  "talent_pool",
  "system",
] as const;

export type EmailTriggerCategory = (typeof EMAIL_TRIGGER_CATEGORIES)[number];

export const EMAIL_TRIGGER_CATEGORY_LABELS: Record<EmailTriggerCategory, string> = {
  general: "Chung",
  application: "Ứng tuyển",
  screening: "Sàng lọc",
  interview: "Phỏng vấn",
  decision: "Ra quyết định",
  onboarding: "Onboarding",
  internal: "Nội bộ (HR/Manager)",
  talent_pool: "Talent pool/Referral",
  system: "Hệ thống",
};

export const EMAIL_RECIPIENT_TYPES = ["candidate", "internal", "self"] as const;

export type EmailRecipientType = (typeof EMAIL_RECIPIENT_TYPES)[number];

export const EMAIL_TRIGGER_TYPES = [
  // Chung -- not tied to any pipeline event. Never fires via auto-send (no
  // pipeline transition or scheduler ever passes this value as a
  // triggerType), so a template stored under it is reachable only through
  // explicit manual/bulk send (template picker in compose-email-modal.tsx /
  // bulk-email-modal.tsx).
  { value: "manual_only", category: "general", recipientType: "candidate", label: "Không gắn trigger" },

  // Ứng tuyển
  { value: "application_received", category: "application", recipientType: "candidate", label: "Xác nhận đã nhận CV" },
  { value: "application_documents_requested", category: "application", recipientType: "candidate", label: "Yêu cầu bổ sung hồ sơ" },

  // Sàng lọc
  { value: "screening_interview_invitation", category: "screening", recipientType: "candidate", label: "Mời phỏng vấn vòng 1" },
  { value: "screening_rejected", category: "screening", recipientType: "candidate", label: "Từ chối sớm" },

  // Phỏng vấn -- reschedule/cancel are separate triggers so they can carry different copy,
  // mirroring the distinct 'Rescheduled'/'Canceled' candidate_schedules.status values.
  { value: "interview_invitation", category: "interview", recipientType: "candidate", label: "Mời phỏng vấn (từng vòng)" },
  { value: "interview_reminder", category: "interview", recipientType: "candidate", label: "Nhắc lịch phỏng vấn" },
  { value: "interview_rescheduled", category: "interview", recipientType: "candidate", label: "Đổi lịch phỏng vấn" },
  { value: "interview_canceled", category: "interview", recipientType: "candidate", label: "Hủy lịch phỏng vấn" },
  { value: "interview_thank_you", category: "interview", recipientType: "candidate", label: "Cảm ơn sau phỏng vấn" },

  // Ra quyết định
  { value: "post_interview_rejected", category: "decision", recipientType: "candidate", label: "Từ chối sau phỏng vấn" },
  { value: "offer_sent", category: "decision", recipientType: "candidate", label: "Thư mời làm việc (Offer)" },
  { value: "offer_reminder", category: "decision", recipientType: "candidate", label: "Nhắc phản hồi offer" },
  { value: "offer_accepted", category: "decision", recipientType: "candidate", label: "Xác nhận chấp nhận offer" },

  // Onboarding
  { value: "onboarding_welcome", category: "onboarding", recipientType: "candidate", label: "Chào mừng nhân viên mới" },
  { value: "onboarding_documents_requested", category: "onboarding", recipientType: "candidate", label: "Yêu cầu giấy tờ onboarding" },

  // Nội bộ (HR/Manager)
  { value: "internal_new_candidate", category: "internal", recipientType: "internal", label: "Thông báo ứng viên mới" },
  { value: "internal_cv_review_overdue", category: "internal", recipientType: "internal", label: "Nhắc review CV quá hạn" },
  { value: "internal_periodic_report", category: "internal", recipientType: "internal", label: "Báo cáo định kỳ" },

  // Talent pool/Referral -- keep-in-touch goes to the candidate, thank-you goes to the
  // employee who referred them, so these two intentionally have different recipientType.
  { value: "talent_pool_keep_in_touch", category: "talent_pool", recipientType: "candidate", label: "Giữ liên lạc ứng viên tiềm năng" },
  { value: "referral_thank_you", category: "talent_pool", recipientType: "internal", label: "Cảm ơn người giới thiệu" },

  // Hệ thống
  { value: "user_account_created", category: "system", recipientType: "self", label: "Tài khoản người dùng mới được tạo" },
] as const;

export type EmailTriggerType = (typeof EMAIL_TRIGGER_TYPES)[number]["value"];
