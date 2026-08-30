from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class CommitmentType(StrEnum):
    SUBSCRIPTION = "subscription"
    INSTALLMENT = "installment"
    RECURRING = "recurring"


class CommitmentFrequency(StrEnum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class CommitmentDueRule(StrEnum):
    FIXED_DAY = "fixed_day"
    BUSINESS_DAY = "business_day"


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


class CommitmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    commitment_type: CommitmentType
    direction: Direction
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    frequency: CommitmentFrequency
    due_rule: CommitmentDueRule = CommitmentDueRule.FIXED_DAY
    business_day_number: int | None = Field(default=None, gt=0, le=31)
    starts_on: date
    next_due_on: date | None = None
    ends_on: date | None = None
    category_id: UUID | None = None
    total_installments: int | None = Field(default=None, gt=0)
    current_installment: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_commitment(self):
        if self.due_rule == CommitmentDueRule.FIXED_DAY and self.next_due_on is None:
            raise ValueError("Fixed-day commitments require next_due_on")
        if self.next_due_on and self.next_due_on < self.starts_on:
            raise ValueError("next_due_on must be on or after starts_on")
        if self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("ends_on must be on or after starts_on")

        if self.due_rule == CommitmentDueRule.BUSINESS_DAY:
            if self.business_day_number is None:
                raise ValueError("Business-day commitments require business_day_number")
        elif self.business_day_number is not None:
            raise ValueError("Only business-day commitments can have business_day_number")

        is_installment = self.commitment_type == CommitmentType.INSTALLMENT
        if is_installment:
            if self.total_installments is None or self.current_installment is None:
                raise ValueError("Installments require total_installments and current_installment")
            if self.current_installment > self.total_installments:
                raise ValueError("current_installment cannot exceed total_installments")
        elif self.total_installments is not None or self.current_installment is not None:
            raise ValueError("Only installments can have installment counts")

        return self


class CommitmentUpdate(CommitmentCreate):
    pass


class CommitmentRead(CommitmentCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_active: bool
    created_at: datetime
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
