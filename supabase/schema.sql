create table if not exists public.stock_items (
  id text primary key,
  name text not null check (char_length(trim(name)) > 0),
  unit text not null check (char_length(trim(unit)) > 0),
  min_quantity double precision not null check (min_quantity >= 0),
  current_stock_quantity double precision check (current_stock_quantity is null or current_stock_quantity >= 0),
  category text check (
    category is null
    or category in ('mercearia', 'bebidas', 'bomboniere', 'material limpeza', 'material descartavel')
  ),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_users (
  id text primary key,
  username text not null check (char_length(trim(username)) > 0),
  username_normalized text not null check (char_length(trim(username_normalized)) > 0),
  function_name text,
  password_hash text not null,
  password_salt text not null,
  is_admin boolean not null default false,
  can_access_dashboard boolean not null default false,
  can_access_stock boolean not null default false,
  can_access_items boolean not null default false,
  can_access_entry boolean not null default false,
  can_access_exit boolean not null default false,
  can_access_history boolean not null default false,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_stock_entries (
  id text primary key,
  item_id text not null references public.stock_items(id) on delete cascade,
  date date not null,
  quantity double precision not null check (quantity >= 0),
  movement_type text check (
    movement_type is null
    or movement_type in ('entry', 'exit', 'initial', 'consumption', 'legacy_snapshot')
  ),
  stock_after_quantity double precision check (stock_after_quantity is null or stock_after_quantity >= 0),
  created_by_user_remote_id text,
  created_by_username text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_daily_stock_entries_date
  on public.daily_stock_entries (date);

create index if not exists idx_daily_stock_entries_item_id
  on public.daily_stock_entries (item_id);

create index if not exists idx_daily_stock_entries_item_date
  on public.daily_stock_entries (item_id, date);

create index if not exists idx_daily_stock_entries_is_deleted
  on public.daily_stock_entries (is_deleted);

create index if not exists idx_stock_items_is_deleted
  on public.stock_items (is_deleted);

create index if not exists idx_stock_items_category
  on public.stock_items (category);

create index if not exists idx_app_users_is_deleted
  on public.app_users (is_deleted);

create unique index if not exists idx_app_users_username_normalized_active
  on public.app_users (username_normalized)
  where is_deleted = false;

alter table public.stock_items
  add column if not exists is_deleted boolean not null default false;

alter table public.stock_items
  add column if not exists deleted_at timestamptz;

alter table public.stock_items
  add column if not exists category text;

alter table public.stock_items
  add column if not exists current_stock_quantity double precision;

alter table public.app_users
  add column if not exists username_normalized text;

alter table public.app_users
  add column if not exists function_name text;

alter table public.app_users
  add column if not exists password_hash text;

alter table public.app_users
  add column if not exists password_salt text;

alter table public.app_users
  add column if not exists is_admin boolean not null default false;

alter table public.app_users
  add column if not exists can_access_dashboard boolean not null default false;

alter table public.app_users
  add column if not exists can_access_stock boolean not null default false;

alter table public.app_users
  add column if not exists can_access_items boolean not null default false;

alter table public.app_users
  add column if not exists can_access_entry boolean not null default false;

alter table public.app_users
  add column if not exists can_access_exit boolean not null default false;

alter table public.app_users
  add column if not exists can_access_history boolean not null default false;

alter table public.app_users
  add column if not exists is_deleted boolean not null default false;

alter table public.app_users
  add column if not exists deleted_at timestamptz;

alter table public.daily_stock_entries
  add column if not exists is_deleted boolean not null default false;

alter table public.daily_stock_entries
  add column if not exists deleted_at timestamptz;

alter table public.daily_stock_entries
  add column if not exists movement_type text;

alter table public.daily_stock_entries
  add column if not exists stock_after_quantity double precision;

alter table public.daily_stock_entries
  add column if not exists created_by_user_remote_id text;

alter table public.daily_stock_entries
  add column if not exists created_by_username text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'daily_stock_entries_item_id_date_key'
      and conrelid = 'public.daily_stock_entries'::regclass
  ) then
    alter table public.daily_stock_entries
      drop constraint daily_stock_entries_item_id_date_key;
  end if;
end
$$;

alter table public.daily_stock_entries
  drop constraint if exists daily_stock_entries_movement_type_check;

alter table public.daily_stock_entries
  add constraint daily_stock_entries_movement_type_check
  check (
    movement_type is null
    or movement_type in ('entry', 'exit', 'initial', 'consumption', 'legacy_snapshot')
  );

create or replace view public.stock_items_active as
select *
from public.stock_items
where is_deleted = false;

create or replace view public.stock_items_archived as
select *
from public.stock_items
where is_deleted = true;

create or replace view public.app_users_active as
select *
from public.app_users
where is_deleted = false;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_stock_items_updated_at on public.stock_items;
create trigger trg_stock_items_updated_at
before update on public.stock_items
for each row
execute function public.set_updated_at();

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

drop trigger if exists trg_daily_stock_entries_updated_at on public.daily_stock_entries;
create trigger trg_daily_stock_entries_updated_at
before update on public.daily_stock_entries
for each row
execute function public.set_updated_at();

alter table public.stock_items disable row level security;
alter table public.app_users disable row level security;
alter table public.daily_stock_entries disable row level security;
