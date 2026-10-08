import pytest

from app.config import Settings
from app.services import filters

S = Settings(_env_file=None)

GOOD_ROW = {
    "market_cap": 5_000_000,
    "fully_diluted_valuation": 5_000_000,
    "total_volume": 60_000,
    "max_supply": 1_000_000.0,
    "total_supply": 1_000_000.0,
}


def row(**overrides):
    return {**GOOD_ROW, **overrides}


def detail(preview=True, tvl=None):
    return {"preview_listing": preview, "market_data": {"total_value_locked": tvl}}


def test_good_row_passes_market_filters():
    assert filters.passes_market_filters(GOOD_ROW, S)


@pytest.mark.parametrize(
    "overrides",
    [
        {"market_cap": 0},
        {"market_cap": None},
        {"fully_diluted_valuation": None},
        {"fully_diluted_valuation": 100_000_000},  # strict <
        {"total_volume": 50_000},  # strict >
        {"total_volume": None},
        {"max_supply": None},
        {"total_supply": None},
        {"max_supply": 1_000_000.0, "total_supply": 999_000.0},
    ],
)
def test_market_filter_rejections(overrides):
    assert not filters.passes_market_filters(row(**overrides), S)


def test_supply_match_tolerates_float_noise():
    assert filters.supply_matches(row(total_supply=1_000_000.0000001), S.supply_rel_tol)
    assert not filters.supply_matches(row(total_supply=1_000_010.0), S.supply_rel_tol)


@pytest.mark.parametrize(
    ("tvl", "expected"),
    [
        (None, None),
        (123_456, 123_456),
        (1.5, 1.5),
        ({"usd": 70_000, "btc": 1}, 70_000),
        ({"btc": 1}, None),
        ({"usd": None}, None),
    ],
)
def test_extract_tvl_usd_shapes(tvl, expected):
    assert filters.extract_tvl_usd(detail(tvl=tvl)) == expected


def test_extract_tvl_usd_missing_market_data():
    assert filters.extract_tvl_usd({"preview_listing": True}) is None
    assert filters.extract_tvl_usd({"market_data": None}) is None


def test_detail_filters():
    assert filters.passes_detail_filters(detail(tvl={"usd": 60_000}), S)
    assert filters.passes_detail_filters(detail(tvl=60_000), S)
    assert not filters.passes_detail_filters(detail(tvl={"usd": 50_000}), S)  # strict >
    assert not filters.passes_detail_filters(detail(tvl=None), S)
    assert not filters.passes_detail_filters(detail(preview=False, tvl=60_000), S)
    assert not filters.passes_detail_filters(detail(preview=None, tvl=60_000), S)
