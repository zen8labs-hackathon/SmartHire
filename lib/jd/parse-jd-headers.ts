import { normalizeFormText } from "@/lib/jd/normalize-text";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collapse whitespace so PDF one-line headers parse reliably. */
function flattenText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n+/g, " ").replace(/[ \t]+/g, " ").trim();
}

/**
 * Text after `label:` until the next known label (or end).
 * `nextLabels` are label *names* without colon (e.g. "Department").
 */
function sliceAfterLabel(
  text: string,
  label: string,
  nextLabels: string[],
  colonOptional = false,
): string {
  // Use (^|\s) instead of \b so labels with non-ASCII (e.g. Vietnamese) match after PDF flatten.
  const startRe = colonOptional
    ? new RegExp(`(?:^|\\s)${escapeRe(label)}\\s*:?\\s*`, "i")
    : new RegExp(`(?:^|\\s)${escapeRe(label)}\\s*:\\s*`, "i");
  const m = text.match(startRe);
  if (!m || m.index === undefined) return "";
  const from = m.index + m[0].length;
  const tail = text.slice(from);
  if (nextLabels.length === 0) return tail.trim();

  const alt = nextLabels
    .map((l) => `(?:\\b${escapeRe(l)}\\s*:|\\b${escapeRe(l)}\\b)`)
    .join("|");
  const endRe = new RegExp(`\\s+(?:${alt})`, "i");
  const ei = tail.search(endRe);
  const chunk = ei < 0 ? tail : tail.slice(0, ei);
  return chunk.trim();
}

function trimWorkLocation(s: string): string {
  let t = s.trim();
  const company = t.search(/\s+Our\s+Company\b/i);
  if (company > 12) t = t.slice(0, company).trim();
  const jobDesc = t.search(/\s+JOB\s+DESCRIPTION\b/i);
  if (jobDesc > 12) t = t.slice(0, jobDesc).trim();
  return t.slice(0, 255);
}

export type HeaderParseResult = {
  position: string;
  department: string;
  employment_status: string;
  update_note: string;
  work_location: string;
  reporting: string;
};

/**
 * Deterministic parse for common English JD header blocks, including when
 * the entire header is on one line (typical PDF text extraction).
 */
export function parseJdHeaderFields(raw: string): HeaderParseResult {
  const text = flattenText(raw);

  let position = sliceAfterLabel(text, "Position", ["Department"]);
  if (!position) {
    position = sliceAfterLabel(text, "Job Title", ["Department", "Location", "Team"]);
  }
  if (!position) {
    position = sliceAfterLabel(text, "Title", ["Department", "Location", "Overview"]);
  }
  if (!position) {
    position = sliceAfterLabel(text, "Vị trí", ["Phòng ban", "Department", "Bộ phận"]);
  }
  if (!position) {
    position = sliceAfterLabel(text, "Chức danh", ["Phòng ban", "Department", "Yêu cầu"]);
  }
  let department = sliceAfterLabel(text, "Department", ["Status"]);
  if (!department) {
    department = sliceAfterLabel(text, "Phòng ban", ["Trạng thái", "Status", "Bộ phận"]);
  }
  if (!department) {
    department = sliceAfterLabel(text, "Bộ phận", ["Trạng thái", "Status"]);
  }
  const employment_status = sliceAfterLabel(text, "Status", ["Update"]);
  const update_note = sliceAfterLabel(text, "Update", ["Work location", "Work Location"]);
  let work_location = trimWorkLocation(
    sliceAfterLabel(text, "Work location", [
      "Work Location",
      "Reporting to",
      "Reporting",
      "Role overview",
      "Overview",
      "KEY RESPONSIBILITIES",
      "Responsibilities",
      "Duties",
      "Requirements",
      "Our Company",
    ]),
  );
  if (!work_location) {
    work_location = trimWorkLocation(
      sliceAfterLabel(text, "Work Location", [
        "Reporting to",
        "Reporting",
        "Role overview",
        "Overview",
        "KEY RESPONSIBILITIES",
        "Responsibilities",
        "Duties",
        "Our Company",
      ]),
    );
  }
  if (!work_location) {
    work_location = trimWorkLocation(
      sliceAfterLabel(text, "Địa điểm", [
        "Báo cáo",
        "Reporting",
        "Mô tả",
        "Yêu cầu",
        "Quyền lợi",
      ]),
    );
  }

  let reporting = sliceAfterLabel(text, "Reporting to", [
    "Role overview",
    "Overview",
    "KEY RESPONSIBILITIES",
    "Responsibilities",
    "Main duties",
    "Duties",
    "Requirements",
    "Must have",
    "Nice to have",
  ]);
  if (!reporting) {
    reporting = sliceAfterLabel(text, "Reporting", [
      "Role overview",
      "Overview",
      "KEY RESPONSIBILITIES",
      "Responsibilities",
      "Duties",
      "Requirements",
    ]);
  }

  return {
    position: normalizeFormText(position).slice(0, 50),
    department: normalizeFormText(department).slice(0, 50),
    employment_status: normalizeFormText(employment_status).slice(0, 50),
    update_note: normalizeFormText(update_note).slice(0, 50),
    work_location: normalizeFormText(work_location).slice(0, 255),
    reporting: normalizeFormText(reporting).slice(0, 255),
  };
}

/** Long-form sections (PDF often keeps headings in ALL CAPS). */
export function sliceDutiesBlock(raw: string): string {
  const text = flattenText(raw);
  const ends = [
    "Requirements",
    "REQUIREMENTS",
    "Experience",
    "EXPERIENCE",
    "Qualifications",
    "Must have",
    "MUST HAVE",
    "Nice to have",
    "What we offer",
    "Benefits",
    "We offer",
    "Yêu cầu",
    "YÊU CẦU",
    "Kinh nghiệm",
    "Quyền lợi",
  ];
  const starts = [
    "KEY RESPONSIBILITIES",
    "MAIN DUTIES",
    "Main duties",
    "Duties and responsibilities",
    "Responsibilities",
    "RESPONSIBILITIES",
    "DUTIES",
    "Mô tả công việc",
    "Trách nhiệm công việc",
    "Nhiệm vụ chính",
  ];
  for (const start of starts) {
    const v = sliceAfterLabel(text, start, ends, true);
    if (normalizeFormText(v)) return normalizeFormText(v);
  }
  return "";
}

export function sliceExperienceMustBlock(raw: string): string {
  const text = flattenText(raw);
  const ends = [
    "Nice to have",
    "NICE TO HAVE",
    "Preferred",
    "What we offer",
    "Benefits",
    "We offer",
    "How to apply",
    "Ưu tiên",
    "Quyền lợi",
  ];
  const starts = [
    "Must have",
    "MUST HAVE",
    "Required",
    "REQUIRED",
    "Experience requirements",
    "EXPERIENCE",
    "Yêu cầu",
    "YÊU CẦU",
    "Kinh nghiệm yêu cầu",
  ];
  for (const start of starts) {
    const v = sliceAfterLabel(text, start, ends, true);
    if (normalizeFormText(v)) return normalizeFormText(v);
  }
  return "";
}

export function sliceExperienceNiceBlock(raw: string): string {
  const text = flattenText(raw);
  const ends = [
    "What we offer",
    "WHAT WE OFFER",
    "Benefits",
    "We offer",
    "How to apply",
    "Apply",
    "Quyền lợi",
    "Phúc lợi",
  ];
  const starts = [
    "Nice to have",
    "NICE TO HAVE",
    "Preferred",
    "PREFERRED",
    "Ưu tiên",
    "Kỹ năng ưu tiên",
  ];
  for (const start of starts) {
    const v = sliceAfterLabel(text, start, ends, true);
    if (normalizeFormText(v)) return normalizeFormText(v);
  }
  return "";
}

export function sliceWhatWeOfferBlock(raw: string): string {
  const text = flattenText(raw);
  const ends = ["How to apply", "Apply now", "Contact", "APPLY", "Ứng tuyển"];
  const starts = [
    "What we offer",
    "WHAT WE OFFER",
    "Benefits",
    "We offer",
    "Why join us",
    "Quyền lợi",
    "Phúc lợi",
    "Chế độ đãi ngộ",
  ];
  for (const start of starts) {
    const v = sliceAfterLabel(text, start, ends, true);
    if (normalizeFormText(v)) return normalizeFormText(v);
  }
  return "";
}
