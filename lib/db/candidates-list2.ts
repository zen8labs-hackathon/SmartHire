import type { QueryExecutor } from "@/lib/db/config/client";
import { clampLimit, clampOffset } from "@/lib/db/query-helpers";

const ACCENTED = "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ";

function stripMarks(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

const FROM_CHARS = ACCENTED + ACCENTED.toUpperCase();
// Every accented char is a single code point (NFC) and maps to one plain char.
const TO_CHARS = Array.from(ACCENTED).map(stripMarks).join("");
const TRANSLATE_TO = TO_CHARS + TO_CHARS.toUpperCase();

/** Case- and diacritic-insensitive form of a search term (matches `foldSql`). */
export function foldSearchTerm(s: string): string {
  return stripMarks(s.normalize("NFC")).toLowerCase();
}

/** SQL expression folding `expr` the same way as {@link foldSearchTerm}. No `unaccent` extension needed. */
export function foldSql(expr: string): string {
  return `lower(translate(${expr}, '${FROM_CHARS}', '${TRANSLATE_TO}'))`;
}

export const CANDIDATES2_SORTS = ["updated", "name", "exp", "created"] as const;
export type Candidates2Sort = (typeof CANDIDATES2_SORTS)[number];
export type Candidates2Tab = "all" | "applying";
export type Candidates2Rehire = "eligible" | "ask" | "not_eligible" | "unset";

export type Candidates2Filters = {
  q?: string;
  tab?: Candidates2Tab;
  role?: string;
  tag?: string;
  starred?: boolean;
  expMin?: number;
  expMax?: number;
  rehire?: Candidates2Rehire;
  apps?: "1" | "2+";
  sortBy?: Candidates2Sort;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type Candidates2LatestApp = {
  id: string;
  job_id: string;
  title: string | null;
  stage: string | null;
  sub: string | null;
  result: "open" | "ended" | "hired";
  score: number | null;
  score_status: string | null;
  created_at: Date;
} | null;

export type Candidates2Row = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  degree: string | null;
  education: string | null;
  role: string | null;
  experience_years: string | null;
  skills: string[];
  tags: string[];
  rehire_status: "eligible" | "ask" | "not_eligible" | null;
  created_at: Date;
  updated_at: Date;
  app_count: number;
  has_open: boolean;
  latest: Candidates2LatestApp;
  is_starred: boolean;
};

export type Candidates2Result = {
  rows: Candidates2Row[];
  total: number;
  counts: { all: number; applying: number };
  facets: { roles: string[]; tags: string[] };
  limit: number;
  offset: number;
};

const SORT_SQL: Record<Candidates2Sort, string> = {
  updated: "updated_at",
  name: `${foldSql("coalesce(name, '')")}`,
  exp: "experience_years",
  created: "created_at",
};

export async function listCandidates2(
  db: QueryExecutor,
  f: Candidates2Filters = {},
): Promise<Candidates2Result> {
  const limit = clampLimit(f.limit);
  const offset = clampOffset(f.offset);
  const conds: string[] = ["c.deleted_at IS NULL"];
  const values: unknown[] = [];
  const push = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };

  const fq = f.q ? foldSearchTerm(f.q.trim()) : "";
  if (fq) {
    const like = push(`%${fq.replace(/[\\%_]/g, "\\$&")}%`);
    const hay = foldSql(
      "concat_ws(' ', c.name, c.email, c.phone, regexp_replace(coalesce(c.phone, ''), '\\s', '', 'g'), c.role, c.degree, array_to_string(c.skills, ' '), array_to_string(c.tags, ' '))",
    );
    conds.push(`${hay} LIKE ${like}`);
  }
  if (f.role) conds.push(`c.role = ${push(f.role)}`);
  if (f.tag) conds.push(`${push(f.tag)} = ANY(c.tags)`);
  if (f.expMin != null) conds.push(`c.experience_years >= ${push(f.expMin)}`);
  if (f.expMax != null) conds.push(`c.experience_years <= ${push(f.expMax)}`);
  if (f.rehire === "unset") conds.push("c.rehire_status IS NULL");
  else if (f.rehire) conds.push(`c.rehire_status = ${push(f.rehire)}`);
  if (f.apps === "1") conds.push("coalesce(a.app_count, 0) = 1");
  if (f.apps === "2+") conds.push("coalesce(a.app_count, 0) >= 2");
  if (f.starred !== undefined) conds.push(`c.is_starred = ${push(f.starred)}`)
  const dir = f.sortDir === "asc" ? "ASC" : "DESC";
  const sortCol = SORT_SQL[f.sortBy ?? "updated"];
  const nulls = f.sortBy === "exp" ? " NULLS LAST" : "";
  const limitP = push(limit);
  const offsetP = push(offset);
  const tabCond = f.tab === "applying" ? "WHERE has_open" : "";

  const { rows } = await db.query<
    Candidates2Row & {
      all_count: string;
      applying_count: string;
      total_count: string;
    }
  >(
    `WITH base AS (
       SELECT c.id, c.name, c.email, c.phone, c.degree, c.education, c.role,
              c.experience_years, c.skills, c.tags, c.rehire_status, c.is_starred,
              c.created_at, c.updated_at,
              coalesce(a.app_count, 0)::int AS app_count,
              coalesce(a.has_open, false) AS has_open,
              l.latest,
              count(*) OVER() AS all_count,
              count(*) FILTER (WHERE coalesce(a.has_open, false)) OVER() AS applying_count
         FROM candidates c
         LEFT JOIN LATERAL (
           SELECT count(*) AS app_count,
                  bool_or(ca.ended_at IS NULL AND ca.hired_at IS NULL) AS has_open
             FROM campaign_applied ca
            WHERE ca.candidate_id = c.id AND ca.deleted_at IS NULL
         ) a ON true
         LEFT JOIN LATERAL (
           SELECT json_build_object(
                    'id', ca.id, 'job_id', ca.job_id, 'title', j.position,
                    'stage', ps.label, 'sub', pss.label,
                    'result', CASE WHEN ca.hired_at IS NOT NULL THEN 'hired'
                                   WHEN ca.ended_at IS NOT NULL THEN 'ended'
                                   ELSE 'open' END,
                    'score', ca.jd_match_score, 'score_status', ca.jd_match_status,
                    'created_at', ca.created_at) AS latest
             FROM campaign_applied ca
             LEFT JOIN jobs j ON j.id = ca.job_id AND j.deleted_at IS NULL
             LEFT JOIN job_stage_mappings jsm ON jsm.id = ca.current_job_stage_mapping_id
             LEFT JOIN pipeline_stages ps ON ps.id = jsm.pipeline_stage_id
             LEFT JOIN pipeline_sub_stages pss ON pss.id = ca.current_sub_state_id
            WHERE ca.candidate_id = c.id AND ca.deleted_at IS NULL
            ORDER BY ca.created_at DESC, ca.id DESC
            LIMIT 1
         ) l ON true
        WHERE ${conds.join(" AND ")}
     )
     SELECT *, count(*) OVER() AS total_count
       FROM base ${tabCond}
      ORDER BY ${sortCol} ${dir}${nulls}, id DESC
      LIMIT ${limitP} OFFSET ${offsetP}`,
    values,
  );

  const [roles, tags] = await Promise.all([
    db.query<{ role: string }>(
      `SELECT DISTINCT role FROM candidates WHERE deleted_at IS NULL AND role IS NOT NULL AND role <> '' ORDER BY role`,
    ),
    db.query<{ tag: string }>(
      `SELECT DISTINCT unnest(tags) AS tag FROM candidates WHERE deleted_at IS NULL ORDER BY tag`,
    ),
  ]);

  const first = rows[0];
  return {
    rows: rows.map(
      ({
        all_count: _a,
        applying_count: _p,
        total_count: _t,
        ...row
      }) => row,
    ),
    total: first ? Number(first.total_count) : 0,
    counts: first
      ? { all: Number(first.all_count), applying: Number(first.applying_count) }
      : { all: 0, applying: 0 },
    facets: {
      roles: roles.rows.map((r) => r.role),
      tags: tags.rows.map((r) => r.tag),
    },
    limit,
    offset,
  };
}
