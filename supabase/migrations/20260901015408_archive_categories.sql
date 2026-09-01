-- Categories are archived instead of physically deleted. This keeps old
-- transactions, commitments, and budget snapshots referentially meaningful.

drop index if exists public.categories_user_name_key;

create unique index categories_user_name_active_key
  on public.categories (user_id, lower(trim(name)))
  where is_active = true;

-- Archiving a category must remain possible even when it appears in an old
-- budget snapshot. Changing its kind, however, cannot invalidate a budget
-- base or allocation that still references it.
create or replace function public.protect_budget_category_usage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind not in ('income', 'both') and (
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

  if new.kind not in ('expense', 'both') and (
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
