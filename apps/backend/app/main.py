from calendar import monthrange
from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

import psycopg
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from psycopg.errors import UniqueViolation

from .config import settings
from .db import get_connection
from .schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    CommitmentCreate,
    CommitmentRead,
    CommitmentRecordCreate,
    CommitmentRecordResult,
    CommitmentPreview,
    CommitmentUpdate,
    DashboardPeriod,
    DashboardRead,
    Direction,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    UserSettingsRead,
    UserSettingsUpdate,
)
from .security import current_user_id


app = FastAPI(
    title="Cifro API",
    version="0.1.0",
    description="API pessoal do gerenciador financeiro Cifro.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

router = APIRouter(
    prefix="/api/v1",
)


def month_bounds(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
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


def as_money(value: Decimal | None) -> Decimal:
    return value or Decimal("0.00")


def projected_commitment_date(row: dict, year: int, month: int) -> date | None:
    """Return the occurrence of a commitment inside the requested month.

    Recurring commitments are rules, not duplicated transaction rows. Their
    stored due date supplies the billing day, while the dashboard projects the
    next occurrence into the selected month.
    """
    baseline = row["next_due_on"]
    target_start, _ = month_bounds(year, month)
    baseline_start, _ = month_bounds(baseline.year, baseline.month)
    if target_start < baseline_start:
        return None

    if row["commitment_type"] == "installment":
        return baseline if baseline.year == year and baseline.month == month else None

    if row["frequency"] == "monthly":
        if row["due_rule"] == "business_day":
            projected = business_day_date(year, month, row["business_day_number"])
        else:
            day = min(baseline.day, monthrange(year, month)[1])
            projected = date(year, month, day)
    elif row["frequency"] == "yearly":
        if baseline.month != month:
            return None
        if row["due_rule"] == "business_day":
            projected = business_day_date(year, month, row["business_day_number"])
        else:
            day = min(baseline.day, monthrange(year, month)[1])
            projected = date(year, month, day)
    else:
        return None

    if projected is None:
        return None
    if projected < row["starts_on"]:
        return None
    if row["ends_on"] and projected > row["ends_on"]:
        return None
    return projected


def next_projected_commitment_date(row: dict, from_date: date) -> date | None:
    """Find the next visible occurrence without creating future transactions."""
    if row["commitment_type"] == "installment":
        return row["next_due_on"] if row["next_due_on"] >= from_date else None

    year, month = from_date.year, from_date.month
    for _ in range(24):
        projected = projected_commitment_date(row, year, month)
        if projected and projected >= from_date:
            return projected
        year, month = next_month(year, month)
    return None


def next_commitment_due_date(row: dict) -> date | None:
    """Advance a commitment one occurrence after its stored due date."""
    current = row["next_due_on"]
    if row["frequency"] == "monthly":
        year, month = next_month(current.year, current.month)
        if row["due_rule"] == "business_day":
            return business_day_date(year, month, row["business_day_number"])
        return date(year, month, min(row["starts_on"].day, monthrange(year, month)[1]))

    if row["frequency"] == "yearly":
        year = current.year + 1
        if row["due_rule"] == "business_day":
            return business_day_date(year, current.month, row["business_day_number"])
        return date(year, current.month, min(row["starts_on"].day, monthrange(year, current.month)[1]))

    return None


COMMITMENT_COLUMNS = """
  c.id, c.user_id, c.category_id, c.name, c.commitment_type, c.direction,
  c.amount, c.frequency, c.due_rule, c.business_day_number, c.starts_on,
  c.next_due_on, c.ends_on, c.total_installments, c.current_installment,
  c.is_active, c.created_at
"""


def process_due_commitments(connection, today: date | None = None) -> int:
    """Create today's due occurrences once and advance their schedules.

    This intentionally does not backfill every missed month. If the service was
    offline, the next run creates the current occurrence instead of inventing a
    large historical block of salary or expenses.
    """
    today = today or date.today()
    rows = connection.execute(
        f"""
        select {COMMITMENT_COLUMNS},
          coalesce(us.auto_confirm_income, false) as auto_confirm_income
        from public.commitments c
        left join public.user_settings us on us.user_id = c.user_id
        where c.is_active = true
        order by c.user_id, c.next_due_on, c.name
        for update of c
        """
    ).fetchall()
    processed = 0

    for commitment in rows:
        if commitment["commitment_type"] == "installment":
            occurrence_on = commitment["next_due_on"]
        else:
            occurrence_on = projected_commitment_date(commitment, today.year, today.month)

        if occurrence_on is None or occurrence_on > today:
            continue

        existing = connection.execute(
            """
            select id
            from public.transactions
            where commitment_id = %s and user_id = %s and occurred_on = %s
            limit 1
            """,
            (commitment["id"], commitment["user_id"], occurrence_on),
        ).fetchone()
        if existing:
            continue

        transaction_status = (
            "completed"
            if commitment["direction"] == Direction.INCOME and commitment["auto_confirm_income"]
            else "planned"
        )
        connection.execute(
            """
            insert into public.transactions (
              user_id, category_id, commitment_id, description, amount,
              direction, occurred_on, status, notes
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                commitment["user_id"],
                commitment["category_id"],
                commitment["id"],
                commitment["name"],
                commitment["amount"],
                commitment["direction"],
                occurrence_on,
                transaction_status,
                "Gerado a partir do planejamento",
            ),
        )

        commitment_for_advance = dict(commitment)
        commitment_for_advance["next_due_on"] = occurrence_on
        next_due_on = next_commitment_due_date(commitment_for_advance)
        is_installment = commitment["commitment_type"] == "installment"
        current_installment = commitment["current_installment"]
        if is_installment and current_installment >= commitment["total_installments"]:
            is_active = False
        else:
            is_active = next_due_on is not None and not (
                commitment["ends_on"] and next_due_on > commitment["ends_on"]
            )
        if is_installment and is_active:
            current_installment += 1

        connection.execute(
            """
            update public.commitments
            set next_due_on = %s, current_installment = %s, is_active = %s
            where id = %s and user_id = %s
            """,
            (
                next_due_on or commitment["next_due_on"],
                current_installment,
                is_active,
                commitment["id"],
                commitment["user_id"],
            ),
        )
        processed += 1

    return processed


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cifro-api"}


@router.get("/settings", response_model=UserSettingsRead)
def get_user_settings(user_id: UUID = Depends(current_user_id)) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            """
            select auto_confirm_income, default_due_rule,
              default_business_day_number, updated_at
            from public.user_settings
            where user_id = %s
            """,
            (user_id,),
        ).fetchone()
        if not row:
            row = connection.execute(
                """
                insert into public.user_settings (user_id)
                values (%s)
                returning auto_confirm_income, default_due_rule,
                  default_business_day_number, updated_at
                """,
                (user_id,),
            ).fetchone()
    return row


@router.patch("/settings", response_model=UserSettingsRead)
def update_user_settings(
    payload: UserSettingsUpdate,
    user_id: UUID = Depends(current_user_id),
) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            """
            insert into public.user_settings (
              user_id, auto_confirm_income, default_due_rule,
              default_business_day_number, updated_at
            )
            values (%s, %s, %s, %s, now())
            on conflict (user_id) do update set
              auto_confirm_income = excluded.auto_confirm_income,
              default_due_rule = excluded.default_due_rule,
              default_business_day_number = excluded.default_business_day_number,
              updated_at = now()
            returning auto_confirm_income, default_due_rule,
              default_business_day_number, updated_at
            """,
            (
                user_id,
                payload.auto_confirm_income,
                payload.default_due_rule.value,
                payload.default_business_day_number,
            ),
        ).fetchone()
    return row


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(user_id: UUID = Depends(current_user_id)) -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            select id, name, kind, is_active, created_at
            from public.categories
            where user_id = %s and is_active = true
            order by name asc
            """,
            (user_id,),
        ).fetchall()
    return list(rows)


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, user_id: UUID = Depends(current_user_id)) -> dict:
    try:
        with get_connection() as connection:
            return connection.execute(
                """
                insert into public.categories (user_id, name, kind)
                values (%s, %s, %s)
                returning id, name, kind, is_active, created_at
                """,
                (user_id, payload.name.strip(), payload.kind.value),
            ).fetchone()
    except UniqueViolation as error:
        raise HTTPException(status_code=409, detail="Category already exists") from error


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: UUID,
    payload: CategoryUpdate,
    user_id: UUID = Depends(current_user_id),
) -> dict:
    try:
        with get_connection() as connection:
            row = connection.execute(
                """
                update public.categories
                set name = %s, kind = %s
                where id = %s and user_id = %s and is_active = true
                returning id, name, kind, is_active, created_at
                """,
                (payload.name.strip(), payload.kind.value, category_id, user_id),
            ).fetchone()
    except UniqueViolation as error:
        raise HTTPException(status_code=409, detail="Category already exists") from error

    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    return row


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: UUID, user_id: UUID = Depends(current_user_id)) -> None:
    with get_connection() as connection:
        row = connection.execute(
            """
            delete from public.categories
            where id = %s and user_id = %s
            returning id
            """,
            (category_id, user_id),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Category not found")


def category_for_commitment(connection, category_id: UUID | None, user_id: UUID) -> str | None:
    if not category_id:
        return None

    category = connection.execute(
        """
        select name
        from public.categories
        where id = %s and user_id = %s and is_active = true
        """,
        (category_id, user_id),
    ).fetchone()
    if not category:
        raise HTTPException(status_code=400, detail="Category not found")
    return category["name"]


@router.get("/commitments", response_model=list[CommitmentRead])
def list_commitments(user_id: UUID = Depends(current_user_id)) -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            select
              c.id, c.name, c.commitment_type, c.direction, c.amount,
              c.frequency, c.due_rule, c.business_day_number,
              c.starts_on, c.next_due_on, c.ends_on,
              c.category_id, c.total_installments, c.current_installment,
              c.is_active, c.created_at, cat.name as category_name
            from public.commitments c
            left join public.categories cat
              on cat.id = c.category_id and cat.user_id = c.user_id
            where c.user_id = %s and c.is_active = true
            order by c.next_due_on asc, c.name asc
            """,
            (user_id,),
        ).fetchall()
    commitments = []
    for row in rows:
        projected_date = next_projected_commitment_date(row, date.today())
        if projected_date is None and row["commitment_type"] == "installment":
            projected_date = row["next_due_on"]
        if projected_date is None:
            continue
        projected = dict(row)
        projected["next_due_on"] = projected_date
        commitments.append(projected)
    commitments.sort(key=lambda row: (row["next_due_on"], row["name"].lower()))
    return commitments


@router.post("/commitments", response_model=CommitmentRead, status_code=status.HTTP_201_CREATED)
def create_commitment(payload: CommitmentCreate, user_id: UUID = Depends(current_user_id)) -> dict:
    next_due_on = payload.next_due_on
    if next_due_on is None:
        next_due_on = first_business_occurrence(payload.starts_on, payload.business_day_number)
        if next_due_on is None:
            raise HTTPException(status_code=400, detail="Could not calculate the business-day occurrence")

    with get_connection() as connection:
        category_name = category_for_commitment(connection, payload.category_id, user_id)
        row = connection.execute(
            """
            insert into public.commitments (
              user_id, category_id, name, commitment_type, direction, amount,
              frequency, due_rule, business_day_number,
              starts_on, next_due_on, ends_on,
              total_installments, current_installment
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            returning id, name, commitment_type, direction, amount, frequency,
              due_rule, business_day_number, starts_on, next_due_on, ends_on, category_id,
              total_installments, current_installment, is_active, created_at
            """,
            (
                user_id,
                payload.category_id,
                payload.name.strip(),
                payload.commitment_type.value,
                payload.direction.value,
                payload.amount,
                payload.frequency.value,
                payload.due_rule.value,
                payload.business_day_number,
                payload.starts_on,
                next_due_on,
                payload.ends_on,
                payload.total_installments,
                payload.current_installment,
            ),
        ).fetchone()
    row["category_name"] = category_name
    return row


@router.patch("/commitments/{commitment_id}", response_model=CommitmentRead)
def update_commitment(
    commitment_id: UUID,
    payload: CommitmentUpdate,
    user_id: UUID = Depends(current_user_id),
) -> dict:
    next_due_on = payload.next_due_on
    if next_due_on is None:
        next_due_on = first_business_occurrence(payload.starts_on, payload.business_day_number)
        if next_due_on is None:
            raise HTTPException(status_code=400, detail="Could not calculate the business-day occurrence")

    with get_connection() as connection:
        category_name = category_for_commitment(connection, payload.category_id, user_id)
        row = connection.execute(
            """
            update public.commitments
            set category_id = %s, name = %s, commitment_type = %s,
                direction = %s, amount = %s, frequency = %s,
                due_rule = %s, business_day_number = %s,
                starts_on = %s, next_due_on = %s, ends_on = %s,
                total_installments = %s, current_installment = %s
            where id = %s and user_id = %s and is_active = true
            returning id, name, commitment_type, direction, amount, frequency,
              due_rule, business_day_number, starts_on, next_due_on, ends_on, category_id,
              total_installments, current_installment, is_active, created_at
            """,
            (
                payload.category_id,
                payload.name.strip(),
                payload.commitment_type.value,
                payload.direction.value,
                payload.amount,
                payload.frequency.value,
                payload.due_rule.value,
                payload.business_day_number,
                payload.starts_on,
                next_due_on,
                payload.ends_on,
                payload.total_installments,
                payload.current_installment,
                commitment_id,
                user_id,
            ),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Commitment not found")
    row["category_name"] = category_name
    return row


@router.post("/commitments/{commitment_id}/record", response_model=CommitmentRecordResult)
def record_commitment(
    commitment_id: UUID,
    payload: CommitmentRecordCreate,
    user_id: UUID = Depends(current_user_id),
) -> dict:
    with get_connection() as connection:
        commitment = connection.execute(
            """
            select
              id, user_id, category_id, name, commitment_type, direction, amount,
              frequency, due_rule, business_day_number, starts_on, next_due_on,
              ends_on, total_installments, current_installment, is_active, created_at
            from public.commitments
            where id = %s and user_id = %s and is_active = true
            for update
            """,
            (commitment_id, user_id),
        ).fetchone()

        if not commitment:
            raise HTTPException(status_code=404, detail="Commitment not found")

        pending_transaction = connection.execute(
            """
            select id, description, amount, direction, occurred_on,
              category_id, commitment_id, status, notes, created_at, updated_at
            from public.transactions
            where commitment_id = %s and user_id = %s and status = 'planned'
            order by occurred_on asc, created_at asc
            limit 1
            """,
            (commitment_id, user_id),
        ).fetchone()
        if pending_transaction:
            confirmed_transaction = connection.execute(
                """
                update public.transactions
                set status = 'completed'
                where id = %s and user_id = %s
                returning id, description, amount, direction, occurred_on,
                  category_id, commitment_id, status, notes, created_at, updated_at
                """,
                (pending_transaction["id"], user_id),
            ).fetchone()
            category_name = None
            if commitment["category_id"]:
                category = connection.execute(
                    """
                    select name
                    from public.categories
                    where id = %s and user_id = %s
                    """,
                    (commitment["category_id"], user_id),
                ).fetchone()
                category_name = category["name"] if category else None

            updated_commitment = dict(commitment)
            updated_commitment["category_name"] = category_name
            confirmed_transaction["category_name"] = category_name
            return {"transaction": confirmed_transaction, "commitment": updated_commitment}

        scheduled_due_on = next_projected_commitment_date(commitment, date.today())
        if scheduled_due_on is None or commitment["commitment_type"] == "installment":
            scheduled_due_on = commitment["next_due_on"]
        occurrence_on = payload.occurred_on or scheduled_due_on
        duplicate = connection.execute(
            """
            select id
            from public.transactions
            where commitment_id = %s and user_id = %s
              and occurred_on = %s and status = 'completed'
            limit 1
            """,
            (commitment_id, user_id, occurrence_on),
        ).fetchone()
        if duplicate:
            raise HTTPException(status_code=409, detail="This commitment occurrence is already recorded")

        transaction = connection.execute(
            """
            insert into public.transactions (
              user_id, category_id, commitment_id, description, amount,
              direction, occurred_on, status, notes
            )
            values (%s, %s, %s, %s, %s, %s, %s, 'completed', %s)
            returning id, description, amount, direction, occurred_on,
              category_id, commitment_id, status, notes, created_at, updated_at
            """,
            (
                user_id,
                commitment["category_id"],
                commitment_id,
                commitment["name"],
                commitment["amount"],
                commitment["direction"],
                occurrence_on,
                "Registrado a partir do planejamento",
            ),
        ).fetchone()

        commitment_for_advance = dict(commitment)
        commitment_for_advance["next_due_on"] = scheduled_due_on
        next_due_on = next_commitment_due_date(commitment_for_advance)
        is_installment = commitment["commitment_type"] == "installment"
        current_installment = commitment["current_installment"]
        if is_installment and current_installment >= commitment["total_installments"]:
            is_active = False
        else:
            is_active = next_due_on is not None and not (
                commitment["ends_on"] and next_due_on > commitment["ends_on"]
            )

        if is_installment and is_active:
            current_installment += 1

        updated_commitment = connection.execute(
            """
            update public.commitments
            set next_due_on = %s, current_installment = %s, is_active = %s
            where id = %s and user_id = %s
            returning id, name, commitment_type, direction, amount, frequency,
              due_rule, business_day_number, starts_on, next_due_on, ends_on,
              category_id, total_installments, current_installment,
              is_active, created_at
            """,
            (
                next_due_on or commitment["next_due_on"],
                current_installment,
                is_active,
                commitment_id,
                user_id,
            ),
        ).fetchone()

        category_name = None
        if commitment["category_id"]:
            category = connection.execute(
                """
                select name
                from public.categories
                where id = %s and user_id = %s
                """,
                (commitment["category_id"], user_id),
            ).fetchone()
            category_name = category["name"] if category else None

    transaction["category_name"] = category_name
    updated_commitment["category_name"] = category_name
    return {"transaction": transaction, "commitment": updated_commitment}


@router.delete("/commitments/{commitment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_commitment(commitment_id: UUID, user_id: UUID = Depends(current_user_id)) -> None:
    with get_connection() as connection:
        row = connection.execute(
            """
            delete from public.commitments
            where id = %s and user_id = %s
            returning id
            """,
            (commitment_id, user_id),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Commitment not found")


@router.get("/transactions", response_model=list[TransactionRead])
def list_transactions(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    user_id: UUID = Depends(current_user_id),
) -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            select
              t.id, t.description, t.amount, t.direction, t.occurred_on,
              t.category_id, t.commitment_id, t.status, t.notes,
              t.created_at, t.updated_at, c.name as category_name
            from public.transactions t
            left join public.categories c
              on c.id = t.category_id and c.user_id = t.user_id
            where t.user_id = %s
            order by t.occurred_on desc, t.created_at desc
            limit %s offset %s
            """,
            (user_id, limit, offset),
        ).fetchall()
    return list(rows)


@router.post("/transactions", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def create_transaction(payload: TransactionCreate, user_id: UUID = Depends(current_user_id)) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            """
            insert into public.transactions (
              user_id, category_id, commitment_id, description, amount,
              direction, occurred_on, status, notes
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            returning id, description, amount, direction, occurred_on,
              category_id, commitment_id, status, notes, created_at, updated_at
            """,
            (
                user_id,
                payload.category_id,
                payload.commitment_id,
                payload.description.strip(),
                payload.amount,
                payload.direction.value,
                payload.occurred_on,
                payload.status.value,
                payload.notes,
            ),
        ).fetchone()
        category_name = None
        if payload.category_id:
            category = connection.execute(
                """
                select name
                from public.categories
                where id = %s and user_id = %s
                """,
                (payload.category_id, user_id),
            ).fetchone()
            category_name = category["name"] if category else None
    row["category_name"] = category_name
    return row


@router.patch("/transactions/{transaction_id}", response_model=TransactionRead)
def update_transaction(
    transaction_id: UUID,
    payload: TransactionUpdate,
    user_id: UUID = Depends(current_user_id),
) -> dict:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="No transaction changes provided")

    field_map = {
        "description": "description",
        "amount": "amount",
        "direction": "direction",
        "occurred_on": "occurred_on",
        "category_id": "category_id",
        "commitment_id": "commitment_id",
        "status": "status",
        "notes": "notes",
    }
    assignments = []
    parameters = []
    for field, column in field_map.items():
        if field not in values:
            continue
        value = values[field]
        if field == "description":
            if value is None:
                raise HTTPException(status_code=400, detail="Description cannot be empty")
            value = value.strip()
        elif field in {"direction", "status"}:
            if value is None:
                raise HTTPException(status_code=400, detail=f"{field} cannot be empty")
            value = value.value
        assignments.append(f"{column} = %s")
        parameters.append(value)

    with get_connection() as connection:
        if payload.category_id:
            category = connection.execute(
                """
                select id
                from public.categories
                where id = %s and user_id = %s and is_active = true
                """,
                (payload.category_id, user_id),
            ).fetchone()
            if not category:
                raise HTTPException(status_code=400, detail="Category not found")

        parameters.extend([transaction_id, user_id])
        row = connection.execute(
            f"""
            update public.transactions
            set {', '.join(assignments)}
            where id = %s and user_id = %s
            returning id, description, amount, direction, occurred_on,
              category_id, commitment_id, status, notes, created_at, updated_at
            """,
            parameters,
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Transaction not found")

        category_name = None
        if row["category_id"]:
            category = connection.execute(
                """
                select name
                from public.categories
                where id = %s and user_id = %s
                """,
                (row["category_id"], user_id),
            ).fetchone()
            category_name = category["name"] if category else None

    row["category_name"] = category_name
    return row


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: UUID, user_id: UUID = Depends(current_user_id)) -> None:
    with get_connection() as connection:
        row = connection.execute(
            """
            delete from public.transactions
            where id = %s and user_id = %s
            returning id
            """,
            (transaction_id, user_id),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")


@router.get("/dashboard", response_model=DashboardRead)
def dashboard(
    year: Annotated[int, Query(ge=2000, le=2100)] | None = None,
    month: Annotated[int, Query(ge=1, le=12)] | None = None,
    user_id: UUID = Depends(current_user_id),
) -> dict:
    today = date.today()
    selected_year = year or today.year
    selected_month = month or today.month
    current_start, current_end = month_bounds(selected_year, selected_month)
    next_year, next_month_number = next_month(selected_year, selected_month)
    next_start, next_end = month_bounds(next_year, next_month_number)
    with get_connection() as connection:
        current_totals = connection.execute(
            """
            select direction, coalesce(sum(amount), 0) as total
            from public.transactions
            where user_id = %s and status = 'completed'
              and occurred_on >= %s and occurred_on < %s
            group by direction
            """,
            (user_id, current_start, current_end),
        ).fetchall()

        planned_totals = connection.execute(
            """
            select direction, coalesce(sum(amount), 0) as total
            from public.transactions
            where user_id = %s and status = 'planned'
              and occurred_on >= %s and occurred_on < %s
            group by direction
            """,
            (user_id, next_start, next_end),
        ).fetchall()

        commitment_rows = connection.execute(
            """
            select
              c.id, c.name, c.amount, c.direction, c.commitment_type,
              c.frequency, c.due_rule, c.business_day_number,
              c.starts_on, c.next_due_on, c.ends_on,
              cat.name as category_name
            from public.commitments c
            left join public.categories cat
              on cat.id = c.category_id and cat.user_id = c.user_id
            where c.user_id = %s and c.is_active = true
            order by c.next_due_on asc, c.name asc
            """,
            (user_id,),
        ).fetchall()

        recent = connection.execute(
            """
            select
              t.id, t.description, t.amount, t.direction, t.occurred_on,
              t.category_id, t.commitment_id, t.status, t.notes,
              t.created_at, t.updated_at, c.name as category_name
            from public.transactions t
            left join public.categories c
              on c.id = t.category_id and c.user_id = t.user_id
            where t.user_id = %s
            order by t.occurred_on desc, t.created_at desc
            limit 6
            """,
            (user_id,),
        ).fetchall()

    commitments = []
    for row in commitment_rows:
        projected_date = projected_commitment_date(row, next_year, next_month_number)
        if projected_date is None:
            continue
        projected = dict(row)
        projected["next_due_on"] = projected_date
        commitments.append(projected)
    commitments.sort(key=lambda row: (row["next_due_on"], row["name"].lower()))

    current = {row["direction"]: as_money(row["total"]) for row in current_totals}
    planned = {row["direction"]: as_money(row["total"]) for row in planned_totals}
    commitment_income = sum(
        (row["amount"] for row in commitments if row["direction"] == Direction.INCOME),
        Decimal("0.00"),
    )
    commitment_expenses = sum(
        (row["amount"] for row in commitments if row["direction"] == Direction.EXPENSE),
        Decimal("0.00"),
    )
    next_income = planned.get(Direction.INCOME, Decimal("0.00")) + commitment_income
    next_expenses = planned.get(Direction.EXPENSE, Decimal("0.00")) + commitment_expenses

    return {
        "month": f"{selected_year:04d}-{selected_month:02d}",
        "next_month": f"{next_year:04d}-{next_month_number:02d}",
        "current": DashboardPeriod(
            income=current.get(Direction.INCOME, Decimal("0.00")),
            expenses=current.get(Direction.EXPENSE, Decimal("0.00")),
            available=current.get(Direction.INCOME, Decimal("0.00"))
            - current.get(Direction.EXPENSE, Decimal("0.00")),
        ),
        "next_month_summary": DashboardPeriod(
            income=next_income,
            expenses=next_expenses,
            available=next_income - next_expenses,
        ),
        "next_month_commitments": [CommitmentPreview(**row) for row in commitments],
        "recent_transactions": [TransactionRead(**row) for row in recent],
    }


app.include_router(router)
