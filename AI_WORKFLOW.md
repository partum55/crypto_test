# AI workflow notes

Tool: Claude Code (Claude Opus 5.5). I wrote the brief; the AI planned, generated code, and ran checks. I reviewed and steered the work at the plan stage.

## What was generated
- Project scaffold with `uv` (`uv init --app --no-package`, `uv add ...`). Python pinned to 3.12 with `requires-python >=3.11`.
- All backend code: `config.py`, `schemas.py`, `api/routes.py`, and `services/{coingecko,filters,details_store,projects}.py`.
- Tests: `tests/` (filters, client paging/retries via `httpx.MockTransport`, SQLite store and combine step on a temp DB, service pipeline and restart path with a fake client, `/health`).
- `README.md` and this file.

## What was verified against the real API (before writing code)
- `/coins/{id}` (bitcoin, aave, lido-dao):
  - `preview_listing` is a **top-level** boolean.
  - `market_data.total_value_locked` is `null` (bitcoin) or a **per-currency object** `{"btc": ..., "usd": ...}` (aave, lido-dao). It was never a plain number in our samples; the code still accepts one.
- `/coins/markets`:
  - keys include `market_cap, fully_diluted_valuation, total_volume, total_supply, max_supply`
  - per the docs, `per_page` accepts 1–250 and `order` supports `volume_desc`
  - there is no parameter for preview listings
- Volume distribution with `order=volume_desc`: the last coin per page dropped below $50k at **page 11** (about 2,750 coins), so the early-exit idea works and `MAX_PAGES=12` covers it.
- Duplicates: the first keyless probe saw 2,750 rows but only 2,742 unique ids, so ranks shifting between page requests is real. Rows are deduplicated by `id`.
- Prefilter size: **~690 candidates** survive the cheap filters (689 and 692 on two runs). That is about 690 detail calls per cold scan. This finding drove the background-warm and stale-while-revalidate design.
- Keyless access hit 429 after roughly 5–6 quick calls, so a Demo key is effectively required.

## Corrections and decisions made along the way
- **Ordering.** The brief suggested `market_cap_desc` (mcap ≤ FDV means mcap ≥ $100M can't pass). I checked: in descending order those coins come first, so it can't skip or stop early. I switched to `volume_desc`, which gives an exact stopping point.
- Dropped a planned "mcap ≤ FDV" prefilter, because FDV < $100M is already checked directly.
- **First request.** Originally it would have blocked for minutes. Changed to: warm in the background at startup, return `503 + Retry-After` until the first scan is done, then serve the cached result while refreshes run (`meta.stale`, `meta.refreshing`).
- Added a minimum-interval rate limiter on top of the semaphore and retries.
- **`uv init --app` packaging.** In uv 0.12 it created a packaged `src/` layout, so I re-ran it with `--no-package` to match the target structure.
- `asyncio.TaskGroup` wraps failures in an `ExceptionGroup`. The service now unwraps it so the route still returns a clean 503/502.
- Added `meta.preview_listed` and `meta.tvl_above_min` after the first full run returned 0 matches, so the empty result can be explained.
- **SQLite for details (my follow-up request).** The in-memory detail cache was replaced by `backend/data/coins.db` (stdlib `sqlite3`, run via `asyncio.to_thread`). As a result `services/cache.py` was removed: the final result is the in-memory snapshot in `projects.py`, and details live in SQLite. This is a deliberate deviation from the original target structure.

- **`require_preview` and `meta.funnel` (my follow-up request).** The preview rule is now applied per request from the cached snapshot. `require_preview=false` is documented as a deviation for inspecting the pipeline.
- **Checking the README citation.** The support page I cited is behind Cloudflare (403 for plain fetches), so the AI read it through the help center's public JSON API (`/api/v2/help_center/en-us/articles/<id>.json`). That confirmed the "if your token has not launched yet" wording. It also found the linked preview-listing guide, which says preview-listed tokens "will not track price data immediately". Both are quoted in the README as evidence, not as a confirmed fact about the API.

## Measured results (Demo key, 2026-10-08)
- Full run: 2,748 coins scanned on 11 pages → 692 passed the cheap filters → 107 with TVL > $50k, **0 preview-listed** → **0 matches**. No 429s at 1.5 req/s.
- With `require_preview=false` (deviation): 107 coins (2,747 → 685 → 107 → 0 strict).
- Cold refresh (empty DB): **470.8 s**. Restart with a filled DB: **9.7 s** (11 market pages + 4 detail calls for newly qualifying coins). A second SQLite-backed cold run gave 690 candidates, 106 with TVL > $50k, 0 preview-listed.

## Not verified
- Whether preview-listed coins ever appear in `/coins/markets` at all. Among the ~690 coins that pass the cheap filters, none has `preview_listing == true`, but that doesn't show whether preview coins are excluded from `/coins/markets` entirely. I couldn't find a known preview-listed coin id to test with. Recorded as a limitation (see README).
