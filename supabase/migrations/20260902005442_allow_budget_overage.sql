-- Budget allocations may intentionally exceed the current base. The API and
-- UI expose the excess as a visible warning instead of rejecting the save.
-- Each individual percentage remains limited to 100 by the table check.

drop trigger if exists budget_allocations_enforce_total on public.budget_allocations;
drop function if exists public.enforce_budget_allocation_total();

drop trigger if exists budget_month_allocations_enforce_total on public.budget_month_allocations;
drop function if exists public.enforce_budget_month_allocation_total();
