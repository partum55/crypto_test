from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request

from app.schemas import ChartDays, ProjectDetailMeta, ProjectDetailResponse, ProjectsResponse
from app.services.coingecko import CoinGeckoError

router = APIRouter(prefix="/api")


def as_http_error(exc: CoinGeckoError) -> HTTPException:
    headers = {"Retry-After": "30"} if exc.status == 503 else None
    return HTTPException(exc.status, exc.message, headers=headers)


@router.get("/projects", response_model=ProjectsResponse)
async def list_projects(
    request: Request,
    require_preview: Annotated[
        bool,
        Query(
            description="Default true (the spec). false skips ONLY the preview_listing rule, "
            "a deliberate deviation for inspecting the rest of the pipeline."
        ),
    ] = True,
) -> ProjectsResponse:
    """Coins matching all criteria. Served from cache; refreshed in the background."""
    try:
        return await request.app.state.projects.get_projects(require_preview)
    except CoinGeckoError as exc:
        raise as_http_error(exc) from exc


@router.get("/projects/{coin_id}", response_model=ProjectDetailResponse)
async def project_detail(
    request: Request,
    coin_id: str,
    days: Annotated[ChartDays, Query(description="Chart range in days: 1, 7 or 30.")] = (
        ChartDays.SEVEN
    ),
) -> ProjectDetailResponse:
    """One scanned coin: cached market data, stored details, per-criterion results, chart.

    Only ids from the current market scan are accepted (404 otherwise). If the chart can't
    be loaded, the rest is still returned with `chart: null` and `meta.chart_error`.
    """
    try:
        detail = request.app.state.projects.get_detail(coin_id)
    except CoinGeckoError as exc:
        raise as_http_error(exc) from exc
    if detail is None:
        raise HTTPException(404, f"Unknown coin id {coin_id!r} (not in the current market scan)")

    chart, chart_cached, chart_error = await request.app.state.charts.get(coin_id, int(days))
    return ProjectDetailResponse(
        project=detail.project,
        details=detail.details,
        passes=detail.passes,
        chart=chart,
        meta=ProjectDetailMeta(
            fetched_at=detail.fetched_at, chart_cached=chart_cached, chart_error=chart_error
        ),
    )
