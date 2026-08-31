-- User-defined monthly distribution. A user chooses the income base and then
-- allocates up to 100% of it across their own expense categories.

create table public.budget_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  base_mode text not null default 'total_income'
    check (base_mode in ('total_income', 'category_income', 'manual')),
  income_category_id uuid,
  manual_amount numeric(12, 2),
  updated_at timestamptz not null default now(),
  foreign key (income_category_id, user_id)
    references public.categories(id, user_id)
    on delete cascade,
  check (
    (base_mode = 'total_income' and income_category_id is null and manual_amount is null)
    or (base_mode = 'category_income' and income_category_id is not null and manual_amount is null)
    or (base_mode = 'manual' and income_category_id is null and manual_amount > 0)
  )
);

create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  percentage numeric(5, 2) not null check (percentage > 0 and percentage <= 100),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id),
  foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete cascade
);

create or replace function public.validate_budget_settings_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.base_mode = 'category_income' and not exists (
    select 1
    from public.categories
    where id = new.income_category_id
      and user_id = new.user_id
      and is_active = true
      and kind in ('income', 'both')
  ) then
    raise exception 'Income base must use an active income category'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger budget_settings_validate_category
before insert or update on public.budget_settings
for each row execute function public.validate_budget_settings_category();

create or replace function public.validate_budget_allocation_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.categories
    where id = new.category_id
      and user_id = new.user_id
      and is_active = true
      and kind in ('expense', 'both')
  ) then
    raise exception 'Allocation must use an active expense category'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger budget_allocations_validate_category
before insert or update on public.budget_allocations
for each row execute function public.validate_budget_allocation_category();

create or replace function public.enforce_budget_allocation_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_total numeric(7, 2);
begin
  -- Serialize writes per user so simultaneous requests cannot both pass the
  -- 100% check with a stale total.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  select coalesce(sum(percentage), 0)
    into current_total
  from public.budget_allocations
  where user_id = new.user_id
    and id <> new.id;

  if current_total + new.percentage > 100 then
    raise exception 'Budget allocations cannot exceed 100 percent'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger budget_allocations_enforce_total
before insert or update on public.budget_allocations
for each row execute function public.enforce_budget_allocation_total();

create or replace function public.protect_budget_category_usage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (not new.is_active or new.kind not in ('income', 'both')) and exists (
    select 1
    from public.budget_settings
    where user_id = old.user_id and income_category_id = old.id
  ) then
    raise exception 'Category is used as the budget income base'
      using errcode = '23514';
  end if;

  if (not new.is_active or new.kind not in ('expense', 'both')) and exists (
    select 1
    from public.budget_allocations
    where user_id = old.user_id and category_id = old.id
  ) then
    raise exception 'Category is used in a budget allocation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger categories_protect_budget_usage
before update of kind, is_active on public.categories
for each row execute function public.protect_budget_category_usage();

create trigger budget_settings_set_updated_at
before update on public.budget_settings
for each row execute function public.set_updated_at();

create trigger budget_allocations_set_updated_at
before update on public.budget_allocations
for each row execute function public.set_updated_at();

alter table public.budget_settings enable row level security;
alter table public.budget_allocations enable row level security;

-- The web app reaches these tables only through the authenticated FastAPI
-- backend. Keep direct browser/Data API access closed by default; RLS remains
-- as defense in depth if grants are intentionally added in the future.
revoke all on table public.budget_settings from anon, authenticated;
revoke all on table public.budget_allocations from anon, authenticated;

create policy "Users can view their budget settings"
  on public.budget_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their budget settings"
  on public.budget_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their budget settings"
  on public.budget_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can view their budget allocations"
  on public.budget_allocations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their budget allocations"
  on public.budget_allocations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their budget allocations"
  on public.budget_allocations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their budget allocations"
  on public.budget_allocations for delete to authenticated
  using ((select auth.uid()) = user_id);
