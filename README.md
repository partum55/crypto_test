# Crypto Projects Filter

A FastAPI backend that scans CoinGecko for coins matching **all six** criteria below, and a Next.js frontend that lists them. The browser talks only to our backend, never to CoinGecko.

| Criterion | CoinGecko source | Rule |
|---|---|---|
| Market cap > 0 | `/coins/markets` `market_cap` | strict `>` |
| FDV < $100M | `/coins/markets` `fully_diluted_valuation` | strict `<` |
| 24h volume > $50k | `/coins/markets` `total_volume` | strict `>` |
| Max supply = total supply | `/coins/markets` `max_supply`, `total_supply` | `math.isclose(rel_tol=1e-6)` |
| On the preview listing | `/coins/{id}` top-level `preview_listing` | `is True` |
| TVL > $50k | `/coins/{id}` `market_data.total_value_locked` | strict `>` (USD) |

> **Heads-up:** with live data the strict result is **0 coins**. That's expected, not a bug; see [Why the strict result is 0](#why-the-strict-result-is-0).

## How to run

### Prerequisites

- [uv](https://docs.astral.sh/uv/). It installs Python 3.12 automatically (pinned in `backend/.python-version`).
- Node.js **22.18+** (Next.js needs 20.9+; `npm test` uses Node's built-in TypeScript stripping). Developed on Node 24.
- A free **CoinGecko Demo API key** ([get one here](https://www.coingecko.com/en/api/pricing)). Without a key, CoinGecko rate-limits after a handful of calls, and a full scan needs about 700.

### Backend (port 8000)

```bash
cd backend
cp .env.example .env          # then set COINGECKO_API_KEY=CG-...
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

- API: <http://localhost:8000/api/projects>
- Swagger docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/health>

On startup the server **warms its cache in the background**. Until the first scan finishes, `/api/projects` answers `503` with `Retry-After: 30`; the frontend shows this as "Warming up" and retries by itself.

| Start | What happens | Measured (Demo key) |
|---|---|---|
| First ever (empty DB) | 11 market pages + ~690 `/coins/{id}` calls | **~471 s** (about 8 min) |
| Restart / later refreshes | 11 market pages + only new or stale coins | **~10 s** |

Coin details are stored in `backend/data/coins.db` (SQLite, gitignored). Delete it to force a full re-check. All settings (thresholds, TTLs, rate limits) are in `backend/.env.example`.

### Frontend (port 3000)

```bash
cd frontend
cp .env.example .env.local    # optional; NEXT_PUBLIC_API_URL defaults to http://localhost:8000
npm install
npm run dev                   # http://localhost:3000 (the backend's CORS allows this origin)
```

`NEXT_PUBLIC_API_URL` is inlined at build time, so set it before `npm run build` / `npm start`.

### Tests and checks

| Where | Command | What it covers |
|---|---|---|
| backend | `uv run pytest` | 43 tests, no network (fake clients, temp SQLite DB) |
| backend | `uv run ruff check .` / `uv run ruff format --check .` | lint / formatting |
| frontend | `npm test` | 10 tests on the pure logic in `src/lib` (`node:test`, no extra deps) |
| frontend | `npm run lint` / `npm run build` | ESLint / production build (incl. type check) |

## What I completed

### Backend (`backend/`)

- **Filter pipeline:** a market scan (`/coins/markets`, sorted by volume with an exact early exit), then details (`/coins/{id}`) only for the ~690 candidates that pass the cheap filters.
- **Persistence:** coin details are stored in SQLite and re-checked only when missing or older than 6h, so restarts take ~10 s instead of ~8 min.
- **Caching:** stale-while-revalidate with single-flight refresh. Requests never wait on CoinGecko, and a failed refresh keeps serving the last snapshot (`meta.last_error`).
- **Rate limiting:** a concurrency semaphore, a minimum interval between requests, and retries with backoff that honour `Retry-After`.
- **`GET /api/projects`** returns the matches plus `meta`, which explains the result. It includes a cumulative `funnel` showing how many coins survive each step.
- **`?require_preview=false`:** a clearly labelled deviation from the spec that skips only the preview-listing rule. It's served from the same snapshot with no extra CoinGecko calls.
- **`GET /api/projects/{id}?days=1|7|30`:**
  - per-rule pass/fail, so you can see why a coin isn't in the list;
  - a price/volume chart, cached and downsampled;
  - an allow-list: only ids from the current scan are accepted, so the backend can't be used as an open CoinGecko proxy.
- **One typed contract:** `backend/app/schemas.py` and `frontend/src/lib/types.ts` mirror each other field for field, with closed key sets. Every rule and funnel label is built once from the threshold settings, so neither side hardcodes `$100M` or `$50k`.
- **Tests:** filters, client paging and retries, the SQLite store, the pipeline including the restart path, the query param, and the detail endpoint (404, 422, `passes`, chart cache, chart failure, null points).

### Frontend (`frontend/`, Next.js 16 App Router, TypeScript, Tailwind; no UI libraries)

- **Project list** from `GET /api/projects`, with a **screening funnel** on top: proportional bars of coins left after each filter, so it's clear at a glance what the list is and why it's short or empty.
- **Search** by name or symbol: partial, case-insensitive and trimmed (`eth` → Ethereum).
- **Max FDV filter** in USD:
  - strict `<`;
  - accepts shorthand: `500k`, `100M`, `1.5B`, `$2,000,000`;
  - echoes the parsed value ("Under $50,000,000");
  - ignores invalid input and says so.
- **Sorting** by market cap or 24h volume, ascending or descending, from the toolbar or by clicking the column headers (kept in sync, with `aria-sort`).
- **Preview-listing toggle** "Ignore preview-listing requirement (deviates from spec)": off by default, in the toolbar and in the empty state. When on, a notice says the list deviates from the spec.
- **State in the URL** (`q`, `fdv`, `sort`, `dir`, `preview`), so going to a coin and back keeps the search, sort and toggle.
- **Coin page** `/coins/[id]`:
  - stats: price, market cap, FDV, volume, TVL, supplies;
  - a ✓/✗ **Criteria** checklist showing which rules the coin fails;
  - an inline-SVG **price chart** (1D / 7D / 30D) with high/low labels, last price and % change, volume bars, and a hover/tap/keyboard tooltip;
  - if the chart can't load, the reason is shown and the rest of the page still works.
- **Every real state handled:**
  - loading skeletons with the same footprint as the content;
  - "warming up" (neutral, auto-retry);
  - a scan in progress;
  - refreshing (polls every 5 s and stops when done);
  - real errors (red, with **Retry**);
  - backend-empty (explained with the funnel);
  - empty after your filters (**Clear filters**);
  - coin not found (404).
- **Accessibility and layout:**
  - WCAG AA contrast;
  - visible focus;
  - `prefers-reduced-motion` respected;
  - right-aligned tabular numbers;
  - a real `<Link>` per row, plus click anywhere on the row;
  - at 375 px the page never scrolls sideways (the table scrolls in its own frame with a sticky name column).

## Assumptions

- **Null means fail.** A null in any filtered field excludes the coin. Coins with no max supply ("infinite") never pass the supply rule.
- **Supply equality** allows a difference of at most one part per million (`math.isclose`, `SUPPLY_REL_TOL`), to absorb float noise.
- **TVL** comes back from CoinGecko as `null` or a per-currency object; the `usd` value is used. A plain number is also accepted.
- **Thresholds are strict** (`>`, `<`) and in USD.
- **Freshness:** market fields are at most 5 min old (`CACHE_TTL_SECONDS`); `preview_listing` and TVL at most 6 h (`DETAILS_TTL_SECONDS`).
- **Coverage:** the coin universe is what `/coins/markets` returns.
- **Filtering and sorting in the browser.** The backend owns the six required criteria. Search, the FDV limit and sorting are user refinements on a short list (at most ~100 rows), so they run client-side with no extra round-trips.
- **FDV filter:** empty input means no filter; projects with a null FDV are hidden while it's on.
- **Search** matches the symbol as well as the name.
- **Logos** are static images on CoinGecko's CDN, loaded with a plain `<img>`. They are not API calls.

## Why the strict result is 0

Measured on 2026-10-08 with a Demo key:

| Step | Coins remaining |
|---|---|
| Scanned on `/coins/markets` (stopped at the volume cutoff) | 2,747 |
| Market cap > 0, FDV < $100M, volume > $50k, max = total supply | 685 |
| TVL > $50k | 107 |
| On the preview listing | **0** |

None of the 685 market-filtered candidates is on the preview listing, regardless of TVL.

This is expected. The evidence below is our reading of CoinGecko's docs, not something CoinGecko states about the API field:

- CoinGecko offers Preview Listing *"if your token has not launched yet"*, while an active listing *"must be actively tradable"* ([listing guide](https://support.coingecko.com/hc/en-us/articles/7291312302617)).
- A preview-listed token *"will not track price data immediately"* ([preview-listing guide](https://support.coingecko.com/hc/en-us/articles/40576012083097)).
- So a preview-listed coin most likely isn't trading yet. "On the preview listing **and** 24h volume > $50k (and TVL > $50k)" is close to contradictory.

The UI explains this in the empty state and names the step where the count hits 0. The **deviation toggle** (`?require_preview=false`) shows the 107 coins that pass the other five rules, so the rest of the pipeline can be inspected. It is clearly labelled as **not the spec**; the default is the spec.

## Limitations

- **Unverified:** whether preview-listed coins appear in `/coins/markets` at all. If they don't, no pipeline built on that endpoint can find them. Settling this needs a known preview-listed coin id.
- **Cold start:** the very first scan takes ~8 min on the Demo plan; keyless use is impractical.
- **Single process:** the result cache is in-process and the DB is a local SQLite file. A real deployment would use Postgres/Redis plus one scheduled refresher.
- **Coverage cap:** `MAX_PAGES` (12) limits coverage if the volume cutoff ever moves past page 12.
- **Frontend:**
  - no dark mode;
  - no pagination or virtualization (not needed at ≤ ~100 rows);
  - the chart range isn't stored in the URL;
  - `NEXT_PUBLIC_API_URL` is fixed at build time.
- **Testing:** UI states were verified manually with Playwright screenshots, using a script kept outside the repo. There are no automated component tests.

## API reference

`backend/app/schemas.py` and `frontend/src/lib/types.ts` define the same models; change them together.

### `GET /api/projects[?require_preview=false]`

```json
{
  "count": 1,
  "items": [{
    "id": "...", "symbol": "...", "name": "...", "image": "https://...",
    "coingecko_url": "https://www.coingecko.com/en/coins/...",
    "current_price": 0.12, "market_cap": 1200000.0, "fully_diluted_valuation": 1200000.0,
    "total_volume": 80000.0, "total_supply": 10000000.0, "max_supply": 10000000.0,
    "total_value_locked": 75000.0, "preview_listing": true
  }],
  "meta": {
    "scanned": 2747, "pages_fetched": 11, "after_prefilter": 685,
    "preview_listed": 0, "tvl_above_min": 107, "after_details": 0,
    "details_fetched": 3, "detail_errors": 0, "fetched_at": "2026-10-08T19:46:00Z", "age_seconds": 12.3,
    "stale": false, "refreshing": false, "last_error": null, "require_preview": true,
    "funnel": [
      {"key": "scanned", "label": "Scanned on CoinGecko markets", "passed": 2747},
      {"key": "market_filters", "label": "Market cap > 0, FDV < $100M, 24h volume > $50k, Max supply = total supply", "passed": 685},
      {"key": "tvl", "label": "TVL > $50k", "passed": 107},
      {"key": "preview_listing", "label": "On CoinGecko's preview listing", "passed": 0}
    ]
  }
}
```

- **An empty `items` list is a valid result.**
- `meta.funnel` is cumulative: coins left after each step.
- `meta.after_details` is always the strict count (all six criteria), even with `require_preview=false`.
- `503` means the cache is warming up, or CoinGecko kept rate-limiting; it comes with `detail` and `Retry-After`. `502` means CoinGecko failed.
- CORS allows `http://localhost:3000`. To serve the frontend elsewhere, set e.g. `CORS_ORIGINS=["http://localhost:3001"]` (a JSON list) in `backend/.env`.

### `GET /api/projects/{coin_id}?days=1|7|30`

```json
{
  "project": { "...": "same fields as list items; numbers may be null here" },
  "details": { "preview_listing": false, "tvl_usd": 12469538.0, "checked_at": "2026-10-08T19:55:16Z" },
  "passes": [
    {"key": "market_cap", "label": "Market cap > 0", "passed": true},
    {"key": "fdv", "label": "FDV < $100M", "passed": true},
    {"key": "volume", "label": "24h volume > $50k", "passed": true},
    {"key": "supply", "label": "Max supply = total supply", "passed": true},
    {"key": "tvl", "label": "TVL > $50k", "passed": true},
    {"key": "preview_listing", "label": "On CoinGecko's preview listing", "passed": false}
  ],
  "chart": { "days": 7, "prices": [[1790888400000, 0.0184]], "total_volumes": [[1790888400000, 16709522.9]] },
  "chart_error": null,
  "meta": { "fetched_at": "2026-10-08T20:17:07Z", "chart_cached": false }
}
```

- **Allowed ids:** only ids from the current scan (~2,750 coins). Others return `404`; `days` other than 1, 7 or 30 returns `422`.
- **`project`** comes from the cached scan. Its numbers can be `null` here, because any scanned coin is allowed, not only coins that passed.
- **`details`** is `null` if the coin was never checked via `/coins/{id}` (it failed the market filters).
- **The chart:**
  - comes from `/coins/{id}/market_chart`;
  - is cached for 10 min per `(id, days)`;
  - has null points dropped;
  - is downsampled to ≤ 200 points.
- **If the chart fails or times out (20 s),** the response is still `200`, with `chart: null` and `chart_error` holding the reason.

## How it works

**Backend pipeline:**

1. **Market scan.** Page through `/coins/markets?order=volume_desc&per_page=250` and apply the cheap filters (market cap, FDV, volume, supply). Rows are deduplicated by `id`, because rankings shift between page requests.
   - **Why volume order:** once a page's last coin has volume ≤ $50k, no later coin can pass, so paging stops exactly; today that's page 11.
   - **Why not market-cap order:** it puts the coins that can't pass first, so it never gives a point where you can stop.
2. **Details.** `/coins/{id}` is called only for candidates missing from SQLite or older than 6 h. Each result is upserted as soon as it arrives, so an interrupted cold start keeps its progress.
3. **Combine.** Fresh market rows are joined with the stored details, and the TVL rule is applied.
4. **Per request.** The preview rule is applied to the cached snapshot, which is why `require_preview=false` is free.

**Caching:**
- The snapshot is cached for 5 min.
- After that, the next request triggers **one** background refresh (single-flight) and is still answered from the cache (`meta.stale`, `meta.refreshing`).
- SQLite access uses stdlib `sqlite3` via `asyncio.to_thread`. No ORM.

**Frontend:**
- **Data and polling.** A client component fetches the backend with `AbortController` and a 30 s timeout. It polls every 5 s while the backend is warming or refreshing, and cleans up so React StrictMode leaves a single loop.
- **Testable logic.** Search, FDV parsing, sorting, page phases, URL state and chart geometry are pure functions in `src/lib`, each with unit tests.
- **Design.** "The screen is the explanation": the funnel is the one prominent element, and colour carries meaning only (amber = in progress, red = real failure, blue = interactive). Public Sans throughout.

## AI workflow

Built with Claude Code (Claude Opus 5.5). I wrote the briefs and reviewed plans and results. The AI planned, generated the code and ran the checks. Backend and frontend were built in parallel sessions against an agreed contract.

**My follow-up requests** (design changes I asked for after reviewing a result):
- Persist coin details in SQLite instead of an in-memory cache, so restarts take ~10 s instead of ~8 min.
- `require_preview` and `meta.funnel`, so an empty strict result can be explained and the rest of the pipeline inspected.
- The coin detail endpoint, allow-listed to scanned ids so it can't proxy arbitrary CoinGecko lookups.
- One typed contract on both sides, after the first detail response drifted from what the frontend expected.

**Verified against the real API before coding:**
- `preview_listing` is top-level.
- TVL is `null` or a per-currency object.
- `volume_desc` paging hits the $50k cutoff at page 11.
- Duplicate ids occur across pages.
- About 690 candidates survive the cheap filters, which drove the cached/background design.
- Keyless access hits 429 after ~5 calls.
- The `market_chart` shape.

**Corrections along the way:**
- Switched from `market_cap_desc` to `volume_desc`.
- The first request no longer blocks for minutes: warm-up in the background, with `503` until the first scan finishes.
- `TaskGroup` exception unwrapping.
- `IntEnum` for `days`, because `Literal` rejected valid values.
- Replaced the sentence-style controls with a labelled toolbar after they wrapped badly.
- Fixed several layout bugs found in screenshots (overflowing selects, chart label collisions, a stat-grid gap).
- Tap support for the chart tooltip.
- Replaced a frontend adapter with one typed contract after the first detail endpoint drifted from the agreed shape.

**Checked by hand:** Playwright screenshots of every UI state at 1280 and 375 px. The real backend was used where possible (live data, 404); fake responses were used for states that can't be produced on demand (loading, warm-up, errors, a missing chart). Network requests go only to `localhost:8000`, plus the logo CDN.

## Next steps

- A periodic background refresh, so the cache is never stale when a request arrives.
- Find a known preview-listed coin to settle whether `/coins/markets` includes them at all (e.g. diff `/coins/list` against the market ids).
- Show `meta.last_error` in the UI, add Playwright component tests, and keep the chart range in the URL.
