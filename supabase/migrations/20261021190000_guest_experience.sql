alter table public.ninho_checklist add column if not exists shop_links jsonb not null default '[]'::jsonb;
alter table public.ninho_checklist add column if not exists price_band text not null default '' check (price_band in ('','ate50','50a100','100a200','acima200'));
alter table public.ninho_checklist add column if not exists reserved_by uuid references public.ninho_guests(id) on delete set null;
alter table public.ninho_checklist drop constraint if exists ninho_checklist_status_check;
alter table public.ninho_checklist add constraint ninho_checklist_status_check check (status in ('','missing','expected','have','reserved','purchased'));
alter table public.ninho_guests add column if not exists bringing_child boolean;
alter table public.ninho_guests add column if not exists dietary_restriction text not null default '';
alter table public.ninho_event add column if not exists dress_code text not null default '';
alter table public.ninho_event add column if not exists pix_key text not null default '';
alter table public.ninho_event add column if not exists pix_recipient text not null default '';
alter table public.ninho_event add column if not exists weather_lat double precision;
alter table public.ninho_event add column if not exists weather_lon double precision;
alter table public.ninho_event add constraint ninho_event_weather_lat_check check (weather_lat between -90 and 90);
alter table public.ninho_event add constraint ninho_event_weather_lon_check check (weather_lon between -180 and 180);
create table if not exists public.ninho_guesses (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references public.ninho_guests(id) on delete cascade,
  birth_date date,
  weight_grams integer check (weight_grams between 500 and 7000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ninho_guesses enable row level security;
revoke all on public.ninho_guesses from public, anon, authenticated;
grant select, insert, update, delete on public.ninho_guesses to service_role;

-- One conditional update makes a reservation atomic even when two guests tap together.
create or replace function public.ninho_reserve_item(p_item_id text, p_guest_id uuid)
returns boolean language sql security invoker set search_path = public, pg_catalog as $$
  with claimed as (
    update public.ninho_checklist
       set status = 'reserved', reserved_by = p_guest_id
     where id = p_item_id and status in ('','missing')
       and exists (select 1 from public.ninho_guests where id = p_guest_id)
     returning id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.ninho_reserve_item(text,uuid) from public, anon, authenticated;
grant execute on function public.ninho_reserve_item(text,uuid) to service_role;
