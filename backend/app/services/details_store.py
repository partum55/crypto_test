"""SQLite persistence for the slow-changing per-coin details (preview_listing, TVL).

Design choice: plain synchronous sqlite3 with a fresh connection per call. Every call is
a tiny indexed read/write, and the service runs them via asyncio.to_thread so the event
loop never blocks on disk I/O. One connection per call also sidesteps sqlite3's
same-thread restriction for connections.
"""

import sqlite3
from collections.abc import Iterable
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS coins (
    id TEXT PRIMARY KEY,
    preview_listing INTEGER,
    tvl_usd REAL NULL,
    checked_at TEXT
)
"""


@dataclass(frozen=True)
class CoinDetails:
    id: str
    preview_listing: bool
    tvl_usd: float | None
    checked_at: datetime  # timezone-aware UTC


def is_fresh(details: CoinDetails | None, ttl_seconds: float, now: datetime) -> bool:
    return details is not None and now - details.checked_at < timedelta(seconds=ttl_seconds)


class DetailsStore:
    def __init__(self, path: Path | str):
        self.path = Path(path)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=10)

    def init(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as conn:
            conn.execute(SCHEMA)

    def load_all(self) -> dict[str, CoinDetails]:
        # The table holds at most a few thousand rows, so one full read per refresh is cheap.
        with closing(self._connect()) as conn:
            rows = conn.execute("SELECT id, preview_listing, tvl_usd, checked_at FROM coins")
            rows = rows.fetchall()
        return {
            row[0]: CoinDetails(row[0], bool(row[1]), row[2], datetime.fromisoformat(row[3]))
            for row in rows
        }

    def upsert(self, details: Iterable[CoinDetails]) -> None:
        with closing(self._connect()) as conn, conn:  # inner `conn`: commit or roll back
            conn.executemany(
                """
                INSERT INTO coins (id, preview_listing, tvl_usd, checked_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    preview_listing = excluded.preview_listing,
                    tvl_usd = excluded.tvl_usd,
                    checked_at = excluded.checked_at
                """,
                [
                    (d.id, int(d.preview_listing), d.tvl_usd, d.checked_at.isoformat())
                    for d in details
                ],
            )
