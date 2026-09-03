-- Saved hypothetical scenarios stay separate from real transactions and
-- planning commitments. Categories are only labels inside a simulation.
create table public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  reference text check (reference is null or char_length(trim(reference)) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.simulation_items (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  description text not null check (char_length(trim(description)) between 1 and 160),
  direction text not null check (direction in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  category_id uuid,
  source text not null default 'manual' check (source in ('manual', 'planning')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (simulation_id, user_id)
    references public.simulations(id, user_id)
    on delete cascade,
  foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete set null (category_id)
);

create index simulations_user_updated_idx
  on public.simulations (user_id, updated_at desc);

create index simulation_items_simulation_position_idx
  on public.simulation_items (simulation_id, user_id, position);

create or replace function public.validate_simulation_item_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1
    from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and is_active = true
  ) then
    raise exception 'Simulation items must use an active category'
      using errcode = '23514',
            detail = 'simulation_category_inactive';
  end if;
  return new;
end;
$$;

create trigger simulation_items_validate_category
before insert or update of category_id, user_id
on public.simulation_items
for each row execute function public.validate_simulation_item_category();

create trigger simulations_set_updated_at
before update on public.simulations
for each row execute function public.set_updated_at();

create trigger simulation_items_set_updated_at
before update on public.simulation_items
for each row execute function public.set_updated_at();

alter table public.simulations enable row level security;
alter table public.simulation_items enable row level security;

create policy "Users can view their simulations"
  on public.simulations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their simulations"
  on public.simulations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their simulations"
  on public.simulations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their simulations"
  on public.simulations for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their simulation items"
  on public.simulation_items for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their simulation items"
  on public.simulation_items for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their simulation items"
  on public.simulation_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their simulation items"
  on public.simulation_items for delete to authenticated
  using ((select auth.uid()) = user_id);
