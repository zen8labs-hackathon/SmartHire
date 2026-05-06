-- Three major pipeline phases with distinct substates (avoids ambiguous Passed/Failed labels).
-- CV Scan: New, CvPassed, CvFailed, Consider
-- Interview: Interview, InterviewCanceled, InterviewPassed, InterviewFailed
-- Offer: Offer, Matched, Rejected

alter table public.candidates
  drop constraint if exists candidates_status_check;

-- Legacy → new (order matters)
update public.candidates
set status = 'CvPassed'
where status = 'Shortlisted';

update public.candidates
set status = 'Interview'
where status = 'Interviewing';

update public.candidates
set status = 'InterviewFailed'
where status = 'Failed'
  and interview_at is not null;

update public.candidates
set status = 'CvFailed'
where status = 'Failed';

alter table public.candidates
  add constraint candidates_status_check
    check (
      status in (
        'New',
        'CvPassed',
        'CvFailed',
        'Consider',
        'Interview',
        'InterviewCanceled',
        'InterviewPassed',
        'InterviewFailed',
        'Offer',
        'Matched',
        'Rejected'
      )
    );
