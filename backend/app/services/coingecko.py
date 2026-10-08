"""Thin async client for the two CoinGecko endpoints we need."""

import asyncio
import contextlib
import logging
import time
from typing import Any

import httpx

from app.config import Settings

log = logging.getLogger(__name__)

DETAIL_PARAMS = {
    "localization": "false",
    "tickers": "false",
    "community_data": "false",
    "developer_data": "false",
    "sparkline": "false",
}
MAX_RETRY_AFTER = 60.0


class CoinGeckoError(Exception):
    """Upstream failure; `status` is the HTTP status our API should answer with."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class MinIntervalLimiter:
    """Spaces out request starts by at least `interval` seconds (process-wide)."""

    def __init__(self, interval: float):
        self.interval = interval
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self) -> None:
        async with self._lock:
            delay = self._last + self.interval - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self._last = time.monotonic()


class CoinGeckoClient:
    def __init__(self, http: httpx.AsyncClient, settings: Settings):
        self.http = http
        self.s = settings
        self._semaphore = asyncio.Semaphore(settings.concurrency)
        self._limiter = MinIntervalLimiter(settings.min_request_interval)

    async def _get(self, path: str, params: dict[str, Any], interactive: bool = False) -> Any:
        """GET with retries. Every call goes through the rate limiter.

        `interactive` calls (user-facing, one at a time) skip the concurrency semaphore so
        they don't queue behind hundreds of background detail fetches; the limiter still
        spaces them out with everything else.
        """
        last_error = "unknown error"
        rate_limited = False
        retry_after: str | None = None
        for attempt in range(self.s.max_retries + 1):
            if attempt:
                await asyncio.sleep(self._backoff(attempt, retry_after))
            retry_after = None
            async with contextlib.nullcontext() if interactive else self._semaphore:
                await self._limiter.wait()
                try:
                    response = await self.http.get(path, params=params)
                except httpx.TransportError as exc:  # timeouts, DNS, connection refused
                    last_error, rate_limited = f"CoinGecko unreachable: {exc!r}", False
                    continue
            if response.status_code == 429 or response.status_code >= 500:
                rate_limited = response.status_code == 429
                retry_after = response.headers.get("Retry-After")
                last_error = f"CoinGecko returned {response.status_code} for {path}"
                log.warning("%s (attempt %d)", last_error, attempt + 1)
                continue
            if response.is_error:
                raise CoinGeckoError(502, f"CoinGecko returned {response.status_code} for {path}")
            return response.json()
        if rate_limited:
            raise CoinGeckoError(503, f"Rate limited by CoinGecko after retries: {last_error}")
        raise CoinGeckoError(502, last_error)

    @staticmethod
    def _backoff(attempt: int, retry_after: str | None) -> float:
        if retry_after:
            try:
                return min(float(retry_after), MAX_RETRY_AFTER)
            except ValueError:
                pass  # HTTP-date form; fall back to exponential backoff
        return float(2**attempt)

    async def fetch_market_rows(self) -> tuple[list[dict[str, Any]], int]:
        """Page /coins/markets by volume desc; stop once volume drops to the threshold.

        Returns (rows deduplicated by id, pages fetched).
        """
        rows: dict[str, dict[str, Any]] = {}
        pages = 0
        for page in range(1, self.s.max_pages + 1):
            data = await self._get(
                "/coins/markets",
                {"vs_currency": "usd", "order": "volume_desc", "per_page": 250, "page": page},
            )
            pages += 1
            if not data:
                break
            for row in data:
                rows.setdefault(row["id"], row)  # pages can shift between calls -> duplicates
            # Sorted by volume: every later coin has volume <= this one, so none can pass.
            if (data[-1].get("total_volume") or 0) <= self.s.volume_min:
                break
        return list(rows.values()), pages

    async def fetch_market_chart(self, coin_id: str, days: int) -> dict[str, Any]:
        return await self._get(
            f"/coins/{coin_id}/market_chart",
            {"vs_currency": "usd", "days": days},
            interactive=True,
        )

    async def fetch_detail(self, coin_id: str) -> dict[str, Any]:
        return await self._get(f"/coins/{coin_id}", DETAIL_PARAMS)
