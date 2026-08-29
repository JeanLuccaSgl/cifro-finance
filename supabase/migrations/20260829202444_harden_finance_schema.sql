-- Keep the timestamp trigger independent from a mutable search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- Cover the composite foreign keys used to enforce same-user relationships.
create index commitments_category_user_idx
  on public.commitments (category_id, user_id);

create index transactions_category_user_idx
  on public.transactions (category_id, user_id);

create index transactions_commitment_user_idx
  on public.transactions (commitment_id, user_id);
