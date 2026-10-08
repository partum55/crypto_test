"""Client behaviour against a fake transport (no network)."""

import asyncio

import httpx
import pytest

from app.config import Settings
from app.services.coingecko import CoinGeckoClient, CoinGeckoError

S = Settings(_env_file=None, min_request_interval=0, max_retries=2)


def make_client(handler) -> CoinGeckoClient:
    http = httpx.AsyncClient(base_url="https://cg.test", transport=httpx.MockTransport(handler))
    return CoinGeckoClient(http, S)


def test_market_paging_stops_at_volume_cutoff_and_dedupes():
    pages = {
        1: [{"id": "a", "total_volume": 900_000}, {"id": "b", "total_volume": 80_000}],
        2: [{"id": "b", "total_volume": 70_000}, {"id": "c", "total_volume": 40_000}],
        3: [{"id": "never", "total_volume": 10}],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=pages[int(request.url.params["page"])])

    rows, fetched = asyncio.run(make_client(handler).fetch_market_rows())
    assert fetched == 2
    assert [r["id"] for r in rows] == ["a", "b", "c"]


def test_retries_429_then_succeeds():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        if len(calls) < 2:
            return httpx.Response(429, headers={"Retry-After": "0"})
        return httpx.Response(200, json={"id": "x"})

    assert asyncio.run(make_client(handler).fetch_detail("x")) == {"id": "x"}
    assert len(calls) == 2


def test_persistent_429_becomes_503():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"Retry-After": "0"})

    with pytest.raises(CoinGeckoError) as exc:
        asyncio.run(make_client(handler).fetch_detail("x"))
    assert exc.value.status == 503


def test_404_is_502_without_retry():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(404)

    with pytest.raises(CoinGeckoError) as exc:
        asyncio.run(make_client(handler).fetch_detail("x"))
    assert exc.value.status == 502
    assert len(calls) == 1
