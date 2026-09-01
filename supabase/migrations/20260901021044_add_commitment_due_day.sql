-- Keep the billing day and yearly billing month independent from the start
-- date. Existing commitments use their current next occurrence as the safest
-- historical value.

alter table public.commitments
  add column due_day integer,
  add column due_month integer;

update public.commitments
set due_day = extract(day from next_due_on)::integer
where due_rule = 'fixed_day';

update public.commitments
set due_month = extract(month from next_due_on)::integer
where frequency = 'yearly';

alter table public.commitments
  add constraint commitments_due_day_check
  check (
    (due_rule = 'fixed_day' and due_day between 1 and 31)
    or (due_rule = 'business_day' and due_day is null)
  );

alter table public.commitments
  add constraint commitments_due_month_check
  check (
    (frequency = 'yearly' and due_month between 1 and 12)
    or (frequency = 'monthly' and due_month is null)
  );
