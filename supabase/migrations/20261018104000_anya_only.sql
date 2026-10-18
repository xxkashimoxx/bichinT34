alter table public.ninho_event drop constraint if exists ninho_event_baby_check;
update public.ninho_event set baby = 'Anya' where baby is distinct from 'Anya';
alter table public.ninho_event add constraint ninho_event_baby_check check (baby = 'Anya');

