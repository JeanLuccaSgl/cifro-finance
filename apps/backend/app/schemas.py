from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CategoryKind(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    BOTH = "both"


class Direction(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class TransactionStatus(StrEnum):
    COMPLETED = "completed"
    PLANNED = "planned"


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: CategoryKind


class CategoryUpdate(CategoryCreate):
    pass


class CategoryRead(CategoryCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_active: bool
    created_at: datetime


class TransactionCreate(BaseModel):
    description: str = Field(min_length=1, max_length=160)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    direction: Direction
    occurred_on: date
    category_id: UUID | None = None
    commitment_id: UUID | None = None
    status: TransactionStatus = TransactionStatus.COMPLETED
    notes: str | None = None


class TransactionUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=160)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    direction: Direction | None = None
    occurred_on: date | None = None
    category_id: UUID | None = None
    commitment_id: UUID | None = None
    status: TransactionStatus | None = None
    notes: str | None = None


class TransactionRead(TransactionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
    category_name: str | None = None


class DashboardPeriod(BaseModel):
    income: Decimal
    expenses: Decimal
    available: Decimal


class CommitmentPreview(BaseModel):
    id: UUID
    name: str
    amount: Decimal
    direction: Direction
    commitment_type: str
    next_due_on: date
    category_name: str | None = None


class DashboardRead(BaseModel):
    month: str
    next_month: str
    current: DashboardPeriod
    next_month_summary: DashboardPeriod
    next_month_commitments: list[CommitmentPreview]
    recent_transactions: list[TransactionRead]
