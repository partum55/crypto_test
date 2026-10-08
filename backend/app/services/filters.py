"""Pure filter predicates. A missing (null) value never passes."""

import math
from typing import Any

from app.config import Settings


def has_market_cap(row: dict[str, Any]) -> bool:
    mcap = row.get("market_cap")
    return mcap is not None and mcap > 0


def fdv_below(row: dict[str, Any], limit: float) -> bool:
    fdv = row.get("fully_diluted_valuation")
    return fdv is not None and fdv < limit


def volume_above(row: dict[str, Any], limit: float) -> bool:
    volume = row.get("total_volume")
    return volume is not None and volume > limit


def supply_matches(row: dict[str, Any], rel_tol: float) -> bool:
    max_supply, total_supply = row.get("max_supply"), row.get("total_supply")
    if max_supply is None or total_supply is None:
        return False
    return math.isclose(max_supply, total_supply, rel_tol=rel_tol)


def is_preview_listing(detail: dict[str, Any]) -> bool:
    return detail.get("preview_listing") is True


def extract_tvl_usd(detail: dict[str, Any]) -> float | None:
    """TVL comes back as null, a plain number, or a per-currency object like {"usd": ...}."""
    tvl = (detail.get("market_data") or {}).get("total_value_locked")
    if isinstance(tvl, dict):
        tvl = tvl.get("usd")
    return tvl if isinstance(tvl, int | float) else None


def tvl_above(tvl_usd: float | None, limit: float) -> bool:
    return tvl_usd is not None and tvl_usd > limit


def passes_market_filters(row: dict[str, Any], s: Settings) -> bool:
    """Cheap criteria available from /coins/markets."""
    return (
        has_market_cap(row)
        and fdv_below(row, s.fdv_max)
        and volume_above(row, s.volume_min)
        and supply_matches(row, s.supply_rel_tol)
    )


def passes_detail_filters(preview_listing: bool, tvl_usd: float | None, s: Settings) -> bool:
    """Criteria that need /coins/{id} (values parsed by is_preview_listing / extract_tvl_usd)."""
    return preview_listing and tvl_above(tvl_usd, s.tvl_min)
