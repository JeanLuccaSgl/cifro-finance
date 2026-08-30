"""Generate due planning occurrences for the Cifro account(s).

Run this script once a day from a scheduler such as a Render Cron Job.
"""

from apps.backend.app.db import get_connection
from apps.backend.app.main import process_due_commitments


def main() -> None:
    with get_connection() as connection:
        processed = process_due_commitments(connection)
    print(f"Cifro: {processed} ocorrência(s) processada(s).")


if __name__ == "__main__":
    main()
