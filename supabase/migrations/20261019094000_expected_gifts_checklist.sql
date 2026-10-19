alter table public.ninho_checklist drop constraint ninho_checklist_status_check;
alter table public.ninho_checklist add constraint ninho_checklist_status_check
  check (status in ('', 'have', 'missing', 'expected'));
