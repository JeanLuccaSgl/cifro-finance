from decimal import Decimal


MONEY = Decimal("0.01")


def as_money(value: Decimal | None) -> Decimal:
    return value or Decimal("0.00")


def calculate_allocation(
    base_amount: Decimal,
    allocation_mode: str,
    percentage: Decimal | None,
    fixed_amount: Decimal | None,
    actual_amount: Decimal | None = None,
) -> dict[str, Decimal | None]:
    """Calculate one allocation without enforcing a total budget limit."""
    mode = getattr(allocation_mode, "value", allocation_mode)
    if mode == "fixed_amount":
        normalized_fixed = as_money(fixed_amount)
        target_amount = normalized_fixed
        calculated_percentage = (
            (target_amount * Decimal("100") / base_amount).quantize(MONEY)
            if base_amount > 0
            else Decimal("0.00")
        )
    else:
        normalized_fixed = None
        calculated_percentage = Decimal(percentage or 0)
        target_amount = (base_amount * calculated_percentage / Decimal("100")).quantize(MONEY)

    actual = as_money(actual_amount)
    return {
        "percentage": calculated_percentage,
        "fixed_amount": normalized_fixed,
        "target_amount": target_amount,
        "actual_amount": actual,
        "remaining_amount": target_amount - actual,
    }
