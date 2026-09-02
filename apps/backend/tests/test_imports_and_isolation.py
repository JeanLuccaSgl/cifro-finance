import unittest
from uuid import uuid4

from fastapi import HTTPException

from apps.backend.app.main import (
    normalize_import_row,
    parse_import_amount,
    parse_import_date,
    parse_import_partial_date,
    validate_category_for_direction,
    validate_commitment_for_transaction,
)


class ImportParsingTests(unittest.TestCase):
    def test_amount_and_dates_accept_common_spreadsheet_formats(self):
        self.assertEqual(str(parse_import_amount("R$ 1.234,56")), "1234.56")
        self.assertEqual(str(parse_import_amount("(R$ 20,00)")), "-20.00")
        self.assertEqual(parse_import_date("31/12/2025"), "2025-12-31")
        self.assertEqual(parse_import_partial_date("05/01", "Janeiro 2026"), "2026-01-05")

    def test_row_with_both_income_and_expense_is_not_valid(self):
        indexes = {
            "date": 0,
            "description": 1,
            "amount": None,
            "direction": None,
            "income": 2,
            "expense": 3,
            "category": None,
            "status": None,
            "notes": None,
        }
        result = normalize_import_row(
            ["2026-08-01", "Movimentação ambígua", "100,00", "50,00"],
            indexes,
            "Agosto 2026",
            2,
        )
        self.assertFalse(result["valid"])
        self.assertIn("Entrada e saída preenchidas simultaneamente", result["errors"])

    def test_invalid_row_explains_what_needs_attention(self):
        indexes = {field: None for field in ("date", "description", "amount", "direction", "income", "expense", "category", "status", "notes")}
        result = normalize_import_row([], indexes, "Página 1", 2)
        self.assertFalse(result["valid"])
        self.assertIn("Descrição ausente", result["errors"])
        self.assertIn("Data ausente ou inválida", result["errors"])
        self.assertIn("Valor ausente ou inválido", result["errors"])


class QueryResult:
    def __init__(self, row):
        self.row = row

    def fetchone(self):
        return self.row


class UserScopedCategoryConnection:
    def __init__(self, owner_id, category):
        self.owner_id = owner_id
        self.category = category
        self.requested_user_id = None

    def execute(self, query, params):
        self.requested_user_id = params[1]
        row = self.category if self.requested_user_id == self.owner_id else None
        return QueryResult(row)


class UserScopedCommitmentConnection:
    def __init__(self, owner_id, commitment):
        self.owner_id = owner_id
        self.commitment = commitment

    def execute(self, query, params):
        row = self.commitment if params[1] == self.owner_id else None
        return QueryResult(row)


class IsolationBoundaryTests(unittest.TestCase):
    def test_category_lookup_only_accepts_the_owner_user(self):
        owner_id = uuid4()
        category = {"id": uuid4(), "name": "Lazer", "kind": "expense", "is_active": True}
        connection = UserScopedCategoryConnection(owner_id, category)

        self.assertEqual(
            validate_category_for_direction(connection, category["id"], "expense", owner_id),
            category,
        )

        with self.assertRaises(HTTPException) as context:
            validate_category_for_direction(connection, category["id"], "expense", uuid4())
        self.assertEqual(context.exception.status_code, 400)

    def test_commitment_lookup_only_accepts_the_owner_user(self):
        owner_id = uuid4()
        commitment = {
            "id": uuid4(),
            "category_id": None,
            "direction": "expense",
            "is_active": True,
        }
        connection = UserScopedCommitmentConnection(owner_id, commitment)

        self.assertEqual(
            validate_commitment_for_transaction(
                connection, commitment["id"], "expense", None, owner_id
            ),
            commitment,
        )

        with self.assertRaises(HTTPException) as context:
            validate_commitment_for_transaction(
                connection, commitment["id"], "expense", None, uuid4()
            )
        self.assertEqual(context.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
