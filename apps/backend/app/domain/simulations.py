from decimal import Decimal
from uuid import UUID


def calculate_simulation_totals(items: list[dict]) -> dict:
    """Calculate a hypothetical scenario without touching real finances."""
    total_income = Decimal("0.00")
    total_expenses = Decimal("0.00")
    by_category: dict[UUID | None, dict] = {}

    for item in items:
        amount = item["amount"]
        if item["direction"] == "income":
            total_income += amount
            continue

        total_expenses += amount
        category_id = item["category_id"]
        bucket = by_category.setdefault(
            category_id,
            {
                "category_id": category_id,
                "category_name": item["category_name"] or "Sem categoria",
                "amount": Decimal("0.00"),
            },
        )
        bucket["amount"] += amount

    categories = sorted(
        by_category.values(),
        key=lambda row: (-row["amount"], row["category_name"].lower()),
    )
    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "final_balance": total_income - total_expenses,
        "expenses_by_category": categories,
    }
