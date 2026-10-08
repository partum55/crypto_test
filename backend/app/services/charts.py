"""Price/volume charts for the coin detail endpoint, cached per (coin_id, days)."""

import asyncio
import math
from typing import Any

from app.config import Settings
from app.schemas import Chart
from app.services.cache import TTLCache
from app.services.coingecko import CoinGeckoClient, CoinGeckoError


def drop_nulls(points: list[Any]) -> list[tuple[int, float]]:
    """CoinGecko occasionally sends [ts, null]; the chart contract has numbers only."""
    return [(int(t), float(v)) for t, v in points if v is not None]


def downsample(points: list[Any], max_points: int) -> list[Any]:
    """Keep every k-th point (k chosen so at most max_points remain), always keeping the last."""
    if len(points) <= max_points:
        return points
    step = math.ceil(len(points) / max_points)
    sampled = points[::step]
    if sampled[-1] is not points[-1]:
        sampled[-1] = points[-1]  # replace, don't append: stays within max_points
    return sampled


class ChartService:
    def __init__(self, client: CoinGeckoClient, settings: Settings):
        self.client = client
        self.s = settings
        self._cache = TTLCache(settings.chart_cache_ttl_seconds)

    async def get(self, coin_id: str, days: int) -> tuple[Chart | None, bool, str | None]:
        """Returns (chart, served_from_cache, error). Never raises for upstream failures."""
        cached = self._cache.get((coin_id, days))
        if cached is not None:
            return cached, True, None
        try:
            raw = await asyncio.wait_for(
                self.client.fetch_market_chart(coin_id, days), self.s.chart_timeout
            )
        except CoinGeckoError as exc:
            return None, False, exc.message
        except TimeoutError:
            return None, False, f"CoinGecko chart request timed out after {self.s.chart_timeout}s"
        chart = Chart(
            days=days,
            prices=downsample(drop_nulls(raw.get("prices") or []), self.s.chart_max_points),
            total_volumes=downsample(
                drop_nulls(raw.get("total_volumes") or []), self.s.chart_max_points
            ),
        )
        self._cache.set((coin_id, days), chart)
        return chart, False, None
