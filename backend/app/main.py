import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings
from app.services.charts import ChartService
from app.services.coingecko import CoinGeckoClient
from app.services.details_store import DetailsStore
from app.services.projects import ProjectService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # one INFO line per request is noise


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    headers = {"accept": "application/json"}
    if settings.coingecko_api_key:
        headers["x-cg-demo-api-key"] = settings.coingecko_api_key
    async with httpx.AsyncClient(
        base_url=settings.coingecko_base_url,
        headers=headers,
        timeout=settings.request_timeout,
    ) as http:
        store = DetailsStore(settings.db_path)
        await asyncio.to_thread(store.init)  # creates data/coins.db and the table if missing
        client = CoinGeckoClient(http, settings)
        projects = ProjectService(client, store, settings)
        projects.start_refresh()  # warm the cache so the first request doesn't wait minutes
        app.state.projects = projects
        app.state.charts = ChartService(client, settings)
        yield
        await projects.stop()


app = FastAPI(title="Crypto Projects API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
