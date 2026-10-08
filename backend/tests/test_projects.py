"""ProjectService pipeline + stale-while-revalidate with a fake client and a temp DB."""

import asyncio

import pytest

from app.config import Settings
from app.services.coingecko import CoinGeckoError
from app.services.details_store import DetailsStore
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


def make_service(tmp_path, client):
    store = DetailsStore(tmp_path / "coins.db")
    store.init()
    return ProjectService(client, store, S)


def test_cold_start_503_then_serves_snapshot(tmp_path):
    async def scenario():
        client = FakeClient()
        service = make_service(tmp_path, client)
        with pytest.raises(CoinGeckoError) as exc:
            await service.get_projects()  # kicks off the refresh, doesn't wait
        assert exc.value.status == 503
        await service._task
        return client, await service.get_projects()

    client, response = asyncio.run(scenario())
    assert sorted(client.detail_calls) == ["gone", "match", "no-preview"]  # "big" prefiltered
    assert [p.id for p in response.items] == ["match"]
    assert response.items[0].total_value_locked == 75_000
    meta = response.meta
    assert (meta.scanned, meta.after_prefilter, meta.details_fetched) == (4, 3, 2)
    assert (meta.detail_errors, meta.preview_listed, meta.tvl_above_min) == (1, 1, 1)
    assert not meta.stale and not meta.refreshing


def test_restart_reuses_persisted_details(tmp_path):
    async def run_once():
        client = FakeClient()
        service = make_service(tmp_path, client)  # same DB file each time = a restart
        service.start_refresh()
        await service._task
        return client, await service.get_projects()

    asyncio.run(run_once())
    client, response = asyncio.run(run_once())
    assert client.detail_calls == ["gone"]  # failed last time, so never stored
    assert [p.id for p in response.items] == ["match"]
    assert response.meta.details_fetched == 0
