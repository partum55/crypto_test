"""ProjectService pipeline and stale-while-revalidate behaviour with a fake client."""

import asyncio

import pytest

from app.config import Settings
from app.services.coingecko import CoinGeckoError
from app.services.projects import ProjectService

S = Settings(_env_file=None)

MATCH = {
    "id": "match",
    "symbol": "m",
    "name": "Match",
    "market_cap": 1e6,
    "fully_diluted_valuation": 1e6,
    "total_volume": 1e5,
    "max_supply": 1e6,
    "total_supply": 1e6,
}
NO_PREVIEW = {**MATCH, "id": "no-preview"}
BIG_FDV = {**MATCH, "id": "big", "fully_diluted_valuation": 2e8}
GONE = {**MATCH, "id": "gone"}


class FakeClient:
    def __init__(self):
        self.detail_calls = []

    async def fetch_market_rows(self):
        return [MATCH, NO_PREVIEW, BIG_FDV, GONE], 1

    async def fetch_detail(self, coin_id):
        self.detail_calls.append(coin_id)
        if coin_id == "gone":
            raise CoinGeckoError(502, "404")
        tvl = {"usd": 75_000} if coin_id == "match" else None
        return {"preview_listing": coin_id == "match", "market_data": {"total_value_locked": tvl}}


def test_cold_start_503_then_serves_snapshot():
    async def scenario():
        client = FakeClient()
        service = ProjectService(client, S)
        with pytest.raises(CoinGeckoError) as exc:
            await service.get_projects()  # kicks off the refresh, doesn't wait
        assert exc.value.status == 503
        await service._task
        response = await service.get_projects()
        return client, response

    client, response = asyncio.run(scenario())
    assert sorted(client.detail_calls) == ["gone", "match", "no-preview"]  # "big" prefiltered
    assert [p.id for p in response.items] == ["match"]
    assert response.items[0].total_value_locked == 75_000
    assert response.meta.scanned == 4
    assert response.meta.after_prefilter == 3
    assert response.meta.detail_errors == 1
    assert not response.meta.stale and not response.meta.refreshing
