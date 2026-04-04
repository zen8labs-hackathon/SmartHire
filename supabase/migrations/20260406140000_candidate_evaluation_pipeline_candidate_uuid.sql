-- Upgrade: pipeline_candidate_id text -> uuid (for DBs that already applied 20260406120000 with text).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'candidate_evaluation_reviews'
      and column_name = 'pipeline_candidate_id'
      and udt_name = 'text'
  ) then
    delete from public.candidate_evaluation_reviews;
    drop index if exists public.candidate_evaluation_reviews_jd_pipeline_idx;
    alter table public.candidate_evaluation_reviews
      drop column pipeline_candidate_id;
    alter table public.candidate_evaluation_reviews
      add column pipeline_candidate_id uuid not null;
    create index candidate_evaluation_reviews_jd_pipeline_idx
      on public.candidate_evaluation_reviews (
        job_description_id,
        pipeline_candidate_id,
        created_at desc
      );
  end if;
end $$;
