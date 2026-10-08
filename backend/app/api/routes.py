from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request

from app.schemas import ProjectsResponse
from app.services.coingecko import CoinGeckoError

router = APIRouter(prefix="/api")


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
        headers = {"Retry-After": "30"} if exc.status == 503 else None
        raise HTTPException(exc.status, exc.message, headers=headers) from exc
