"""SQLite details store and the market + details combine step (temp DB, no network)."""

from datetime import UTC, datetime, timedelta

from app.config import Settings
from app.services.details_store import CoinDetails, DetailsStore, is_fresh
from app.services.projects import build_funnel, combine, select, usd_short

S = Settings(_env_file=None)
NOW = datetime(2026, 10, 8, 12, 0, tzinfo=UTC)


def make_store(tmp_path) -> DetailsStore:
    store = DetailsStore(tmp_path / "nested" / "coins.db")
    store.init()
    store.init()  # idempotent
    return store


def test_upsert_roundtrip_and_overwrite(tmp_path):
    store = make_store(tmp_path)
    assert store.load_all() == {}

    store.upsert([CoinDetails("a", True, 75_000.5, NOW), CoinDetails("b", False, None, NOW)])
    assert store.load_all() == {
        "a": CoinDetails("a", True, 75_000.5, NOW),
        "b": CoinDetails("b", False, None, NOW),
    }

    later = NOW + timedelta(hours=1)
    store.upsert([CoinDetails("a", False, 10.0, later)])
    loaded = store.load_all()
    assert loaded["a"] == CoinDetails("a", False, 10.0, later)
    assert len(loaded) == 2


def test_is_fresh():
    ttl = 6 * 3600
    assert not is_fresh(None, ttl, NOW)
    assert is_fresh(CoinDetails("a", True, 1.0, NOW - timedelta(hours=5, minutes=59)), ttl, NOW)
    assert not is_fresh(CoinDetails("a", True, 1.0, NOW - timedelta(hours=6)), ttl, NOW)


def row(coin_id, volume=100_000):
    return {
        "id": coin_id,
        "symbol": coin_id,
        "name": coin_id.title(),
        "market_cap": 1e6,
        "fully_diluted_valuation": 1e6,
        "total_volume": volume,
        "max_supply": 1e6,
        "total_supply": 1e6,
    }


def test_combine_uses_fresh_market_data_and_stored_details():
    candidates = [
        row("low", 60_000),
        row("high", 900_000),
        row("no-tvl"),
        row("not-preview"),
        row("unknown"),
    ]
    details = {
        "low": CoinDetails("low", True, 80_000, NOW),
        "high": CoinDetails("high", True, 1e6, NOW),
        "no-tvl": CoinDetails("no-tvl", True, None, NOW),
        "not-preview": CoinDetails("not-preview", False, 1e6, NOW),
        "stale-not-candidate": CoinDetails("stale-not-candidate", True, 1e6, NOW),
    }
    result = combine(candidates, details, S)
    # TVL applied here; sorted by volume desc; "unknown" has no stored details.
    assert [p.id for p in result.tvl_passing] == ["high", "not-preview", "low"]
    assert result.tvl_passing[0].total_volume == 900_000  # from the market row
    assert result.tvl_passing[0].total_value_locked == 1e6  # from the DB
    assert result.preview_listed == 3

    assert [p.id for p in select(result.tvl_passing, True, S)] == ["high", "low"]
    # require_preview=False drops only the preview rule: TVL-less "no-tvl" stays out.
    assert [p.id for p in select(result.tvl_passing, False, S)] == ["high", "not-preview", "low"]


def test_usd_short():
    assert usd_short(100_000_000) == "$100M"
    assert usd_short(50_000) == "$50k"
    assert usd_short(2_500_000_000) == "$2.5B"
    assert usd_short(999) == "$999"


def test_funnel_labels_follow_config():
    s = Settings(_env_file=None, fdv_max=25_000_000, volume_min=10_000, tvl_min=1_000_000)
    funnel = build_funnel(s, 2750, 690, 107, 0)
    assert [(f.key, f.passed) for f in funnel] == [
        ("scanned", 2750),
        ("market_filters", 690),
        ("tvl", 107),
        ("preview_listing", 0),
    ]
    assert "FDV < $25M" in funnel[1].label and "24h volume > $10k" in funnel[1].label
    assert funnel[2].label == "TVL > $1M"
