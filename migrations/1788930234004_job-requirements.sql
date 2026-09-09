-- Up Migration

-- Per-job requirement checklist for CV–JD match scoring. Rows are extracted
-- from the JD / evaluation criteria when the JD is saved (origin 'jd' |
-- 'criteria' | 'ai_inferred') or added by a recruiter ('manual'). Fed into
-- lib/ai/jd-cv-match.ts as a fixed checklist instead of letting the model
-- re-derive requirements on every candidate.
--
-- `importance` and `origin` are two separate axes on purpose: the older
-- `JdRequirementSource` enum (lib/candidates/jd-match-rationale.ts) conflated
-- priority (must_have / nice_to_have) with provenance (criteria / other).
CREATE TABLE job_requirements (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id      uuid NOT NULL REFERENCES jobs (id),
  requirement text NOT NULL,
  importance  text NOT NULL DEFAULT 'must_have', --'must_have', 'nice_to_have', 'bonus'
  origin      text NOT NULL DEFAULT 'jd', --'jd', 'criteria', 'ai_inferred', 'manual'
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_requirements_job_idx ON job_requirements (job_id);

-- Down Migration

DROP TABLE IF EXISTS job_requirements;
