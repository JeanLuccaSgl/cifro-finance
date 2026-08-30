-- User-level preferences. These are defaults and product preferences;
-- individual commitments can evolve independently in later iterations.

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_confirm_income boolean not null default false,
  default_due_rule text not null default 'fixed_day',
  default_business_day_number integer not null default 5,
  updated_at timestamptz not null default now(),
  check (default_due_rule in ('fixed_day', 'business_day')),
  check (default_business_day_number between 1 and 31)
);

alter table public.user_settings enable row level security;

create policy "Users can view their settings"
  on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their settings"
  on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their settings"
  on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
