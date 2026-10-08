# Crypto Projects Filter

A FastAPI backend that scans CoinGecko and returns the coins matching **all** of these criteria:

| Criterion | Source | Rule |
|---|---|---|
| Market cap > 0 | `/coins/markets` `market_cap` | strict `>` |
| FDV < $100M | `/coins/markets` `fully_diluted_valuation` | strict `<` |
| 24h volume > $50k | `/coins/markets` `total_volume` | strict `>` |
| Max supply == total supply | `/coins/markets` `max_supply`, `total_supply` | `math.isclose(rel_tol=1e-6)` |
| `preview_listing == true` | `/coins/{id}` top-level `preview_listing` | `is True` |
| TVL > $50k | `/coins/{id}` `market_data.total_value_locked` | strict `>` (USD) |

The frontend (TODO) will call only this backend, never CoinGecko directly.

## Run the backend

> **You need a free CoinGecko Demo API key** ([get one here](https://www.coingecko.com/en/api/pricing)).
> Without a key, CoinGecko rate-limits by IP after a handful of calls, and a full scan needs about 700 calls.

Requires [uv](https://docs.astral.sh/uv/). uv installs Python 3.12 automatically (pinned in `.python-version`).

```bash
cd backend
cp .env.example .env          # then set COINGECKO_API_KEY=CG-...
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

- API: <http://localhost:8000/api/projects>
- Swagger docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/health>
- Tests and lint: `uv run pytest` and `uv run ruff check .`

On startup the server **warms its cache in the background**. Until that first refresh finishes, `/api/projects` answers `503` with `Retry-After: 30`.

| Start | What happens | Measured (Demo key) |
|---|---|---|
| First ever (empty DB) | 11 market pages + ~690 `/coins/{id}` calls | **~471 s** (about 8 min) |
| Restart / later refreshes (details < 6h old) | 11 market pages + only new or stale coins | **~10 s** (9.7 s measured; 4 detail calls) |

Coin details are stored in `backend/data/coins.db` (SQLite, gitignored). Delete that file to force a full re-check.

## API

`GET /api/projects` returns `200`:

```json
{
  "count": 1,
  "items": [
    {
      "id": "...", "symbol": "...", "name": "...", "image": "https://...",
      "coingecko_url": "https://www.coingecko.com/en/coins/...",
      "current_price": 0.12, "market_cap": 1200000.0, "fully_diluted_valuation": 1200000.0,
      "total_volume": 80000.0, "total_supply": 10000000.0, "max_supply": 10000000.0,
      "total_value_locked": 75000.0, "preview_listing": true
    }
  ],
  "meta": {
    "scanned": 2750, "pages_fetched": 11, "after_prefilter": 692,
    "preview_listed": 1, "tvl_above_min": 107, "after_details": 1,
    "details_fetched": 3, "detail_errors": 0, "fetched_at": "2026-10-08T19:46:00Z", "age_seconds": 12.3,
    "stale": false, "refreshing": false, "last_error": null
  }
}
```

- `meta` explains the result. It reports how many coins were scanned and how many survived the cheap filters (`after_prefilter`). Among those, it reports how many are preview-listed (`preview_listed`) and how many have TVL above $50k (`tvl_above_min`); `after_details` is how many pass both. `details_fetched` is the number of `/coins/{id}` calls made by the last refresh. **An empty `items` list is a valid result**, not an error.
- `503`: the cache is still warming up, or CoinGecko kept rate-limiting after retries. The response has a `detail` message and `Retry-After`.
- `502`: CoinGecko was unreachable or returned an unexpected error.
- CORS allows `http://localhost:3000` (configurable via `CORS_ORIGINS`).

## How it works

The data is split across two endpoints, so the pipeline runs in two steps:

1. **Market scan (always fresh).** Page through `/coins/markets?vs_currency=usd&order=volume_desc&per_page=250` and apply the cheap filters (market cap, FDV, volume, supply). Rows are deduplicated by `id`, because rankings can shift between page requests.
2. **Details (persisted).** `preview_listing` and TVL change slowly, so they are stored in SQLite (table `coins(id, preview_listing, tvl_usd, checked_at)`). `/coins/{id}` is called **only** for candidates that are missing from the DB or whose `checked_at` is older than `DETAILS_TTL_SECONDS` (default 6h). The call uses `localization/tickers/community_data/developer_data/sparkline=false` to keep payloads small. Each result is upserted as soon as it arrives, so an interrupted cold start keeps its progress.
3. **Combine.** The fresh market rows are joined with the stored details, and the `preview_listing` and TVL rules are applied. Prices, volume, market cap and supply therefore always come from the latest scan.

**Why `order=volume_desc`.** Sorting by volume gives an exact early exit. Once the last coin on a page has volume ≤ $50k, no later coin can pass, so paging stops; today that happens at page 11 (about 2,750 coins). I also considered `market_cap_desc`, using the fact that mcap ≤ FDV means coins with mcap ≥ $100M can't pass. But those coins come *first* in that order, so it skips nothing up front and has no point where you can stop. `MAX_PAGES` (default 12) is a safety cap.

**Rate limiting.** CoinGecko is protected by three layers:
- an `asyncio.Semaphore` caps concurrency (`CONCURRENCY=5`)
- a minimum interval between request starts (`MIN_REQUEST_INTERVAL=0.67s`, about 1.5 req/s, under the Demo plan's ~100/min)
- retries on 429/5xx/network errors with exponential backoff, using `Retry-After` when present (capped at 60s)

**Caching (stale-while-revalidate).**
- The final result is cached in memory for `CACHE_TTL_SECONDS=300`. After that, the next request triggers a refresh: market pages, then details only for coins that need them.
- Requests never wait on CoinGecko. They get the cached snapshot, and a stale one triggers **one** background refresh. Single-flight: concurrent requests can't start a second refresh. `meta.stale` and `meta.refreshing` show the state.
- If a refresh fails, the previous snapshot is still served, with `meta.last_error` set.
- **SQLite access** uses stdlib `sqlite3`, synchronous, with a fresh connection per call. Calls run via `asyncio.to_thread`, so the event loop never blocks on disk. Each call is a tiny read or an upsert of one row, which keeps the code simple and avoids sqlite3's same-thread restriction for connections. No ORM and no extra dependencies.

## Assumptions

- **Null means fail.** A null in any filtered field (`market_cap`, `fully_diluted_valuation`, `total_volume`, `max_supply`, `total_supply`, `total_value_locked`, `preview_listing`) excludes the coin. Coins with no max supply ("infinite") therefore never pass the supply rule.
- **Supply equality** uses `math.isclose(max_supply, total_supply, rel_tol=1e-6)`, i.e. they may differ by at most one part per million, to absorb float noise. This is configurable as `SUPPLY_REL_TOL`.
- **TVL shape.** On the live API, `total_value_locked` is `null` or a per-currency object (`{"btc": ..., "usd": ...}`); we use the `usd` value. A plain number is also accepted.
- **Thresholds are strict** (`>` and `<`) and in USD (`vs_currency=usd`).
- **Detail freshness.** `preview_listing` and TVL can be up to `DETAILS_TTL_SECONDS` (6h) old. All market fields are at most `CACHE_TTL_SECONDS` old.
- **Coverage.** The "universe" is what `/coins/markets` returns. Coins that endpoint omits can't be found.

## Limitations

- **The result is currently empty.** Full run on 2026-10-08: 2,748 coins scanned, 692 passed the cheap filters, 107 of those have TVL above $50k, and **0 are preview-listed**. So nothing passes, and `preview_listing` is the limiting criterion.
- **Unverified:** whether preview-listed coins appear in `/coins/markets` at all. If they don't, no pipeline built on `/coins/markets` can find them. Confirming this needs a known preview-listed coin id, or a detail scan of a much wider set.
- The very first scan takes about 8 minutes on the Demo plan (~690 detail calls). After that, SQLite makes restarts fast. Keyless use is not practical.
- The result cache is in-process and the DB is a local file. Fine for one process; several workers would each refresh on their own (they'd share the SQLite file, though). A real deployment would use Postgres or Redis plus a single scheduled refresher.
- `MAX_PAGES` caps coverage if the volume cutoff ever moves past page 12.

## What's done

- [x] Backend: FastAPI, async httpx client, two-step filter pipeline, caching, rate limiting, retries, CORS, `/health`
- [x] SQLite persistence for coin details: fast restarts, and only stale or new coins are re-checked
- [x] Unit tests (no network; temp DB) for the filters, the client's paging/retries, the store, the combine step, and the service pipeline including the restart path
- [ ] Frontend: TODO in this backend session (see `frontend/NOTES.md`)

## Next steps

- Build the frontend: table, loading/warming state driven by `503` + `Retry-After`, and an empty state that shows `meta` counts.
- Periodic background refresh, so the cache is never stale when a request comes in.
- Find a known preview-listed coin to settle the open question above, and add a fallback source if needed.
