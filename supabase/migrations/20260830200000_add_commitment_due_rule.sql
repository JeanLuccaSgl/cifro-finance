-- Allow recurring commitments to use a fixed calendar day or an ordinal
-- business day. Cifro considers Monday through Saturday business days;
-- Sunday is not counted. Holiday calendars are intentionally out of scope
-- for this first version.

alter table public.commitments
  add column due_rule text not null default 'fixed_day',
  add column business_day_number integer;

alter table public.commitments
  add constraint commitments_due_rule_check
  check (due_rule in ('fixed_day', 'business_day'));

alter table public.commitments
  add constraint commitments_business_day_number_check
  check (
    (due_rule = 'fixed_day' and business_day_number is null)
    or (due_rule = 'business_day' and business_day_number between 1 and 31)
  );
