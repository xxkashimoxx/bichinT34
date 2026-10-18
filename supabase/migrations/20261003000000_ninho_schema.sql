create extension if not exists pgcrypto with schema extensions;

create schema if not exists ninho_private;
revoke all on schema ninho_private from public, anon, authenticated;

create table if not exists ninho_private.admin_settings (
  singleton boolean primary key default true check (singleton),
  password_hash text not null
);
insert into ninho_private.admin_settings(singleton,password_hash)
values (true, 'ccd5f47862011916c261f60a4e73e088c3dcc6bc657156d488d583888ed5c974')
on conflict (singleton) do nothing;

create table public.ninho_event (
  id integer primary key default 1 check (id = 1),
  baby text not null default 'Anya' check (baby = 'Anya'),
  event_date date,
  event_time time,
  address text not null default '',
  message text not null default 'Venha celebrar conosco!',
  map_url text not null default ''
);
create table public.ninho_guests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(24),'hex'),
  name text not null,
  phone text not null default '',
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','yes','no')),
  party_size integer not null default 1 check (party_size between 1 and 8),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create table public.ninho_checklist (
  id text primary key,
  priority integer not null check (priority between 1 and 3),
  category text not null,
  icon text not null,
  name text not null,
  quantity text not null default '',
  status text not null default '' check (status in ('','have','missing'))
);

alter table public.ninho_event enable row level security;
alter table public.ninho_guests enable row level security;
alter table public.ninho_checklist enable row level security;
revoke all on public.ninho_event, public.ninho_guests, public.ninho_checklist from public, anon, authenticated;
grant select, insert, update, delete on public.ninho_event, public.ninho_guests, public.ninho_checklist to service_role;

create or replace function public.ninho_verify_admin(p_password text)
returns boolean
language sql
security definer
set search_path = pg_catalog, extensions, ninho_private
as $$
  select coalesce(
    (select extensions.digest(convert_to(coalesce(p_password,''),'UTF8'),'sha256') = decode(password_hash,'hex')
     from ninho_private.admin_settings where singleton),
    false
  );
$$;
revoke all on function public.ninho_verify_admin(text) from public, anon, authenticated;
grant execute on function public.ninho_verify_admin(text) to service_role;

insert into public.ninho_event(id,baby,event_date,event_time,address,message,map_url)
values (1, 'Anya', null, null, '', 'Venha celebrar conosco!', '')
on conflict (id) do nothing;
insert into public.ninho_checklist(id,priority,category,icon,name,quantity,status)
values
('1-roupinhas-body-manga-curta-1', 1, 'Roupinhas', '♧', 'Body manga curta', '6', ''),
('1-roupinhas-body-manga-longa-2', 1, 'Roupinhas', '♧', 'Body manga longa', '6', ''),
('1-roupinhas-calca-mijao-3', 1, 'Roupinhas', '♧', 'Calça/mijão', '6', ''),
('1-roupinhas-macacao-4', 1, 'Roupinhas', '♧', 'Macacão', '6', ''),
('1-roupinhas-casaquinho-5', 1, 'Roupinhas', '♧', 'Casaquinho', '2', ''),
('1-roupinhas-meias-6', 1, 'Roupinhas', '♧', 'Meias', '4 pares', ''),
('1-roupinhas-touca-7', 1, 'Roupinhas', '♧', 'Touca', '2', ''),
('1-roupinhas-roupa-para-sair-8', 1, 'Roupinhas', '♧', 'Roupa para sair', '2', ''),
('1-sono-berco-mini-berco-9', 1, 'Sono', '☾', 'Berço/mini berço', '1', ''),
('1-sono-colchao-firme-adequado-10', 1, 'Sono', '☾', 'Colchão firme adequado', '1', ''),
('1-sono-lencol-com-elastico-11', 1, 'Sono', '☾', 'Lençol com elástico', '3', ''),
('1-sono-manta-leve-12', 1, 'Sono', '☾', 'Manta leve', '2', ''),
('1-sono-cueiro-13', 1, 'Sono', '☾', 'Cueiro', '2–3', ''),
('1-banho-e-higiene-banheira-simples-14', 1, 'Banho e higiene', '♨', 'Banheira simples', '1', ''),
('1-banho-e-higiene-toalha-com-capuz-15', 1, 'Banho e higiene', '♨', 'Toalha com capuz', '2–3', ''),
('1-banho-e-higiene-toalha-fralda-16', 1, 'Banho e higiene', '♨', 'Toalha fralda', '2', ''),
('1-banho-e-higiene-trocador-17', 1, 'Banho e higiene', '♨', 'Trocador', '1', ''),
('1-banho-e-higiene-fralda-de-boca-18', 1, 'Banho e higiene', '♨', 'Fralda de boca', '6', ''),
('1-banho-e-higiene-fralda-de-ombro-19', 1, 'Banho e higiene', '♨', 'Fralda de ombro', '3', ''),
('1-banho-e-higiene-sabonete-liquido-infantil-20', 1, 'Banho e higiene', '♨', 'Sabonete líquido infantil', '1', ''),
('1-banho-e-higiene-escova-pente-21', 1, 'Banho e higiene', '♨', 'Escova/pente', '1', ''),
('1-banho-e-higiene-cortador-lixa-de-unha-22', 1, 'Banho e higiene', '♨', 'Cortador/lixa de unha', '1', ''),
('1-banho-e-higiene-termometro-23', 1, 'Banho e higiene', '♨', 'Termômetro', '1', ''),
('1-banho-e-higiene-algodao-24', 1, 'Banho e higiene', '♨', 'Algodão', '1 pacote', ''),
('1-banho-e-higiene-pomada-para-assadura-25', 1, 'Banho e higiene', '♨', 'Pomada para assadura', '1', ''),
('1-fraldas-fralda-p-26', 1, 'Fraldas', '▱', 'Fralda P', '2–3 pacotes', ''),
('1-passeio-e-seguranca-bebe-conforto-cadeirinha-adequada-27', 1, 'Passeio e segurança', '⌂', 'Bebê-conforto/cadeirinha adequada', '1', ''),
('1-passeio-e-seguranca-carrinho-28', 1, 'Passeio e segurança', '⌂', 'Carrinho', '1', ''),
('2-fraldas-fralda-rn-29', 2, 'Fraldas', '▱', 'Fralda RN', '1 pacote', ''),
('2-fraldas-fralda-m-30', 2, 'Fraldas', '▱', 'Fralda M', '2–3 pacotes', ''),
('2-fraldas-trocador-descartavel-31', 2, 'Fraldas', '▱', 'Trocador descartável', '1 pacote', ''),
('2-amamentacao-sutia-de-amamentacao-32', 2, 'Amamentação', '♡', 'Sutiã de amamentação', '2–3', ''),
('2-amamentacao-absorvente-para-seios-33', 2, 'Amamentação', '♡', 'Absorvente para seios', '1 pacote', ''),
('2-amamentacao-almofada-de-amamentacao-34', 2, 'Amamentação', '♡', 'Almofada de amamentação', '1', ''),
('2-amamentacao-paninhos-de-boca-35', 2, 'Amamentação', '♡', 'Paninhos de boca', '6', ''),
('2-passeio-e-organizacao-bolsa-mochila-maternidade-36', 2, 'Passeio e organização', '⌂', 'Bolsa/mochila maternidade', '1', ''),
('2-passeio-e-organizacao-trocador-portatil-37', 2, 'Passeio e organização', '⌂', 'Trocador portátil', '1', ''),
('2-passeio-e-organizacao-manta-extra-38', 2, 'Passeio e organização', '⌂', 'Manta extra', '1', ''),
('2-passeio-e-organizacao-cesto-de-roupa-suja-39', 2, 'Passeio e organização', '⌂', 'Cesto de roupa suja', '1', ''),
('2-passeio-e-organizacao-cabides-40', 2, 'Passeio e organização', '⌂', 'Cabides', '6–10', ''),
('2-passeio-e-organizacao-organizadores-simples-41', 2, 'Passeio e organização', '⌂', 'Organizadores simples', '2–4', ''),
('2-brinquedos-chocalho-42', 2, 'Brinquedos', '✿', 'Chocalho', '1', ''),
('2-brinquedos-mordedor-43', 2, 'Brinquedos', '✿', 'Mordedor', '1', ''),
('2-brinquedos-livro-de-tecido-alto-contraste-44', 2, 'Brinquedos', '✿', 'Livro de tecido/alto contraste', '1', ''),
('3-extras-saco-de-dormir-45', 3, 'Extras', '✧', 'Saco de dormir', '1–2', ''),
('3-extras-roupa-especial-46', 3, 'Extras', '✧', 'Roupa especial', '1', ''),
('3-extras-bomba-tira-leite-47', 3, 'Extras', '✧', 'Bomba tira-leite', '1', ''),
('3-extras-potes-para-leite-48', 3, 'Extras', '✧', 'Potes para leite', '2–4', ''),
('3-extras-mamadeiras-49', 3, 'Extras', '✧', 'Mamadeiras', '0–2', ''),
('3-extras-chupetas-50', 3, 'Extras', '✧', 'Chupetas', 'Somente se optar', ''),
('3-extras-tapete-de-atividades-51', 3, 'Extras', '✧', 'Tapete de atividades', '1, mais adiante', ''),
('3-extras-mobile-52', 3, 'Extras', '✧', 'Móbile', '1', ''),
('3-extras-mais-roupas-p-m-53', 3, 'Extras', '✧', 'Mais roupas P/M', 'Conforme crescimento', '')
on conflict (id) do nothing;

