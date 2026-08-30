-- A commitment can produce only one transaction for each scheduled date.
-- This protects the daily processor from duplicate occurrences if it runs twice.
create unique index if not exists transactions_commitment_occurred_on_key
  on public.transactions (commitment_id, occurred_on)
  where commitment_id is not null;
