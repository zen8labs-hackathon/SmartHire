import type {
  JdDetail,
  JdKpi,
  JdRow,
  JdStatus,
  JdVersionChip,
} from "./types";

const JOB_TITLES = [
  "Principal Product Designer",
  "Senior React Architect",
  "Marketing Lead (EMEA)",
  "Senior Product Manager",
  "Staff Backend Engineer",
  "Head of Talent",
] as const;

const CHAPTERS = ["Design", "Tech", "Marketing", "Product"] as const;

const CAMPAIGNS = [
  "Q4 Global Expansion",
  "Infrastructure Revamp",
  "Europe Growth 2024",
  "Platform Reliability",
] as const;

const STATUSES: JdStatus[] = ["Active", "Draft", "Closed"];

function buildRows(): JdRow[] {
  const rows: JdRow[] = [];
  for (let i = 0; i < 24; i++) {
    const n = i + 1;
    rows.push({
      id: `jd-${n}`,
      jobTitle: JOB_TITLES[i % JOB_TITLES.length],
      chapter: CHAPTERS[i % CHAPTERS.length],
      campaign: CAMPAIGNS[i % CAMPAIGNS.length],
      status: STATUSES[i % STATUSES.length],
    });
  }
  return rows;
}

export const JD_ROWS: JdRow[] = buildRows();

export const JD_KPIS: JdKpi[] = [
  { id: "k1", value: "1.4 Days", label: "Time to Publish" },
  { id: "k2", value: "12", label: "Active Variants" },
  { id: "k3", value: "92%", label: "Approval Rate" },
  {
    id: "k4",
    value: "184",
    label: "Archived JDs",
    hint: "Historical data intact",
  },
];

export const JD_VERSION_CHIPS: JdVersionChip[] = [
  {
    id: "v1",
    label: "Principal Product Designer v2.4",
    filter: "Principal Product Designer",
  },
  {
    id: "v2",
    label: "Senior React Architect v1.2",
    filter: "Senior React Architect",
  },
  {
    id: "v3",
    label: "Marketing Lead (EMEA) v3.1",
    filter: "Marketing Lead (EMEA)",
  },
  {
    id: "v4",
    label: "Senior Product Manager v2.1",
    filter: "Senior Product Manager",
  },
];

const PRINCIPAL_DESIGNER_DETAIL: Omit<JdDetail, "rowId" | "status"> = {
    title: "Principal Product Designer",
    category: "Design",
    campaign: "Q4 Global Expansion",
    description:
      "We are looking for a visionary Principal Product Designer to lead our core recruitment platform transformation. You will be responsible for defining the user experience across our entire suite of professional hiring tools.",
    responsibilities: [
      "Drive the strategic vision for our design system.",
      "Collaborate with cross-functional leads in Tech and Product.",
      "Mentor senior designers and foster a culture of excellence.",
      "Oversee the end-to-end design process for critical high-scale features.",
    ],
    requirements:
      "10+ years of experience in product design, expertise in Figma, and a strong portfolio of shipped enterprise software.",
    versions: [
      {
        version: "v2.4",
        date: "Oct 12, 2023",
        author: "Sarah Jenkins",
        isCurrent: true,
      },
      { version: "v2.3", date: "Sep 28, 2023", author: "Sarah Jenkins" },
      { version: "v1.0", date: "Aug 15, 2023", author: "Alex Rivera" },
    ],
    candidates: [
      { id: "c1", initials: "EK", name: "Elena Kostic", stage: "Interviewing" },
      { id: "c2", initials: "JM", name: "James Miller", stage: "Screening" },
      { id: "c3", initials: "LW", name: "Lisa Wong", stage: "Offered" },
    ],
  };

export function getJdDetail(row: JdRow): JdDetail {
  if (row.jobTitle === "Principal Product Designer") {
    return {
      ...PRINCIPAL_DESIGNER_DETAIL,
      rowId: row.id,
      status: row.status,
      campaign: row.campaign,
    };
  }

  return {
    rowId: row.id,
    title: row.jobTitle,
    category: row.chapter,
    campaign: row.campaign,
    status: row.status,
    description: `Lead and shape the ${row.jobTitle} function within ${row.chapter}. Partner with stakeholders across ${row.campaign} to deliver measurable hiring outcomes.`,
    responsibilities: [
      `Own the roadmap for ${row.jobTitle} initiatives.`,
      `Align chapter goals with campaign priorities.`,
      "Report on pipeline health and hiring velocity.",
    ],
    requirements:
      "Relevant domain experience, strong communication skills, and a track record of shipping in fast-moving teams.",
    versions: [
      {
        version: "v1.0",
        date: "Jan 10, 2024",
        author: "Ops Team",
        isCurrent: true,
      },
    ],
    candidates: [
      { id: "x1", initials: "AA", name: "Alex Adams", stage: "Applied" },
      { id: "x2", initials: "BB", name: "Blair Brown", stage: "Phone screen" },
    ],
  };
}
