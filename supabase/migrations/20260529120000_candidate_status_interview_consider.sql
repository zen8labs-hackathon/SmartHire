-- Add Interview · Consider sub-status (interview phase).

alter table public.candidates
  drop constraint if exists candidates_status_check;

alter table public.candidates
  add constraint candidates_status_check
    check (
      status in (
        'New',
        'CvPassed',
        'CvFailed',
        'Consider',
        'Interview',
        'InterviewConsider',
        'InterviewCanceled',
        'InterviewPassed',
        'InterviewFailed',
        'Offer',
        'Matched',
        'Rejected'
      )
    );
