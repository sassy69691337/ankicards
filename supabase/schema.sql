-- AnkiCards: облачная синхронизация.
-- Запустить один раз: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Скрипт можно запускать повторно, он ничего не удаляет.

-- 1. Записи коллекции (колоды, заметки, карточки, история, настройки) в виде JSON
create sequence if not exists public.records_seq;

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  device text not null default '',
  seq bigint not null default nextval('public.records_seq'),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists records_user_seq on public.records (user_id, seq);

-- Каждое изменение получает новый порядковый номер: по нему устройство забирает новое
create or replace function public.records_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.seq := nextval('public.records_seq');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before update on public.records
  for each row execute function public.records_touch();

-- Каждый пользователь видит и меняет только свои записи
alter table public.records enable row level security;

drop policy if exists "records: own rows" on public.records;
create policy "records: own rows" on public.records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.records to authenticated;
grant usage, select on sequence public.records_seq to authenticated;
revoke all on public.records from anon;

-- 2. Картинки: приватное хранилище, у каждого пользователя своя папка
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists "media: read own" on storage.objects;
create policy "media: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "media: insert own" on storage.objects;
create policy "media: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "media: update own" on storage.objects;
create policy "media: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "media: delete own" on storage.objects;
create policy "media: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
