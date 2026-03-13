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

create table if not exists public.daily_stock_entries (
  id text primary key,
  item_id text not null references public.stock_items(id) on delete cascade,
  date date not null,
  quantity double precision not null check (quantity >= 0),
  movement_type text check (
    movement_type is null
    or movement_type in ('initial', 'consumption', 'legacy_snapshot')
  ),
  stock_after_quantity double precision check (stock_after_quantity is null or stock_after_quantity >= 0),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (item_id, date)
);

create index if not exists idx_daily_stock_entries_date
  on public.daily_stock_entries (date);

create index if not exists idx_daily_stock_entries_item_id
  on public.daily_stock_entries (item_id);

create index if not exists idx_daily_stock_entries_is_deleted
  on public.daily_stock_entries (is_deleted);

create index if not exists idx_stock_items_is_deleted
  on public.stock_items (is_deleted);

alter table public.stock_items
  add column if not exists is_deleted boolean not null default false;

alter table public.stock_items
  add column if not exists deleted_at timestamptz;

alter table public.stock_items
  add column if not exists category text;

alter table public.stock_items
  add column if not exists current_stock_quantity double precision;

alter table public.daily_stock_entries
  add column if not exists is_deleted boolean not null default false;

alter table public.daily_stock_entries
  add column if not exists deleted_at timestamptz;

alter table public.daily_stock_entries
  add column if not exists movement_type text;

alter table public.daily_stock_entries
  add column if not exists stock_after_quantity double precision;

create index if not exists idx_stock_items_category
  on public.stock_items (category);

create or replace view public.stock_items_active as
select *
from public.stock_items
where is_deleted = false;

create or replace view public.stock_items_archived as
select *
from public.stock_items
where is_deleted = true;

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

drop trigger if exists trg_daily_stock_entries_updated_at on public.daily_stock_entries;
create trigger trg_daily_stock_entries_updated_at
before update on public.daily_stock_entries
for each row
execute function public.set_updated_at();

alter table public.stock_items disable row level security;
alter table public.daily_stock_entries disable row level security;
