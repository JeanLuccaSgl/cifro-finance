from calendar import monthrange
from datetime import date


def month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def business_day_date(year: int, month: int, ordinal: int) -> date | None:
    """Return the Nth Monday-Saturday day of a month; Sunday is excluded."""
    business_days = 0
    for day in range(1, monthrange(year, month)[1] + 1):
        candidate = date(year, month, day)
        if candidate.weekday() == 6:
            continue
        business_days += 1
        if business_days == ordinal:
            return candidate
    return None


def first_business_occurrence(start: date, ordinal: int) -> date | None:
    """Find the first Nth-business-day occurrence on or after a start date."""
    year, month = start.year, start.month
    for _ in range(24):
        candidate = business_day_date(year, month, ordinal)
        if candidate and candidate >= start:
            return candidate
        year, month = next_month(year, month)
    return None
