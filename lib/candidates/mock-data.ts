import type { CandidateRow, CandidateStatus } from "./types";

const BASE: Omit<CandidateRow, "id">[] = [
  {
    name: "Elena Rodriguez",
    role: "Senior Frontend Engineer",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCDz6yCySqwMCK0vu4USD4V_x0ilRCN4LNopTFFpMedZBH323-IoiidFmKoFo0W71mzbGc4XNAcXPdolIoZfEA7bYVhZLrZw1BBxbdrNBq4CN_5MpkYB-95OZQDaDQiN6BKkLX1R0LBIkki0doUZbYECjTFO61AsCe5F4F2Nj5J4mYmNmgQFlW0w7k8XX-xHbsAkjAYYcI96Wf8LRjBL60ryDUP0lV6TrUKykdEpzB87vAdYRrZ239DXOCGGRp2OA6VO1ieAJTJWg",
    experienceYears: 8,
    skills: ["React", "TypeScript"],
    moreSkills: 2,
    degree: "MSc Computer Science",
    school: "Stanford University",
    status: "Interviewing",
    chapter: "Engineering",
  },
  {
    name: "Julian Vane",
    role: "Product Design Lead",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBnBbMX0BpqzFfNhEfFgNmRmfia8b1gYCLKfPCqGGusjr1uKGc_2Wcl7rVa31JCwo65zMkdBTQ0M8EqYby57MBsieKakAGZVII888v8GBvp3oRYgoH3IRlHf_e2R8lGabUpFO47fMtOt5DgRKlGVNuOcqk9kx0AxuuiGJo28lvkHvULdl-2jldjObvwwMbFZ9KPobBbAH2Jc78BFog5QewZ83TpTWD78UxJoyNGewwqCybEi4QBFgA4zbV6mPpY31ucuM1jMUokFw",
    experienceYears: 12,
    skills: ["Figma", "Systems"],
    degree: "BFA Visual Design",
    school: "RISD",
    status: "Shortlisted",
    chapter: "Design",
  },
  {
    name: "Maya Okoro",
    role: "Backend Architecture",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDZS0_0eYzk1z9uVVBxAnKjpnxwV0F4bjT0ZF265fIqt9-4q7l_cldGVWhp4T1GiTcjqp4Xg5IYRG-PQ1dmmZt7f6WyOe3ulfgSAkBMUxN9CxvvmIF4F_fiV8PMQGtJgwd-j0XmwkKhZJXGUPVyw0Y6M1gxg458TnGl_-G0y0iKUiqC0qrQ8MHoytD0WMUKpqry_5ls_y-dnXj_x52a7KkmJY6V0blp4DHLXOPdm7NNYv4rpYeXyMT6GV7jJgbsoEcw0KjWFUp08A",
    experienceYears: 5,
    skills: ["Go", "K8s", "AWS"],
    degree: "BEng Software",
    school: "MIT",
    status: "New",
    chapter: "Engineering",
  },
  {
    name: "David Chen",
    role: "Growth Marketing",
    avatarUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBCrZjF087MDTliyz4_itWxXj1hVwUBqgMbw5UWo9g9OWTNOMVHagDLrjVCcj03BbSbXuuaTz9mW6yeuj8P3zcOQfX08B5_QMEtjx9TQErFW6lyn0QXnwxuGvKR8c2wXsK6bpk0vPAlbb0SripZlsJ9OPuwNsIRbaVaHYEJBvNfgBcoFjgR5xb91JgEFxMmj1n9lbUfhPfukKV71Hu7A3T5zGChzzV7A_oSwSD4tVENl7QHd8JNG-GswnJ47ci1dUbVyrz9XyHLBw",
    experienceYears: 10,
    skills: ["SEO", "Ads"],
    degree: "MBA Strategy",
    school: "Wharton School",
    status: "Interviewing",
    chapter: "Marketing",
  },
];

const EXTRA_FIRST = [
  "Alex",
  "Sam",
  "Jordan",
  "Taylor",
  "Casey",
  "Riley",
  "Morgan",
  "Quinn",
  "Avery",
  "Jamie",
];

const EXTRA_LAST = [
  "Nguyen",
  "Patel",
  "Garcia",
  "Kim",
  "Silva",
  "Brown",
  "Lee",
  "Martinez",
  "Singh",
  "Davis",
];

const ROLES = [
  "Data Engineer",
  "UX Researcher",
  "DevOps Lead",
  "Recruiter",
  "HR Partner",
  "Sales Engineer",
];

const STATUSES: CandidateStatus[] = ["New", "Shortlisted", "Interviewing"];

const CHAPTERS = ["Engineering", "Design", "Marketing", "Global"];

function buildRows(total: number): CandidateRow[] {
  const rows: CandidateRow[] = [];
  for (let i = 0; i < total; i++) {
    if (i < BASE.length) {
      rows.push({
        id: `c-${i + 1}`,
        ...BASE[i],
      });
      continue;
    }
    const fi = i % EXTRA_FIRST.length;
    const li = Math.floor(i / EXTRA_FIRST.length) % EXTRA_LAST.length;
    const name = `${EXTRA_FIRST[fi]} ${EXTRA_LAST[li]}`;
    rows.push({
      id: `c-${i + 1}`,
      name,
      role: ROLES[i % ROLES.length],
      avatarUrl: null,
      experienceYears: 3 + (i % 12),
      skills: ["Communication", "Leadership"].slice(0, (i % 2) + 1),
      moreSkills: i % 4 === 0 ? 1 : undefined,
      degree: i % 2 === 0 ? "BSc Computer Science" : "MBA",
      school: i % 2 === 0 ? "STATE UNIVERSITY" : "BUSINESS SCHOOL",
      status: STATUSES[i % STATUSES.length],
      chapter: CHAPTERS[i % CHAPTERS.length],
    });
  }
  return rows;
}

/** 124 candidates to match Stitch pagination copy */
export const CANDIDATE_ROWS: CandidateRow[] = buildRows(124);
