from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from .config import settings


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(
        settings.database_url.get_secret_value(),
        row_factory=dict_row,
    ) as connection:
        yield connection
