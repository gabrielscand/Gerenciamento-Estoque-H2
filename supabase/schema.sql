create table if not exists public.stock_items (
  id text primary key,
  name text not null check (char_length(trim(name)) > 0),
  unit text not null check (char_length(trim(unit)) > 0),
  min_quantity double precision not null check (min_quantity >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_stock_entries (
  id text primary key,
  item_id text not null references public.stock_items(id) on delete cascade,
  date date not null,
  quantity double precision not null check (quantity >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (item_id, date)
);

create index if not exists idx_daily_stock_entries_date
  on public.daily_stock_entries (date);

create index if not exists idx_daily_stock_entries_item_id
  on public.daily_stock_entries (item_id);

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
