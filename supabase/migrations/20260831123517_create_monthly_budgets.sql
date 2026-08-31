-- Keep budget history stable. budget_settings and budget_allocations remain the
-- reusable default; these tables store the independent snapshot for each month.

create table public.budget_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  base_mode text not null default 'total_income'
    check (base_mode in ('total_income', 'category_income', 'manual')),
  income_category_id uuid,
  manual_amount numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month),
  unique (id, user_id),
  foreign key (income_category_id, user_id)
    references public.categories(id, user_id),
  check (month = date_trunc('month', month)::date),
  check (
    (base_mode = 'total_income' and income_category_id is null and manual_amount is null)
    or (base_mode = 'category_income' and income_category_id is not null and manual_amount is null)
    or (base_mode = 'manual' and income_category_id is null and manual_amount > 0)
  )
);

create table public.budget_month_allocations (
  id uuid primary key default gen_random_uuid(),
  budget_month_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  allocation_mode text not null default 'percentage'
    check (allocation_mode in ('percentage', 'fixed_amount')),
  percentage numeric(5, 2),
  fixed_amount numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_month_id, category_id),
  foreign key (budget_month_id, user_id)
    references public.budget_months(id, user_id) on delete cascade,
  foreign key (category_id, user_id)
    references public.categories(id, user_id),
  check (
    (
      allocation_mode = 'percentage'
      and percentage > 0 and percentage <= 100
      and fixed_amount is null
    )
    or (
      allocation_mode = 'fixed_amount'
      and fixed_amount > 0
      and percentage is null
    )
  )
);

create index budget_months_income_category_user_idx
  on public.budget_months (income_category_id, user_id)
  where income_category_id is not null;

create index budget_month_allocations_user_idx
  on public.budget_month_allocations (user_id);

create index budget_month_allocations_category_user_idx
  on public.budget_month_allocations (category_id, user_id);

create trigger budget_months_validate_category
before insert or update on public.budget_months
for each row execute function public.validate_budget_settings_category();

create trigger budget_month_allocations_validate_category
before insert or update on public.budget_month_allocations
for each row execute function public.validate_budget_allocation_category();

create or replace function public.enforce_budget_month_allocation_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_total numeric(7, 2);
begin
  if new.allocation_mode <> 'percentage' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('budget-month-allocation:' || new.budget_month_id::text, 0)
  );

  select coalesce(sum(percentage), 0)
    into current_total
  from public.budget_month_allocations
  where budget_month_id = new.budget_month_id
    and id <> new.id
    and allocation_mode = 'percentage';

  if current_total + new.percentage > 100 then
    raise exception 'Monthly percentage allocations cannot exceed 100 percent'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger budget_month_allocations_enforce_total
before insert or update on public.budget_month_allocations
for each row execute function public.enforce_budget_month_allocation_total();

create trigger budget_months_set_updated_at
before update on public.budget_months
for each row execute function public.set_updated_at();

create trigger budget_month_allocations_set_updated_at
before update on public.budget_month_allocations
for each row execute function public.set_updated_at();

-- Existing settings become both the reusable default and the current month's
-- first snapshot, so applying this migration does not erase visible data.
insert into public.budget_months (
  user_id, month, base_mode, income_category_id, manual_amount, updated_at
)
select
  user_id,
  date_trunc('month', current_date)::date,
  base_mode,
  income_category_id,
  manual_amount,
  updated_at
from public.budget_settings
on conflict (user_id, month) do nothing;

insert into public.budget_month_allocations (
  budget_month_id, user_id, category_id,
  allocation_mode, percentage, fixed_amount, updated_at
)
select
  bm.id,
  ba.user_id,
  ba.category_id,
  ba.allocation_mode,
  ba.percentage,
  ba.fixed_amount,
  ba.updated_at
from public.budget_allocations ba
join public.budget_months bm
  on bm.user_id = ba.user_id
 and bm.month = date_trunc('month', current_date)::date
on conflict (budget_month_id, category_id) do nothing;

create or replace function public.protect_budget_category_usage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (not new.is_active or new.kind not in ('income', 'both')) and (
    exists (
      select 1 from public.budget_settings
      where user_id = old.user_id and income_category_id = old.id
    )
    or exists (
      select 1 from public.budget_months
      where user_id = old.user_id and income_category_id = old.id
    )
  ) then
    raise exception 'Category is used as a budget income base'
      using errcode = '23514';
  end if;

  if (not new.is_active or new.kind not in ('expense', 'both')) and (
    exists (
      select 1 from public.budget_allocations
      where user_id = old.user_id and category_id = old.id
    )
    or exists (
      select 1 from public.budget_month_allocations
      where user_id = old.user_id and category_id = old.id
    )
  ) then
    raise exception 'Category is used in a budget allocation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter table public.budget_months enable row level security;
alter table public.budget_month_allocations enable row level security;

revoke all on table public.budget_months from anon, authenticated;
revoke all on table public.budget_month_allocations from anon, authenticated;

create policy "Users can view their monthly budgets"
  on public.budget_months for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their monthly budgets"
  on public.budget_months for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their monthly budgets"
  on public.budget_months for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their monthly budgets"
  on public.budget_months for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their monthly allocations"
  on public.budget_month_allocations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their monthly allocations"
  on public.budget_month_allocations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their monthly allocations"
  on public.budget_month_allocations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their monthly allocations"
  on public.budget_month_allocations for delete to authenticated
  using ((select auth.uid()) = user_id);
