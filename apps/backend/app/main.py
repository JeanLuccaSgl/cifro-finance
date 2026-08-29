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
    CommitmentPreview,
    DashboardPeriod,
    DashboardRead,
    Direction,
    TransactionCreate,
    TransactionRead,
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
    allow_methods=["GET", "POST", "OPTIONS"],
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


def as_money(value: Decimal | None) -> Decimal:
    return value or Decimal("0.00")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cifro-api"}


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
    row["category_name"] = None
    return row


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

        commitments = connection.execute(
            """
            select
              c.id, c.name, c.amount, c.direction, c.commitment_type,
              c.next_due_on, cat.name as category_name
            from public.commitments c
            left join public.categories cat
              on cat.id = c.category_id and cat.user_id = c.user_id
            where c.user_id = %s and c.is_active = true
              and c.next_due_on >= %s and c.next_due_on < %s
            order by c.next_due_on asc, c.name asc
            """,
            (user_id, next_start, next_end),
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
