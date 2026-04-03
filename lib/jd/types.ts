export type JdStatus = "Active" | "Draft" | "Closed";

export type JdRow = {
  id: string;
  jobTitle: string;
  chapter: string;
  campaign: string;
  status: JdStatus;
};

export type JdVersionEntry = {
  version: string;
  date: string;
  author: string;
  isCurrent?: boolean;
};

export type JdCandidate = {
  id: string;
  initials: string;
  name: string;
  stage: string;
};

export type JdDetail = {
  rowId: string;
  title: string;
  category: string;
  campaign: string;
  status: JdStatus;
  description: string;
  responsibilities: string[];
  requirements: string;
  versions: JdVersionEntry[];
  candidates: JdCandidate[];
};

export type JdKpi = {
  id: string;
  value: string;
  label: string;
  hint?: string;
};

export type JdVersionChip = {
  id: string;
  label: string;
  filter: string;
};
