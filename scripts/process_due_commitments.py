"""Generate due planning occurrences for the Cifro account(s).

Run this script once a day from a scheduler such as a Render Cron Job.
"""

import sys
from pathlib import Path

# When Python runs a file inside scripts/, it does not automatically include
# the repository root in its import path.
ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from apps.backend.app.db import get_connection
from apps.backend.app.main import process_due_commitments


def main() -> None:
    with get_connection() as connection:
        processed = process_due_commitments(connection)
    print(f"Cifro: {processed} ocorrência(s) processada(s).")


if __name__ == "__main__":
    main()
