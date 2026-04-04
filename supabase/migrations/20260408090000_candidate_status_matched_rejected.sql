-- Pipeline terminal outcomes: Matched / Rejected (from Offer only). Failed remains for earlier stages.

alter table public.candidates
  drop constraint if exists candidates_status_check;

alter table public.candidates
  add constraint candidates_status_check
    check (
      status in (
        'New',
        'Shortlisted',
        'Interviewing',
        'Offer',
        'Failed',
        'Matched',
        'Rejected'
      )
    );
