create table if not exists public.stock_items (
  id text primary key,
  name text not null check (char_length(trim(name)) > 0),
  unit text not null check (char_length(trim(unit)) > 0),
  min_quantity double precision not null check (min_quantity >= 0),
  current_stock_quantity double precision check (current_stock_quantity is null or current_stock_quantity >= 0),
  category text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.item_categories (
  id text primary key,
  name text not null check (char_length(trim(name)) > 0),
  name_normalized text not null check (char_length(trim(name_normalized)) > 0),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.measurement_units (
  id text primary key,
  name text not null check (char_length(trim(name)) > 0),
  name_normalized text not null check (char_length(trim(name_normalized)) > 0),
  conversion_factor double precision not null default 1 check (conversion_factor > 0),
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

create index if not exists idx_item_categories_is_deleted
  on public.item_categories (is_deleted);

create index if not exists idx_measurement_units_is_deleted
  on public.measurement_units (is_deleted);

create unique index if not exists idx_item_categories_name_normalized_active
  on public.item_categories (name_normalized)
  where is_deleted = false;

create unique index if not exists idx_measurement_units_name_normalized_active
  on public.measurement_units (name_normalized)
  where is_deleted = false;

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

alter table public.item_categories
  add column if not exists name_normalized text;

alter table public.item_categories
  add column if not exists is_deleted boolean not null default false;

alter table public.item_categories
  add column if not exists deleted_at timestamptz;

alter table public.measurement_units
  add column if not exists name_normalized text;

alter table public.measurement_units
  add column if not exists is_deleted boolean not null default false;

alter table public.measurement_units
  add column if not exists deleted_at timestamptz;

alter table public.measurement_units
  add column if not exists conversion_factor double precision not null default 1;

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

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'stock_items_category_check'
      and conrelid = 'public.stock_items'::regclass
  ) then
    alter table public.stock_items
      drop constraint stock_items_category_check;
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

drop trigger if exists trg_item_categories_updated_at on public.item_categories;
create trigger trg_item_categories_updated_at
before update on public.item_categories
for each row
execute function public.set_updated_at();

drop trigger if exists trg_measurement_units_updated_at on public.measurement_units;
create trigger trg_measurement_units_updated_at
before update on public.measurement_units
for each row
execute function public.set_updated_at();

insert into public.item_categories (id, name, name_normalized, is_deleted)
values
  ('seed-cat-mercearia', 'mercearia', 'mercearia', false),
  ('seed-cat-bebidas', 'bebidas', 'bebidas', false),
  ('seed-cat-bomboniere', 'bomboniere', 'bomboniere', false),
  ('seed-cat-material-limpeza', 'material limpeza', 'material limpeza', false),
  ('seed-cat-material-descartavel', 'material descartavel', 'material descartavel', false)
on conflict (id) do nothing;

insert into public.measurement_units (id, name, name_normalized, conversion_factor, is_deleted)
values
  ('seed-unit-und', 'und', 'und', 1, false),
  ('seed-unit-un', 'un', 'un', 1, false),
  ('seed-unit-unidade', 'unidade', 'unidade', 1, false),
  ('seed-unit-dz', 'dz', 'dz', 12, false),
  ('seed-unit-duzia', 'duzia', 'duzia', 12, false),
  ('seed-unit-mz', 'mz', 'mz', 6, false),
  ('seed-unit-kg', 'kg', 'kg', 1, false),
  ('seed-unit-caixa', 'caixa', 'caixa', 1, false),
  ('seed-unit-pacote', 'pacote', 'pacote', 1, false),
  ('seed-unit-gf', 'gf', 'gf', 1, false)
on conflict (id) do nothing;

insert into public.item_categories (id, name, name_normalized, is_deleted)
select
  'backfill-cat-' || md5(lower(trim(source.category))) as id,
  lower(trim(source.category)) as name,
  lower(trim(source.category)) as name_normalized,
  false
from (
  select distinct category
  from public.stock_items
  where category is not null
    and char_length(trim(category)) > 0
) as source
where not exists (
  select 1
  from public.item_categories ic
  where ic.is_deleted = false
    and ic.name_normalized = lower(trim(source.category))
)
on conflict (id) do nothing;

insert into public.measurement_units (id, name, name_normalized, conversion_factor, is_deleted)
select
  'backfill-unit-' || md5(lower(trim(source.unit))) as id,
  lower(trim(source.unit)) as name,
  lower(trim(source.unit)) as name_normalized,
  case
    when lower(trim(source.unit)) in ('dz', 'duzia') then 12
    when lower(trim(source.unit)) = 'mz' then 6
    when lower(trim(source.unit)) in ('und', 'un', 'unidade') then 1
    else 1
  end as conversion_factor,
  false
from (
  select distinct unit
  from public.stock_items
  where unit is not null
    and char_length(trim(unit)) > 0
) as source
where not exists (
  select 1
  from public.measurement_units mu
  where mu.is_deleted = false
    and mu.name_normalized = lower(trim(source.unit))
)
on conflict (id) do nothing;

update public.measurement_units
set conversion_factor = case
  when name_normalized in ('dz', 'duzia') then 12
  when name_normalized = 'mz' then 6
  when name_normalized in ('und', 'un', 'unidade') then 1
  when conversion_factor is null or conversion_factor <= 0 then 1
  else conversion_factor
end;

alter table public.stock_items disable row level security;
alter table public.app_users disable row level security;
alter table public.daily_stock_entries disable row level security;
alter table public.item_categories disable row level security;
alter table public.measurement_units disable row level security;
