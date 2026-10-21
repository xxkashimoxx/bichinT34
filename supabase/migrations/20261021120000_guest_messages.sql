create table if not exists public.ninho_messages (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references public.ninho_guests(id) on delete set null,
  author_name text not null check (char_length(trim(author_name)) between 2 and 90),
  message text not null check (char_length(trim(message)) between 3 and 500),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.ninho_messages enable row level security;
revoke all on public.ninho_messages from public, anon, authenticated;
grant select, insert, update, delete on public.ninho_messages to service_role;
create index if not exists ninho_messages_created_at_idx on public.ninho_messages(created_at desc);
