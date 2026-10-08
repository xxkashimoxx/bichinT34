alter table public.ninho_event
  add column if not exists gift_url text not null default '',
  add column if not exists photos_url text not null default '',
  add column if not exists music_url text not null default '';
