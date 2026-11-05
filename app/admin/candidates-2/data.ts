import { COOLDOWN_DAYS, COOLDOWN_MONTHS } from "@/lib/candidates/cooldown";
// Mock data ported from the Candidates.html design. Nothing here talks to real app data.

import type { Persona, Job, AppResult, CandApp, CvUse, Cv, Ev, Person } from "./types";

export type { Persona, Job, AppResult, CandApp, CvUse, Cv, Ev, Person };

export const TODAY = "30/09/2026";
export const RETAIN = 24;
export const COOLDOWN = COOLDOWN_MONTHS;

export const PERSONAS: Persona[] = [
  { key: "hr", name: "Nguyễn Thị Hiền", role: "HR Generalist", salary: true, allJobs: true, canCreate: true, canDecide: true },
  { key: "ch", name: "Trần Quang Huy", role: "Chapter Head · Web", salary: true, chapter: "Web", canCreate: true, canDecide: true },
  { key: "rc", name: "Phạm Thùy Linh", role: "Recruiter", salary: false, shared: [142, 155], canCreate: false, canDecide: false },
  { key: "iv", name: "Đỗ Minh Đức", role: "Interviewer · Web", salary: false, shared: [142], assigned: [5, 1], canCreate: false, canDecide: false },
  { key: "ad", name: "Lê Minh Quân", role: "Admin", salary: true, allJobs: true, admin: true, canCreate: false, canDecide: false },
];

export const PERSONA_OPTIONS = [
  { value: "hr", label: "Chị Hiền · HR Generalist" },
  { value: "ch", label: "Anh Huy · Chapter Head Web" },
  { value: "rc", label: "Linh · Recruiter" },
  { value: "iv", label: "Anh Đức · Interviewer" },
  { value: "ad", label: "Anh Quân · Admin" },
];

export const JOBS: Job[] = [
  { id: 142, title: "Senior Web Developer", chapter: "Web", status: "Open", headcount: 2, hired: 1, deadline: "10/10/2026", candidates: 24 },
  { id: 138, title: "Backend Engineer (Node.js)", chapter: "Web", status: "Open", headcount: 4, hired: 4, deadline: "30/11/2026", candidates: 31 },
  { id: 155, title: "Web Intern · Winter 2026", chapter: "Web", status: "Open", headcount: 4, hired: 0, deadline: "31/10/2026", candidates: 46 },
  { id: 151, title: "Mobile Developer (Flutter)", chapter: "Mobile", status: "Open", headcount: 1, hired: 0, deadline: "15/10/2026", candidates: 12 },
  { id: 147, title: "QA Engineer", chapter: "QA", status: "Open", headcount: 2, hired: 2, deadline: "20/10/2026", candidates: 18 },
  { id: 156, title: "DevOps Engineer", chapter: "Infra", status: "Draft", headcount: 1, hired: 0, deadline: null, candidates: 0 },
  { id: 133, title: "Data Engineer", chapter: "Data", status: "On hold", headcount: 1, hired: 0, deadline: "15/12/2026", candidates: 9 },
  { id: 129, title: "Bridge SE (Japanese N2)", chapter: "BrSE", status: "Closed", headcount: 1, hired: 1, deadline: "31/08/2026", candidates: 27 },
];

const CLOSED: Job[] = [
  { id: 121, title: "Mobile Developer (React Native)", chapter: "Mobile", status: "Closed", headcount: 1, hired: 1, deadline: null, candidates: 0 },
  { id: 109, title: "Frontend Developer", chapter: "Web", status: "Closed", headcount: 1, hired: 1, deadline: null, candidates: 0 },
  { id: 125, title: "Backend Engineer (Java)", chapter: "Web", status: "Closed", headcount: 1, hired: 1, deadline: null, candidates: 0 },
  { id: 112, title: "QA Engineer", chapter: "QA", status: "Closed", headcount: 1, hired: 1, deadline: null, candidates: 0 },
];

const J = (id: number | null) => (id == null ? null : JOBS.find((j) => j.id === id) || CLOSED.find((j) => j.id === id) || null);

export const REASONS: [string, string, string][] = [
  ["skills", "Skills gap", "Technical depth did not match what the position needs."],
  ["salary", "Salary mismatch", "Expectation was outside the range for the level."],
  ["culture", "Culture or team fit", "Working style or values did not fit the team."],
  ["withdrew", "Candidate withdrew", "The candidate chose to stop, or accepted another offer."],
  ["noshow", "No-show", "Missed interviews or stopped responding."],
  ["closed", "Position closed or filled", "The position closed before a decision was made."],
  ["other", "Other", "None of the above. A note is required."],
];
export const RL: Record<string, string> = Object.fromEntries(REASONS.map((r) => [r[0], r[1]]));

export const REHIRE = {
  eligible: { tone: "success", icon: "circle-check", label: "Eligible" },
  ask: { tone: "warning", icon: "circle-help", label: "Ask HR first" },
  no: { tone: "danger", icon: "circle-slash", label: "Not eligible" },
} as const;

export const ORDER = ["CV Scan", "Interview", "Offer", "Probation", "Official"];

// ---------- date helpers ----------
export function pd(s: string): Date {
  const p = s.split("/").map(Number);
  if (p.length === 2) return new Date(p[1], p[0] - 1, 1);
  if (p[0] > 1000) return new Date(p[0], p[1] - 1, p[2]);
  return new Date(p[2], p[1] - 1, p[0]);
}
const z = (n: number) => String(n).padStart(2, "0");
export const fmt = (d: Date) => `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()}`;
export function addM(s: string, m: number): string {
  const d = pd(s);
  d.setMonth(d.getMonth() + m);
  return fmt(d);
}
export const days = (a: string, b: string) => Math.round((pd(b).getTime() - pd(a).getTime()) / 864e5);
export function ago(s: string): string {
  const a = pd(s);
  const t = pd(TODAY);
  const m = (t.getFullYear() - a.getFullYear()) * 12 + t.getMonth() - a.getMonth();
  if (m <= 0) return "this month";
  if (m < 12) return `${m} month${m > 1 ? "s" : ""} ago`;
  const y = Math.floor(m / 12);
  return `${y} year${y > 1 ? "s" : ""} ago`;
}
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const slug = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/\s+/g, "");
export const slugOf = slug;

// ---------- permissions ----------
export function canSeeApp(u: Persona, a: CandApp): boolean {
  if (u.allJobs) return true;
  if (a.job == null) return u.key !== "iv";
  if (u.chapter) return a.chapter === u.chapter;
  return (u.shared || []).includes(a.job);
}
export function canSeePerson(u: Persona, p: Person): boolean {
  if (u.allJobs) return true;
  if (u.key === "iv") return (u.assigned || []).includes(p.id);
  return p.apps.some((a) => a.job != null && canSeeApp(u, a));
}
export function canSeeSalary(u: Persona, a: CandApp): boolean {
  return !!u.allJobs || (u.key === "ch" && a.chapter === u.chapter);
}
export function latestApp(p: Person): CandApp {
  return p.apps.find((a) => a.result === "open") || p.apps[0];
}

// ---------- retention / reminder / cooldown ----------
export const remindDue = (p: Person) => !!p.remind && days(p.remind.date, TODAY) >= 0;
export const retainEnd = (p: Person) => addM(p.consent.date, RETAIN);
export const retainDays = (p: Person) => days(TODAY, retainEnd(p));
export function cooldown(p: Person): CandApp | null {
  if (p.cooldownApp !== undefined) return p.apps.find((a) => a.id === p.cooldownApp) || null;
  if (!p.apps.some((a) => a.result === "open")) return null;
  const ended = p.apps
    .filter((a) => a.result === "ended" && a.end && days(a.end, TODAY) < COOLDOWN_DAYS)
    .sort((a, b) => pd(b.end!).getTime() - pd(a.end!).getTime());
  return ended[0] || null;
}

// ---------- builders ----------
function A(id: string, job: number | null, date: string, stage: string, sub: string, result: AppResult, x: Partial<CandApp> = {}): CandApp {
  const j = J(job);
  return {
    id, job, date, stage, sub, result,
    title: j ? j.title : "Talent pool",
    chapter: j ? j.chapter : null,
    jobStatus: j ? j.status : null,
    ...x,
  };
}
const pool = (id: string, date: string, from: string): CandApp => A(id, null, date, "Talent pool", "Kept", "pool", { from });

type Raw = Omit<Person, "cvs" | "tags" | "log" | "consent" | "rehire"> &
  Partial<Pick<Person, "cvs" | "tags" | "rehire" | "remind" | "consent">>;

function build(r: Raw): Person {
  const last = r.apps[r.apps.length - 1];
  const full = /^\d\d\/\d\d\/\d{4}$/.test(r.created);
  const apps = r.apps.map((a) => ({ ...a, rk: a.rk ?? (a.reasonGroup ? ({ Skills: "skills", Salary: "salary", Culture: "culture" } as Record<string, string>)[a.reasonGroup] || "other" : undefined) }));
  const cvs: Cv[] = r.cvs || [
    {
      id: "cv" + r.id, file: `${slug(r.name)}_CV.pdf`, date: last.date, by: "Nguyễn Thị Hiền", batch: "Batch " + last.date + " 14:20",
      source: r.source, matched: r.apps.length > 1 ? "Email + phone" : "New candidate", status: "parsed", latest: true,
      uses: apps.map((a) => ({ app: a.id, v: 1, inUse: true })),
    },
  ];
  return {
    ...r,
    apps,
    cvs,
    tags: r.tags || [],
    log: [],
    rehire: r.rehire || { v: null },
    consent: r.consent || { date: full ? r.created : last.date, via: r.source === "Career site" ? "Career site application form" : `Recorded by HR at upload (${r.source.toLowerCase()})` },
  };
}

const HIEN = "Nguyễn Thị Hiền";
const CHW = "Chapter Head Web";

const raw: Raw[] = [
  {
    id: 1, name: "Trần Minh Bảo", email: "bao.tranminh@gmail.com", phone: "0912 348 671", role: "Frontend Developer", exp: 5,
    skills: ["React", "TypeScript", "Next.js", "REST APIs", "Jest", "Tailwind CSS"], degree: "B.Sc. Computer Science",
    education: "Hanoi University of Science and Technology · 2019", english: "IELTS 7.0", dob: "14/02/1996", company: "FinPay",
    source: "Career site", created: "12/03/2025", updated: "25/09/2026",
    edits: { exp: { ai: 6, by: HIEN, at: "25/09/2026", reason: "Sapo internship not counted" } },
    conflict: { field: "exp", cv: 6, file: "TranMinhBao_CV_Sep2026.pdf" },
    apps: [
      A("a1", 142, "24/09/2026", "Interview", "Consider", "open", { round: "Interview 2", band: "good", score: 74, iv: 1, notes: 2, evals: 1, salary: "38,000,000 VND", jc: 1 }),
      pool("a2", "02/07/2025", "Kept after #121 closed"),
      A("a3", 121, "12/03/2025", "Interview", "Failed", "ended", { round: "Interview 2", band: "partial", score: 55, iv: 2, notes: 3, evals: 2, salary: "32,000,000 VND", end: "20/03/2025", reasonGroup: "Skills", reason: "Missing must-have: state management at scale", by: CHW }),
    ],
    cvs: [
      {
        id: "f3", file: "TranMinhBao_CV_Sep2026.pdf", date: "24/09/2026", by: HIEN, batch: "Batch 24/09/2026 09:40", source: "Career site",
        matched: "Email + phone", status: "parsed", latest: true,
        change: "Experience now reads 6 years (was 3). Moved from Sapo to FinPay. Added TypeScript, Next.js and Tailwind CSS. IELTS 7.0 replaces TOEIC 750.",
        uses: [{ app: "a1", v: 2, inUse: true }],
      },
      {
        id: "f2", file: "TranMinhBao_CV_scan.pdf", date: "02/07/2025", by: HIEN, batch: "Batch 02/07/2025 10:05", source: "Email",
        matched: "Email", status: "failed", error: "Scanned image without a text layer. Ask the candidate for a text-based PDF or DOCX.",
        uses: [{ app: "a2", note: "Not used · could not be read" }],
      },
      {
        id: "f1", file: "TranMinhBao_CV_2025.pdf", date: "12/03/2025", by: HIEN, batch: "Batch 12/03/2025 14:20", source: "Career site",
        matched: "New candidate", status: "parsed",
        uses: [{ app: "a3", v: 1, inUse: false, note: "Application ended" }, { app: "a2", v: 1, note: "Kept in talent pool" }],
      },
    ],
    tags: ["React senior track", "Strong communication"],
    rehire: { v: "eligible", reason: "Solid fundamentals. Revisit once he has state management at scale.", by: HIEN, at: "21/03/2025" },
    extra: [
      { d: "14/03/2025", type: "iv", app: "a3", icon: "calendar-check", title: "Interview 1 completed", sub: "Passed · Nguyễn Văn Huy, Trần Minh Đức" },
      { d: "19/03/2025", type: "iv", app: "a3", icon: "calendar-check", title: "Interview 2 completed", sub: "Failed · evaluation by Chapter Head Web" },
      { d: "24/09/2026", type: "iv", app: "a1", icon: "message-square", title: "Note by Phạm Thùy Linh", sub: "Expects 38M VND, can start 30 days after offer." },
      { d: "25/09/2026", type: "record", icon: "pencil", title: "Experience edited from 6 to 5 years", sub: "Nguyễn Thị Hiền · Sapo internship not counted" },
      { d: "26/09/2026", type: "iv", app: "a1", icon: "calendar-check", title: "Interview 1 completed", sub: "Consider · Nguyễn Văn Huy" },
    ],
  },
  {
    id: 2, name: "Nguyễn Thu Hà", email: "thuha.nguyen@outlook.com", phone: "0983 112 405", role: "Web Engineer", exp: 6,
    skills: ["Vue", "React", "Node.js", "GraphQL", "AWS"], degree: "B.Eng. Software Engineering",
    education: "Posts and Telecommunications Institute of Technology · 2018", english: "TOEIC 850", dob: "03/09/1995", company: "Tiki",
    source: "Career site", created: "15/09/2026", updated: "26/09/2026",
    apps: [A("b1", 142, "15/09/2026", "Interview", "New", "open", { round: "Interview 2", band: "strong", score: 86, iv: 2, notes: 4, evals: 1, salary: "45,000,000 VND", jc: 2 })],
  },
  {
    id: 3, name: "Lê Hoàng Nam", email: "namlh.dev@gmail.com", phone: "0904 773 218", role: "Fullstack Developer", exp: 4,
    skills: ["React", "Node.js", "PostgreSQL", "Docker"], degree: "B.Sc. Information Technology",
    education: "University of Engineering and Technology, VNU · 2020", english: "Not found in CV", dob: "21/11/1998", company: "Base.vn",
    source: "Email", created: "26/09/2026", updated: "27/09/2026",
    apps: [
      A("c1", 142, "26/09/2026", "CV Scan", "New", "open", { band: "good", score: 69, salary: "32,000,000 VND", jc: 3 }),
      A("c2", 138, "26/09/2026", "CV Scan", "New", "open", { band: "good", score: 71, salary: "32,000,000 VND" }),
    ],
  },
  {
    id: 4, name: "Đặng Thu Trang", email: "trang.dang.t@gmail.com", phone: "0967 501 339", role: "React Developer", exp: 3,
    skills: ["React", "Redux", "JavaScript", "SCSS"], degree: "B.Sc. Computer Science", education: "Thuyloi University · 2021",
    english: "Not found in CV", dob: "08/05/1999", company: "NashTech", source: "Career site", created: "10/04/2026", updated: "28/09/2026",
    apps: [
      A("d1", 142, "28/09/2026", "CV Scan", "New", "open", { scoreErr: true, salary: "28,000,000 VND", jc: 4 }),
      A("d0", 109, "10/04/2026", "Interview", "Failed", "ended", { round: "Interview 1", band: "partial", score: 58, iv: 1, evals: 1, salary: "26,000,000 VND", end: "05/05/2026", rk: "skills", reasonGroup: "Skills", reason: "React hooks and state handling below mid level", by: CHW }),
    ],
    rehire: { v: "ask", reason: "Can re-apply after 6 months. Check hooks and state knowledge in CV Scan.", by: HIEN, at: "06/05/2026" },
    consent: { date: "10/04/2026", via: "Career site application form" },
  },
  {
    id: 5, name: "Vũ Đức Anh", email: "ducanh.vu@proton.me", phone: "0936 280 114", role: "Senior Frontend Developer", exp: 7,
    skills: ["React", "TypeScript", "Micro-frontends", "Webpack", "Performance"], degree: "B.Sc. Computer Science", education: "FPT University · 2017",
    english: "IELTS 6.5", dob: "30/01/1994", company: "MoMo", source: "LinkedIn", created: "12/09/2026", updated: "25/09/2026",
    apps: [A("e1", 142, "12/09/2026", "Interview", "New", "open", { round: "Interview 1", band: "strong", score: 81, iv: 1, notes: 1, salary: "50,000,000 VND", jc: 5 })],
  },
  {
    id: 6, name: "Phạm Quỳnh Chi", email: "quynhchi.pham@gmail.com", phone: "0978 640 552", role: "Web Developer", exp: 3,
    skills: ["Angular", "TypeScript", "RxJS"], degree: "B.Sc. Information Systems", education: "National Economics University · 2022",
    english: "Not found in CV", dob: "17/07/2000", company: "FPT Software", source: "Partner school", created: "29/09/2026", updated: "29/09/2026",
    apps: [A("f1", 142, "29/09/2026", "CV Scan", "New", "open", { scoring: true, salary: "25,000,000 VND", jc: 6 })],
  },
  {
    id: 7, name: "Hoàng Gia Khánh", email: "khanh.hg@gmail.com", phone: "0915 227 903", role: "Frontend Engineer", exp: 4,
    skills: ["React", "React Native", "JavaScript"], degree: "B.Sc. Computer Science", education: "Hanoi University of Science and Technology · 2020",
    english: "TOEIC 780", dob: "11/12/1997", company: "Zalo", source: "Referral", created: "04/2021", updated: "20/09/2026", alumni: "Zen8labs 2021–2023",
    apps: [
      A("g1", 142, "20/09/2026", "CV Scan", "Passed", "open", { band: "partial", score: 52, notes: 1, salary: "34,000,000 VND", jc: 7 }),
      A("g2", 109, "06/04/2021", "Official", "Official", "official", { iv: 2, notes: 2, evals: 2, salary: "18,000,000 VND", end: "06/2023", by: CHW }),
    ],
    tags: ["Alumni", "Mobile + web"],
    rehire: { v: "eligible", reason: "Left on good terms to relocate. Chapter Head Web would rehire.", by: HIEN, at: "30/06/2023" },
  },
  {
    id: 8, name: "Sato Yuki", email: "yuki.sato@example.jp", phone: "+81 90 4412 7730", role: "Frontend Developer", exp: 5,
    skills: ["React", "TypeScript", "Japanese (native)", "Storybook"], degree: "B.A. Informatics", education: "Kyoto Institute of Technology · 2019",
    english: "TOEIC 820", dob: "1996/06/02", company: "Rikkeisoft", source: "LinkedIn", created: "02/09/2026", updated: "27/09/2026",
    apps: [A("h1", 142, "02/09/2026", "Offer", "Offer", "open", { band: "strong", score: 84, iv: 2, notes: 6, evals: 2, salary: "4,200 USD", jc: 8 })],
  },
  {
    id: 9, name: "Bùi Ngọc Mai", email: "mai.bui.ngoc@gmail.com", phone: "0947 385 610", role: "UI Developer", exp: 2,
    skills: ["HTML/CSS", "JavaScript", "Figma"], degree: "B.Sc. Multimedia", education: "Posts and Telecommunications Institute of Technology · 2023",
    english: "Not found in CV", dob: "25/03/2001", company: "Viettel", source: "Career site", created: "27/09/2026", updated: "28/09/2026",
    apps: [
      A("i1", 142, "27/09/2026", "CV Scan", "New", "open", { band: "limited", score: 34, salary: "22,000,000 VND", jc: 9 }),
      A("i2", 155, "27/09/2026", "CV Scan", "Consider", "open", { band: "good", score: 70, salary: "8,000,000 VND" }),
    ],
  },
  {
    id: 10, name: "Trịnh Văn Long", email: "long.trinh@yahoo.com", phone: "0988 019 247", role: "Frontend Developer", exp: 5,
    skills: ["React", "JavaScript", "jQuery"], degree: "Not found in CV", education: "Not found in CV", english: "Not found in CV", dob: "Not found in CV",
    company: "Shopee", source: "Email", created: "18/09/2026", updated: "18/09/2026",
    apps: [A("j1", 142, "18/09/2026", "CV Scan", "New", "open", { band: "review", salary: "40,000,000 VND", jc: 10 })],
  },
  {
    id: 11, name: "Lê Minh Châu", email: "chau.leminh@gmail.com", phone: "0903 552 187", role: "Backend Developer", exp: 4,
    skills: ["Java", "Spring Boot", "MySQL", "Kafka"], degree: "B.Sc. Computer Science", education: "Da Nang University of Technology · 2020",
    english: "TOEIC 700", dob: "09/10/1998", company: "CMC Global", source: "Career site", created: "03/03/2025", updated: "30/05/2025", dupOf: 15,
    apps: [
      pool("k1", "30/05/2025", "Kept after #125 closed"),
      A("k2", 125, "03/03/2025", "Interview", "Failed", "ended", { round: "Interview 1", band: "good", score: 67, iv: 1, notes: 1, evals: 1, salary: "30,000,000 VND", end: "18/03/2025" }),
    ],
    tags: ["Java", "Kafka"],
    remind: { date: "15/10/2026", note: "Check interest in Backend Java #138", owner: HIEN },
  },
  {
    id: 15, name: "Lê Minh Châu", email: "chau.leminh@gmail.com", phone: "0868 204 931", role: "Backend Engineer", exp: 5,
    skills: ["Java", "Spring Boot", "Node.js", "PostgreSQL", "Kafka"], degree: "B.Sc. Computer Science", education: "Da Nang University of Technology · 2020",
    english: "IELTS 6.5", dob: "09/10/1998", company: "VNPay", source: "Email", created: "29/09/2026", updated: "29/09/2026", dupOf: 11,
    apps: [A("o1", 138, "29/09/2026", "CV Scan", "New", "open", { band: "good", score: 66, salary: "38,000,000 VND" })],
  },
  {
    id: 12, name: "Ngô Thanh Tùng", email: "tung.ngo.qa@gmail.com", phone: "0977 315 860", role: "QA Engineer", exp: 3,
    skills: ["Manual testing", "Playwright", "Postman", "SQL"], degree: "B.Sc. Information Technology", education: "Hanoi Open University · 2021",
    english: "TOEIC 650", dob: "19/08/1999", company: "Zen8labs", source: "Referral", created: "01/08/2026", updated: "15/09/2026",
    apps: [A("l1", 147, "01/08/2026", "Probation", "Review submitted", "probation", { band: "good", score: 72, iv: 2, notes: 3, evals: 2, salary: "20,000,000 VND" })],
  },
  {
    id: 13, name: "Đỗ Hải Yến", email: "yen.dohai@gmail.com", phone: "0932 870 441", role: "Mobile Developer", exp: 4,
    skills: ["Flutter", "Dart", "Firebase", "Kotlin"], degree: "B.Sc. Computer Science", education: "University of Engineering and Technology, VNU · 2020",
    english: "IELTS 6.0", dob: "02/04/1998", company: "VNG", source: "LinkedIn", created: "21/09/2026", updated: "24/09/2026",
    apps: [A("m1", 151, "21/09/2026", "CV Scan", "Passed", "open", { band: "good", score: 72, notes: 1, salary: "35,000,000 VND" })],
  },
  {
    id: 14, name: "Phan Anh Khoa", email: "khoa.phananh@gmail.com", phone: "0916 660 273", role: "Data Engineer", exp: 5,
    skills: ["Python", "Airflow", "Spark", "BigQuery"], degree: "M.Sc. Data Science", education: "Ho Chi Minh City University of Technology · 2019",
    english: "IELTS 7.5", dob: "28/12/1995", company: "Got It", source: "Referral", created: "05/09/2026", updated: "10/09/2026",
    apps: [A("n1", 133, "05/09/2026", "CV Scan", "Consider", "open", { band: "good", score: 68, salary: "42,000,000 VND" })],
  },
  {
    id: 16, name: "Nguyễn Văn Hùng", email: "hung.nv.java@gmail.com", phone: "0945 118 062", role: "Java Developer", exp: 8,
    skills: ["Java", "Microservices", "Oracle", "AWS"], degree: "B.Eng. Computer Engineering", education: "Hanoi University of Science and Technology · 2016",
    english: "TOEIC 800", dob: "05/05/1993", company: "Viettel Solutions", source: "Career site", created: "14/11/2024", updated: "14/11/2024",
    apps: [pool("p1", "14/11/2024", "Uploaded without a position")],
    tags: ["Java", "Microservices", "Salary above range 2024"],
    consent: { date: "20/09/2024", via: "Recorded by HR at upload (career site)" },
    remind: { date: "25/09/2026", note: "Ask about the Java Lead opening", owner: "Phạm Thùy Linh" },
  },
];

export const PEOPLE: Person[] = raw.map(build);
