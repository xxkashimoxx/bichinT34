create table if not exists public.ninho_gifts (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.ninho_guests(id) on delete set null,
  donor_name text not null check (char_length(trim(donor_name)) between 2 and 90),
  item_id text references public.ninho_checklist(id) on delete set null,
  gift_description text not null check (char_length(trim(gift_description)) between 2 and 180),
  message text not null default '' check (char_length(message) <= 300),
  publish_message boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.ninho_gifts enable row level security;
revoke all on public.ninho_gifts from public, anon, authenticated;
grant select, insert, update, delete on public.ninho_gifts to service_role;
create index if not exists ninho_gifts_created_at_idx on public.ninho_gifts(created_at desc);
