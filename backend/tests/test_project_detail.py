"""GET /api/projects/{coin_id}: allow-list, validation, passes map, chart cache (no network)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.services.charts import ChartService, downsample, drop_nulls
from app.services.coingecko import CoinGeckoError
from app.services.details_store import DetailsStore
from app.services.projects import ProjectService
from tests.test_projects import FakeClient

S = Settings(_env_file=None)


class ChartClient(FakeClient):
    def __init__(self, fail_chart: bool = False):
        super().__init__()
        self.chart_calls = []
        self.fail_chart = fail_chart

    async def fetch_market_chart(self, coin_id, days):
        self.chart_calls.append((coin_id, days))
        if self.fail_chart:
            raise CoinGeckoError(502, "CoinGecko returned 500 for market_chart")
        points = [[1_700_000_000_000 + i * 60_000, float(i)] for i in range(720)]
        return {"prices": points, "total_volumes": points, "market_caps": points}


@pytest.fixture
def api(tmp_path):
    def make(fail_chart: bool = False):
        fake = ChartClient(fail_chart)
        store = DetailsStore(tmp_path / "coins.db")
        store.init()
        service = ProjectService(fake, store, S)
        asyncio.run(service._refresh())  # fill the snapshot up front; no lifespan, no network
        app.state.projects = service
        app.state.charts = ChartService(fake, S)
        return TestClient(app), fake

    return make


def test_unknown_id_is_404_and_never_hits_coingecko(api):
    client, fake = api()
    response = client.get("/api/projects/not-scanned")
    assert response.status_code == 404
    assert fake.chart_calls == []


@pytest.mark.parametrize("days", ["2", "0", "365", "abc"])
def test_bad_days_is_422(api, days):
    client, _ = api()
    assert client.get(f"/api/projects/match?days={days}").status_code == 422


def passed(body):
    return {r["key"]: r["passed"] for r in body["passes"]}


def test_passes_list_and_payload(api):
    client, _ = api()
    body = client.get("/api/projects/match").json()
    assert [r["key"] for r in body["passes"]] == [
        "market_cap",
        "fdv",
        "volume",
        "supply",
        "tvl",
        "preview_listing",
    ]
    assert all(r["passed"] for r in body["passes"])
    assert body["passes"][1]["label"] == "FDV < $100M"  # from settings, not a literal
    assert body["project"]["id"] == "match"
    assert body["details"]["preview_listing"] is True
    assert body["details"]["tvl_usd"] == 75_000
    assert body["chart"]["days"] == 7  # default

    no_preview = passed(client.get("/api/projects/no-preview").json())
    assert no_preview["tvl"] is True and no_preview["preview_listing"] is False

    # Scanned but failed the market filters: never checked via /coins/{id}.
    big = client.get("/api/projects/big").json()
    assert big["details"] is None
    assert big["project"]["preview_listing"] is None
    assert passed(big) == {
        "market_cap": True,
        "fdv": False,
        "volume": True,
        "supply": True,
        "tvl": False,
        "preview_listing": False,
    }


def test_chart_is_cached_per_coin_and_days(api):
    client, fake = api()
    first = client.get("/api/projects/match?days=30").json()
    second = client.get("/api/projects/match?days=30").json()
    assert fake.chart_calls == [("match", 30)]
    assert (first["meta"]["chart_cached"], second["meta"]["chart_cached"]) == (False, True)
    assert second["chart"] == first["chart"]
    assert len(first["chart"]["prices"]) <= S.chart_max_points

    client.get("/api/projects/match?days=1")
    assert fake.chart_calls == [("match", 30), ("match", 1)]


def test_chart_failure_still_returns_project(api):
    client, fake = api(fail_chart=True)
    response = client.get("/api/projects/match")
    assert response.status_code == 200
    body = response.json()
    assert body["chart"] is None
    assert "500" in body["chart_error"]
    assert passed(body)["preview_listing"] is True
    client.get("/api/projects/match")
    assert len(fake.chart_calls) == 2  # failures are not cached


def test_downsample():
    points = [[i, float(i)] for i in range(720)]
    sampled = downsample(points, 200)
    assert len(sampled) <= 200
    assert sampled[0] == points[0] and sampled[-1] == points[-1]
    short = points[:168]
    assert downsample(short, 200) is short


def test_drop_nulls():
    assert drop_nulls([[1, 2.5], [2, None], [3, 4]]) == [(1, 2.5), (3, 4.0)]
