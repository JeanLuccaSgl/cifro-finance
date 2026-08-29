-- Cifro: first finance schema
-- Categories describe what a movement is. Commitments describe how it repeats
-- or affects a future month; they are intentionally separate concepts.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind text not null check (kind in ('income', 'expense', 'both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index categories_user_name_key
  on public.categories (user_id, lower(trim(name)));

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 120),
  commitment_type text not null check (commitment_type in ('subscription', 'installment', 'recurring')),
  direction text not null check (direction in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  frequency text not null check (frequency in ('monthly', 'yearly')),
  starts_on date not null,
  next_due_on date not null,
  ends_on date,
  total_installments integer,
  current_installment integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete set null (category_id),
  check (ends_on is null or ends_on >= starts_on),
  check (
    commitment_type = 'installment'
    or (total_installments is null and current_installment is null)
  ),
  check (
    commitment_type <> 'installment'
    or (
      total_installments is not null
      and total_installments > 0
      and current_installment is not null
      and current_installment between 1 and total_installments
    )
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  commitment_id uuid,
  description text not null check (char_length(trim(description)) between 1 and 160),
  amount numeric(12, 2) not null check (amount > 0),
  direction text not null check (direction in ('income', 'expense')),
  occurred_on date not null,
  status text not null default 'completed' check (status in ('completed', 'planned')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, user_id)
    references public.categories(id, user_id)
    on delete set null (category_id),
  foreign key (commitment_id, user_id)
    references public.commitments(id, user_id)
    on delete set null (commitment_id)
);

create index transactions_user_occurred_on_idx
  on public.transactions (user_id, occurred_on desc);

create index commitments_user_next_due_on_idx
  on public.commitments (user_id, next_due_on)
  where is_active = true;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.commitments enable row level security;
alter table public.transactions enable row level security;

create policy "Users can view their categories"
  on public.categories for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their categories"
  on public.categories for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their categories"
  on public.categories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their categories"
  on public.categories for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their commitments"
  on public.commitments for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their commitments"
  on public.commitments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their commitments"
  on public.commitments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their commitments"
  on public.commitments for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their transactions"
  on public.transactions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their transactions"
  on public.transactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their transactions"
  on public.transactions for delete to authenticated
  using ((select auth.uid()) = user_id);
