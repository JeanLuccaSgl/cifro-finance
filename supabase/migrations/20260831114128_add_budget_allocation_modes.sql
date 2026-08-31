-- Preserve how each allocation was defined. Percentage allocations scale with
-- the monthly base; fixed allocations keep the exact amount chosen by the user.

alter table public.budget_allocations
  add column allocation_mode text not null default 'percentage'
    check (allocation_mode in ('percentage', 'fixed_amount')),
  add column fixed_amount numeric(12, 2);

alter table public.budget_allocations
  alter column percentage drop not null,
  drop constraint if exists budget_allocations_percentage_check;

alter table public.budget_allocations
  add constraint budget_allocations_value_check check (
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
  );

create or replace function public.enforce_budget_allocation_total()
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
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );

  select coalesce(sum(percentage), 0)
    into current_total
  from public.budget_allocations
  where user_id = new.user_id
    and id <> new.id
    and allocation_mode = 'percentage';

  if current_total + new.percentage > 100 then
    raise exception 'Percentage budget allocations cannot exceed 100 percent'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
