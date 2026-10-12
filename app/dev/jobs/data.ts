// Mock data for the /dev/jobs design preview (ported from the DesignSync "Jobs" design).

export type RoleKey = "hr" | "ch" | "rc" | "iv";
export type Role = {
  key: RoleKey;
  name: string;
  role: string;
  salary: boolean;
  allJobs?: boolean;
  chapter?: string;
  shared?: number[];
  assigned?: number[];
  canCreate: boolean;
  canDecide: boolean;
  hideScore?: boolean;
};
export type Notif = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  action?: string;
  href: [number, string, number?];
  roles: RoleKey[];
};
export type TimelineItem = { text: string; by: string; at: string; human?: boolean; reason?: string };
export type JobStatus = "Open" | "Draft" | "On hold" | "Closed";
export type Job = {
  id: number;
  title: string;
  chapter: string;
  level: string;
  type: string;
  status: JobStatus;
  headcount: number;
  hired: number;
  deadline: string | null;
  daysLeft?: number;
  candidates: number;
  attention: number;
  owner: string;
  updated: string;
  draftNote?: string | null;
  processing?: "upload" | "extract" | "llm" | null;
  fresh?: boolean;
  blank?: boolean;
  file?: string;
  criteria?: { id: string; req: string; imp: string; origin: "AI" | "HR" }[];
  reviewRequested?: boolean;
  note?: string;
};
export type StageId = "cv" | "iv" | "offer" | "probation" | "hired";
export type Stage = {
  id: StageId;
  color: string;
  label: string;
  subs: string[];
  def: string;
  pass: string;
  fail?: string;
  schedule?: boolean;
  probation?: boolean;
  template?: string;
  rounds?: { name: string; template: string }[];
};
export type Band = "strong" | "good" | "partial" | "limited" | "review";
export type Candidate = {
  id: number;
  name: string;
  headline: string;
  stage: StageId;
  sub: string;
  round?: string;
  hold?: { what: string; who: string } | null;
  band?: Band;
  score?: number;
  ai?: number;
  formula?: number;
  st: "done" | "error" | "scoring";
  err?: string;
  source: string;
  owner: string;
  applied: string;
  days: number;
  salary: string;
  flags?: string[];
  notes?: number;
  noNote?: boolean;
  proposal?: { to: StageId | "reject"; by: string; at: string; reason?: string } | null;
  ivDone?: boolean;
  ivNote?: string;
  prob?: unknown;
};
export type Criterion = {
  id: string;
  req: string;
  imp: string;
  origin: "AI" | "HR";
  status: "meets" | "partial" | "not_met" | "unknown";
  evidence?: string;
  src?: string;
};
export type AttentionItem = {
  id: string;
  group: string;
  kind: string;
  fs?: string;
  tech?: string;
  file: string;
  title: string;
  detail: string;
  actions: string[];
  cand?: number;
};
export type BatchFile = {
  file: string;
  kind: "new" | "existing" | "dup_job" | "suspected" | "failed" | "same_file";
  cand?: string;
  candId?: number;
  since?: string;
  matched: string;
  did: string;
  prev?: number;
  score?: number;
  handled?: string;
};
export type Batch = { id: string; at: string; ago: number; by: string; source: string; files: BatchFile[] };
export type Pool = { id: "pool"; title: string; candidates: number; attention: number; note: string };
export type AccessData = {
  chapters: { name: string; by: string; at: string; members: number }[];
  people: { name: string; role: string; via: string; by: string; at: string; salary: boolean; cands?: number }[];
};

const NEW = ['nguyen_van_an.pdf', 'pham_thi_hoa_cv.pdf', 'le_quang_minh.docx', 'vo_thanh_tung.pdf', 'dang_hai_yen.pdf', 'bui_tien_dat.pdf', 'hoang_my_linh.pdf', 'ngo_duc_thang.docx', 'truong_bao_ngoc.pdf', 'phan_van_khoa.pdf', 'do_thu_trang_2026.pdf', 'ly_minh_quan.pdf', 'mai_thanh_son.pdf', 'cao_ngoc_anh.pdf', 'ta_quang_vinh.docx', 'duong_khanh_linh.pdf', 'kieu_van_son.pdf', 'lam_ngoc_diep.pdf', 'chau_tuan_kiet.pdf', 'ha_phuong_nhi.pdf', 'ton_that_binh.pdf', 'quach_my_duyen.pdf', 'au_duong_phong.pdf'];
const nw = (n: number, from: number): BatchFile[] =>
  NEW.slice(from, from + n).map((f, i) => ({ file: f, kind: "new", matched: "No match", did: "Created candidate and application", score: [72, 81, 58, 66, 41][i % 5] }));

export const JD = {
today: '29/09/2026',
roles: {
  hr: { key: 'hr', name: 'Nguyễn Thị Hiền', role: 'HR Generalist', salary: true, allJobs: true, canCreate: true, canDecide: true },
  ch: { key: 'ch', name: 'Trần Quang Huy', role: 'Chapter Head · Web', salary: true, chapter: 'Web', canCreate: true, canDecide: true },
  rc: { key: 'rc', name: 'Phạm Thùy Linh', role: 'Recruiter', salary: false, shared: [142, 155], canCreate: false, canDecide: false },
  iv: { key: 'iv', name: 'Đỗ Minh Đức', role: 'Interviewer · Web', salary: false, shared: [142], assigned: [5, 1], canCreate: false, canDecide: false, hideScore: true }
},
notifs: [
  { id: 'n1', title: 'Upload from 14:20 finished', body: '25 CVs · 21 done · 2 existing candidates · 2 need attention', time: '2 min', unread: true, action: 'Open Needs attention', href: [142, 'attention'], roles: ['hr', 'rc'] },
  { id: 'n2', title: 'Interview notes overdue', body: 'Vũ Đức Anh · Interview 1 on 25/09 · Position #142', time: '1 h', unread: true, action: 'Write notes', href: [142, 'candidates', 5], roles: ['hr', 'ch', 'iv'] },
  { id: 'n3', title: 'Criteria review requested', body: 'DevOps Engineer #156 · 5 criteria from JD', time: 'Yesterday', unread: false, href: [156, 'jd'], roles: ['hr', 'ch'] },
  { id: 'n4', title: 'Candidate moved to Offer', body: 'Position #142 · by Nguyễn Thị Hiền', time: '2 days', unread: false, href: [142, 'candidates'], roles: ['hr', 'ch', 'rc'] }
],
timeline: [
  { text: 'Interview 1 done · set to Consider, Interview 2 needed', by: 'Trần Quang Huy', at: '27/09/2026', human: true },
  { text: 'Moved to Interview', by: 'Trần Quang Huy', at: '25/09/2026', reason: 'passed CV Scan', human: true },
  { text: 'Scored: Good match 74', by: 'System', at: '24/09/2026' },
  { text: 'CV v2 uploaded', by: 'Nguyễn Thị Hiền', at: '24/09/2026', human: true },
  { text: 'Added to position from Talent pool', by: 'Nguyễn Thị Hiền', at: '24/09/2026', human: true }
],
pool: { id: 'pool', title: 'Talent pool', candidates: 86, attention: 3, note: 'CVs kept without a position · reusable in later hiring rounds' },
jobs: [
  { id: 142, title: 'Senior Web Developer', chapter: 'Web', level: 'Senior', type: 'Full-time', status: 'Open', headcount: 2, hired: 1, deadline: '10/10/2026', daysLeft: 11, candidates: 24, attention: 6, owner: 'Nguyễn Thị Hiền', updated: '28/09/2026' },
  { id: 138, title: 'Backend Engineer (Node.js)', chapter: 'Web', level: 'Mid', type: 'Full-time', status: 'Open', headcount: 4, hired: 4, deadline: '30/11/2026', daysLeft: 62, candidates: 31, attention: 1, owner: 'Nguyễn Thị Hiền', updated: '27/09/2026' },
  { id: 155, title: 'Web Intern · Winter 2026', chapter: 'Web', level: 'Intern', type: 'Internship', status: 'Open', headcount: 4, hired: 0, deadline: '31/10/2026', daysLeft: 32, candidates: 46, attention: 3, owner: 'Nguyễn Thị Hiền', updated: '29/09/2026' },
  { id: 151, title: 'Mobile Developer (Flutter)', chapter: 'Mobile', level: 'Mid', type: 'Full-time', status: 'Open', headcount: 1, hired: 0, deadline: '15/10/2026', daysLeft: 16, candidates: 12, attention: 2, owner: 'Nguyễn Thị Hiền', updated: '26/09/2026' },
  { id: 147, title: 'QA Engineer', chapter: 'QA', level: 'Junior', type: 'Full-time', status: 'Open', headcount: 2, hired: 2, deadline: '20/10/2026', daysLeft: 21, candidates: 18, attention: 0, owner: 'Nguyễn Thị Hiền', updated: '22/09/2026' },
  { id: 156, title: 'DevOps Engineer', chapter: 'Infra', level: 'Senior', type: 'Full-time', status: 'Draft', headcount: 1, hired: 0, deadline: null, candidates: 0, attention: 0, owner: 'Nguyễn Thị Hiền', updated: '29/09/2026', draftNote: 'Criteria waiting for Chapter Head review' },
  { id: 133, title: 'Data Engineer', chapter: 'Data', level: 'Mid', type: 'Full-time', status: 'On hold', headcount: 1, hired: 0, deadline: '15/12/2026', daysLeft: 77, candidates: 9, attention: 0, owner: 'Nguyễn Thị Hiền', updated: '10/09/2026' },
  { id: 129, title: 'Bridge SE (Japanese N2)', chapter: 'BrSE', level: 'Senior', type: 'Full-time', status: 'Closed', headcount: 1, hired: 1, deadline: '31/08/2026', candidates: 27, attention: 0, owner: 'Nguyễn Thị Hiền', updated: '02/09/2026' }
],
stages: [
  { id: 'cv', color: 'var(--chart-6)', label: 'CV Scan', subs: ['New', 'Consider', 'Passed', 'Failed'], def: 'New', pass: 'Passed', fail: 'Failed' },
  { id: 'iv', color: 'var(--chart-1)', label: 'Interview', subs: ['New', 'Consider', 'Passed', 'Failed'], def: 'New', pass: 'Passed', fail: 'Failed', schedule: true, template: 'Technical interview v2', rounds: [{ name: 'Interview 1', template: 'Technical interview v2' }, { name: 'Interview 2', template: 'Culture & client fit' }] },
  { id: 'offer', color: 'var(--chart-2)', label: 'Offer', subs: ['New', 'Matched', 'Offer', 'Rejected'], def: 'New', pass: 'Offer', fail: 'Rejected' },
  { id: 'probation', color: 'var(--chart-5)', label: 'Probation', subs: ['Awaiting start', 'In progress', 'Review submitted', 'Passed', 'Not passed', 'Ended early', 'Did not start'], def: 'Awaiting start', pass: 'Passed', probation: true, template: 'Probation review · Engineering v1' },
  { id: 'hired', color: 'var(--chart-4)', label: 'Official', subs: ['Official'], def: 'Official', pass: 'Official' }
],
candidates: [
  { id: 1, name: 'Trần Minh Bảo', headline: 'Frontend Developer · FinPay · 5 yrs', stage: 'iv', sub: 'Consider', round: 'Interview 2', hold: { what: 'Mixed Interview 1 notes on GraphQL — confirm depth in Interview 2', who: 'Trần Quang Huy' }, band: 'good', score: 74, ai: 78, formula: 68, st: 'done', source: 'Referral', owner: 'Phạm Thùy Linh', applied: '24/09/2026', days: 2, salary: '38,000,000 VND', flags: ['prev'], notes: 2 },
  { id: 2, name: 'Nguyễn Thu Hà', headline: 'Web Engineer · Tiki · 6 yrs', stage: 'iv', sub: 'New', round: 'Interview 2', band: 'strong', score: 86, ai: 88, formula: 83, st: 'done', source: 'Career site', owner: 'Phạm Thùy Linh', applied: '15/09/2026', days: 4, salary: '45,000,000 VND', notes: 4 },
  { id: 3, name: 'Lê Hoàng Nam', headline: 'Fullstack Developer · Base.vn · 4 yrs', stage: 'cv', sub: 'New', band: 'good', score: 69, ai: 71, formula: 66, st: 'done', source: 'Email', owner: 'Nguyễn Thị Hiền', applied: '26/09/2026', days: 3, salary: '32,000,000 VND' },
  { id: 4, name: 'Đặng Thu Trang', headline: 'React Developer · NashTech · 3 yrs', stage: 'cv', sub: 'New', st: 'error', err: 'Provider timeout after 60s', source: 'Career site', owner: 'Nguyễn Thị Hiền', applied: '28/09/2026', days: 1, salary: '28,000,000 VND' },
  { id: 5, name: 'Vũ Đức Anh', headline: 'Senior Frontend · MoMo · 7 yrs', stage: 'iv', sub: 'New', round: 'Interview 1', band: 'strong', score: 81, ai: 84, formula: 76, st: 'done', source: 'LinkedIn', owner: 'Phạm Thùy Linh', applied: '12/09/2026', days: 9, salary: '50,000,000 VND', noNote: true, notes: 1 },
  { id: 6, name: 'Phạm Quỳnh Chi', headline: 'Web Developer · FPT Software · 3 yrs', stage: 'cv', sub: 'New', st: 'scoring', source: 'Partner school', owner: 'Nguyễn Thị Hiền', applied: '29/09/2026', days: 0, salary: '25,000,000 VND' },
  { id: 7, name: 'Hoàng Gia Khánh', headline: 'Frontend Engineer · Zalo · 4 yrs', stage: 'cv', sub: 'Passed', proposal: { to: 'iv', by: 'Phạm Thùy Linh', at: '28/09/2026' }, band: 'partial', score: 52, ai: 55, formula: 47, st: 'done', source: 'Referral', owner: 'Phạm Thùy Linh', applied: '20/09/2026', days: 5, salary: '34,000,000 VND', flags: ['alumni'] },
  { id: 8, name: 'Sato Yuki', headline: 'Frontend Developer · Rikkeisoft · 5 yrs', stage: 'offer', sub: 'Offer', band: 'strong', score: 84, ai: 85, formula: 82, st: 'done', source: 'LinkedIn', owner: 'Nguyễn Thị Hiền', applied: '02/09/2026', days: 3, salary: '4,200 USD', notes: 6 },
  { id: 9, name: 'Bùi Ngọc Mai', headline: 'UI Developer · Viettel · 2 yrs', stage: 'cv', sub: 'New', band: 'limited', score: 34, ai: 38, formula: 28, st: 'done', source: 'Career site', owner: 'Nguyễn Thị Hiền', applied: '27/09/2026', days: 2, salary: '22,000,000 VND' },
  { id: 11, name: 'Phan Minh Tuấn', headline: 'Frontend Developer · Sun* · 6 yrs', stage: 'probation', sub: 'In progress', band: 'strong', score: 83, ai: 85, formula: 80, st: 'done', source: 'Referral', owner: 'Nguyễn Thị Hiền', applied: '20/07/2026', days: 57, salary: '44,000,000 VND', notes: 5 },
  { id: 10, name: 'Trịnh Văn Long', headline: 'Frontend Developer · Shopee · 5 yrs', stage: 'cv', sub: 'Consider', hold: { what: 'AI could not band this CV — check frontend years manually', who: 'Phạm Thùy Linh' }, band: 'review', st: 'done', source: 'Email', owner: 'Phạm Thùy Linh', applied: '18/09/2026', days: 11, salary: '40,000,000 VND' }
],
criteria: [
  { id: 'r1', req: 'React and TypeScript in production', imp: 'Must have', origin: 'AI', status: 'meets', evidence: 'FinPay — rebuilt checkout in React 18 + TypeScript, 2022–now', src: 'CV p.1' },
  { id: 'r2', req: '3+ years frontend experience', imp: 'Must have', origin: 'AI', status: 'meets', evidence: '5 years across FinPay and Sapo', src: 'CV p.1' },
  { id: 'r3', req: 'REST / GraphQL API integration', imp: 'Must have', origin: 'AI', status: 'partial', evidence: 'REST integrations listed; no GraphQL mentioned', src: 'CV p.2' },
  { id: 'r4', req: 'English for client meetings', imp: 'Nice to have', origin: 'HR', status: 'unknown' },
  { id: 'r5', req: 'Payments or fintech domain', imp: 'Nice to have', origin: 'HR', status: 'meets', evidence: 'Payment gateway dashboard for merchants', src: 'CV p.1' }
],
attention: [
  { id: 'a1', group: 'Files that could not be read', kind: 'failed', fs: 'unreadable', tech: 'error_stage=ai_parsing · empty text layer', file: 'scan_cv_hoang.pdf', title: 'Scanned image PDF — no text layer', detail: 'Uploaded 29/09 14:20 · Batch of 25', actions: ['Enter manually', 'Upload text version'] },
  { id: 'a2', group: 'Files that could not be read', kind: 'failed', fs: 'error', tech: 'error_stage=queue · enqueue timeout', file: 'nguyen_thanh_cv.docx', title: 'System busy — file was not queued', detail: 'Uploaded 29/09 14:20 · Batch of 25', actions: ['Retry'] },
  { id: 'a3', group: 'Possible duplicates', kind: 'duplicate', fs: 'duplicate', file: 'le_minh_chau_2026.pdf', title: 'Email matches Lê Minh Châu (applied 03/2025); phone number differs', detail: 'Not merged automatically', actions: ['Compare'] },
  { id: 'a4', group: 'Possible duplicates', kind: 'contact', fs: 'contact', file: 'cv_final(2).pdf', title: 'No email or phone number found in CV', detail: 'Candidate not created until contact is entered', actions: ['Enter contact'] },
  { id: 'a5', group: 'Scoring', kind: 'score', cand: 4, file: 'Đặng Thu Trang', title: 'AI scoring failed — Provider timeout after 60s', detail: 'Rule checks completed · AI part missing', actions: ['Rescore'] },
  { id: 'a6', group: 'Interviews without notes', kind: 'note', cand: 5, file: 'Vũ Đức Anh', title: 'Interview 1 on 25/09 · Trần Quang Huy has not submitted notes', detail: 'Due 27/09 · 2 days overdue', actions: ['Send reminder', 'Open candidate'] }
],
access: {
  chapters: [{ name: 'Web', by: 'Nguyễn Thị Hiền', at: '10/09/2026', members: 14 }],
  people: [
    { name: 'Trần Quang Huy', role: 'Chapter Head · Web', via: 'Chapter', by: 'System', at: '10/09/2026', salary: true },
    { name: 'Phạm Thùy Linh', role: 'Recruiter', via: 'Direct', by: 'Nguyễn Thị Hiền', at: '10/09/2026', salary: false, cands: 34 },
    { name: 'Đỗ Minh Đức', role: 'Interviewer · Interview 1', via: 'Interview schedule', by: 'Trần Quang Huy', at: '22/09/2026', salary: false, cands: 3 }
  ]
},
batches: [
    { id: 'b1', at: '29/09/2026 14:20', ago: 0, by: 'Nguyễn Thị Hiền', source: 'Career site', files: [
      ...nw(19, 0),
      { file: 'tran_b_cv_2026.pdf', kind: 'existing', cand: 'Trần Bảo Long', since: '03/2025', matched: 'Email + phone', did: 'Linked to existing candidate · new application for this position · scored against these criteria', score: 63 },
      { file: 'nguyen_thu_ha_v3.pdf', kind: 'dup_job', cand: 'Nguyễn Thu Hà', candId: 2, matched: 'Email + phone', did: 'No new application · read and scored again · saved as CV v3 (in use) · stage unchanged (Interview - New)', prev: 86, score: 88 },
      { file: 'le_minh_chau_2026.pdf', kind: 'suspected', cand: 'Lê Minh Châu', matched: 'Email only · phone differs', did: 'Not merged · sent to Needs attention' },
      { file: 'scan_cv_hoang.pdf', kind: 'failed', matched: '—', did: 'Scanned image PDF, no text layer · enter manually or upload a text version' },
      { file: 'nguyen_thanh_cv.docx', kind: 'failed', matched: '—', did: 'System busy, file not queued · retry' }
    ] },
    { id: 'b2', at: '24/09/2026 09:10', ago: 5, by: 'Nguyễn Thị Hiền', source: 'Referral', files: [
      ...nw(9, 10),
      { file: 'TranMinhBao_CV_Sep2026.pdf', kind: 'existing', cand: 'Trần Minh Bảo', candId: 1, since: '03/2025', matched: 'Email + phone', did: 'Linked to existing candidate (Talent pool) · new application for this position', score: 74 },
      { file: 'vu_duc_anh_cv.pdf', kind: 'dup_job', cand: 'Vũ Đức Anh', candId: 5, matched: 'Email + phone', did: 'Read and scored again · saved as CV v2 (in use) · stage unchanged', prev: 79, score: 81 },
      { file: 'vu_duc_anh_cv.pdf', kind: 'same_file', cand: 'Vũ Đức Anh', candId: 5, matched: 'Same file content', did: 'Same file as CV v2 · processed again · newest kept in use', prev: 81, score: 81, handled: 'Nguyễn Thị Hiền · noted as resent by referrer' }
    ] },
    { id: 'b3', at: '20/09/2026 16:45', ago: 9, by: 'Phạm Thùy Linh', source: 'LinkedIn', files: [
      ...nw(5, 3),
      { file: 'cv_final(2).pdf', kind: 'failed', matched: '—', did: 'No email or phone found · candidate entered manually', handled: 'Phạm Thùy Linh · 21/09' }
    ] },
    { id: 'b4', at: '02/09/2026 10:05', ago: 27, by: 'Nguyễn Thị Hiền', source: 'Email', files: nw(8, 14) }
],
} as {
  today: string;
  roles: Record<RoleKey, Role>;
  notifs: Notif[];
  timeline: TimelineItem[];
  pool: Pool;
  jobs: Job[];
  stages: Stage[];
  candidates: Candidate[];
  criteria: Criterion[];
  attention: AttentionItem[];
  access: AccessData;
  batches: Batch[];
};

export const STAGE_COLORS: Record<string, string> = { 'CV Scan': 'var(--chart-6)', Interview: 'var(--chart-1)', Applied: 'var(--chart-6)', Screening: 'var(--chart-3)', 'Technical test': 'var(--chart-4)', 'Interview 1': 'var(--chart-1)', 'Interview 2': 'var(--chart-1)', 'Mentor interview': 'var(--chart-4)', Offer: 'var(--chart-2)', Probation: 'var(--chart-5)', Official: 'var(--chart-4)', Hired: 'var(--chart-4)' };

export const stageColor = (k: string) => {
  const s = JD.stages.find((x) => x.id === k || x.label === k);
  return s?.color || STAGE_COLORS[k] || "var(--neutral-500)";
};

export const stageOf = (id: string) => JD.stages.find((s) => s.id === id)!;

const SRC: Record<string, [string, string]> = { LinkedIn: ['linkedin', 'linkedin'], Referral: ['referral', 'user-plus'], 'Career site': ['site', 'globe'], Email: ['email', 'mail'], 'Partner school': ['school', 'graduation-cap'] };
export const srcInfo = (s: string): [string, string] => SRC[s] || ['other', 'inbox'];
