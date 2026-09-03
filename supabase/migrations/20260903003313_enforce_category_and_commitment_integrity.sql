-- Preserve the meaning of a category once it participates in any financial
-- relation. Archiving remains allowed; changing kind would reinterpret history.
create or replace function public.protect_budget_category_usage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is not distinct from old.kind then
    return new;
  end if;

  if exists (
    select 1 from public.transactions
    where category_id = old.id and user_id = old.user_id
  ) or exists (
    select 1 from public.commitments
    where category_id = old.id and user_id = old.user_id
  ) or exists (
    select 1 from public.budget_settings
    where income_category_id = old.id and user_id = old.user_id
  ) or exists (
    select 1 from public.budget_allocations
    where category_id = old.id and user_id = old.user_id
  ) or exists (
    select 1 from public.budget_months
    where income_category_id = old.id and user_id = old.user_id
  ) or exists (
    select 1 from public.budget_month_allocations
    where category_id = old.id and user_id = old.user_id
  ) then
    raise exception 'Category kind cannot be changed after use'
      using errcode = '23514',
            detail = 'category_kind_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists categories_protect_budget_usage on public.categories;
create trigger categories_protect_budget_usage
before update of kind on public.categories
for each row execute function public.protect_budget_category_usage();

-- Keep a linked transaction semantically aligned with its commitment. The
-- IS DISTINCT FROM comparison deliberately treats NULL and a UUID as different.
create or replace function public.validate_transaction_commitment_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_commitment record;
begin
  if new.commitment_id is null then
    return new;
  end if;

  select user_id, category_id, direction
    into linked_commitment
  from public.commitments
  where id = new.commitment_id;

  if not found or linked_commitment.user_id is distinct from new.user_id then
    raise exception 'Linked commitment does not belong to the transaction user'
      using errcode = '23514',
            detail = 'commitment_user_mismatch';
  end if;

  if linked_commitment.direction is distinct from new.direction then
    raise exception 'Transaction direction must match its commitment'
      using errcode = '23514',
            detail = 'commitment_direction_mismatch';
  end if;

  if linked_commitment.category_id is distinct from new.category_id then
    raise exception 'Transaction category must match its commitment category'
      using errcode = '23514',
            detail = 'commitment_category_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_validate_commitment_category on public.transactions;
create trigger transactions_validate_commitment_category
before insert or update of user_id, commitment_id, category_id, direction
on public.transactions
for each row execute function public.validate_transaction_commitment_category();

-- A commitment cannot be changed to a category that disagrees with one of its
-- already-created occurrences. This keeps historical transactions coherent.
create or replace function public.validate_commitment_transaction_categories()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.transactions
    where commitment_id = new.id
      and user_id = new.user_id
      and category_id is distinct from new.category_id
  ) then
    raise exception 'Commitment category must match its linked transactions'
      using errcode = '23514',
            detail = 'commitment_category_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists commitments_validate_transaction_category on public.commitments;
create trigger commitments_validate_transaction_category
before update of category_id on public.commitments
for each row execute function public.validate_commitment_transaction_categories();
