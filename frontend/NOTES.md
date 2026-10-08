# Frontend notes

## Run

```bash
cd frontend
cp .env.example .env.local   # optional; defaults to http://localhost:8000
npm install
npm run dev                  # http://localhost:3000 (backend CORS allows this origin)
```

Checks: `npm run lint`, `npm test` (pure functions in `src/lib`, `node:test`, no extra deps), `npm run build`.

`NEXT_PUBLIC_API_URL` is inlined at build time, so set it before `npm run build`.

## Features

- Lists projects from `GET {NEXT_PUBLIC_API_URL}/api/projects`. The browser calls only our backend. Coin logos are static images on CoinGecko's CDN, not API calls.
- **Screening funnel** (`meta.funnel`): how many coins are left after each step, as proportional bars.
- **Search:** trimmed, case-insensitive substring match on name **or symbol** (`eth` → Ethereum).
- **Max FDV**, in USD:
  - accepts shorthand: `500k`, `100M`, `1.5B`, `$2.5m`, `1,000,000` (case-insensitive; `$`, commas and spaces are ignored)
  - strict `<`
  - projects with null FDV are hidden while the limit is on
  - empty input means no limit; invalid or negative input is ignored and the hint says so
  - the hint repeats the parsed value in full ("Under $50,000,000")
- **Sort** by market cap or 24h volume, both directions, from the toolbar or by clicking the column headers. Both stay in sync and `aria-sort` is kept. Sorting works on a copy, and nulls always go last.
- **Toggle "Ignore preview-listing requirement (deviates from spec)"**: off by default and stored in the URL (`preview=ignore`) like the rest of the list state. It appears in the toolbar, and in the empty state when the strict result is 0. Turning it on refetches with `?require_preview=false`, so the backend skips only the preview-listing rule. A notice then says the list deviates from the spec, and the funnel shows the preview step as "Ignored".

- **List state in the URL:** `q`, `fdv`, `sort`, `dir` and `preview=ignore`, with defaults left out (`src/lib/listState.ts`, tested). The state is read from the URL once on mount and kept in local state, so typing doesn't lag. Changes are written back with `window.history.replaceState`, which Next keeps in sync with `useSearchParams`. Coming back from a coin page (back link or browser Back) restores search, FDV, sort and the toggle.
- **Opening a coin:** the name cell holds a real `<Link>` (Tab to it, Enter opens the coin). For mouse users, a click anywhere on the row does the same. The link carries the list's query string to the coin page.

## Coin page (`/coins/[id]`)

- **Route:** `src/app/coins/[id]/page.tsx` renders `<CoinDetail />` inside `<Suspense>`. With `cacheComponents`, `useParams()` / `useSearchParams()` for an id that isn't known at build time must sit under Suspense, otherwise the build fails. The fallback is the same skeleton the page shows while loading, so the route prerenders as a static shell (◐ in the build output).
- **Data:** `GET /api/projects/{id}?days=1|7|30` via `fetchCoin`. A range change refetches, and the old chart stays visible (dimmed) until the new one arrives.
- **Content:**
  - back link to the list, carrying the list's search, sort and toggle;
  - logo, name and symbol;
  - 7 stats: price, market cap, FDV, 24h volume, TVL, max supply, total supply;
  - **Criteria** checklist with ✓/✗ for the six rules, headed "Fails N of 6 rules, so it's not in the strict list." Failed rules are bold, with a red ✗ and "Fails";
  - price chart with 1D / 7D / 30D.
- **Chart** (`PriceChart.tsx` plus the pure `src/lib/chart.ts`, tested):
  - inline SVG, no library: a line plus a light area fill, on a linear scale with 10% padding;
  - the SVG stretches with `preserveAspectRatio="none"` and a non-scaling stroke. Labels, dots and the tooltip are HTML positioned in percent, so text never distorts;
  - High label above its point and Low below. The last price and the % change over the range sit in the header above the chart, so labels can't collide;
  - hover, or tap on touch screens, shows a tooltip with date and price. The chart is focusable: arrow keys, Home and End step through points, read out through an `aria-live` region;
  - thin volume bars below the line ("24h volume, peak $X");
  - `chart: null` shows a dashed placeholder with the `chart_error` text, and the rest of the page still works.
- **States:**
  - loading: skeleton with the same footprint as the page;
  - 404: "Coin not found in the current scan", with an explanation and the back link;
  - backend error: red block with Retry;
  - warm-up 503: neutral note and auto-retry.

## Why the strict result is 0

On the live data: 2,747 coins scanned → 685 pass the market filters → 107 have TVL > $50k → **0** have `preview_listing = true`.

Preview listings on CoinGecko are pre-launch tokens: they aren't trading yet, so they have no real 24h volume, and usually no TVL or a full supply either. The spec asks for a preview-listed coin that *also* has volume > $50k and TVL > $50k, and these conditions almost never hold together. An empty list is therefore the expected, correct answer, not a bug. The UI says this and shows the funnel step where the count drops to 0. The toggle lets a reviewer see the 107 coins that pass the other five rules, clearly labelled as a deviation.

## Design decisions

- **Direction: "the screen is the explanation."** The funnel at the top is the one prominent element and stays in every state. During warm-up it shows skeleton bars or scan progress, for an empty result it shows where coins drop out, and with data it puts the short list in context. Bar length is linear in the count (relative to coins scanned) so the bars stay honest; zero is drawn as a baseline tick, not a missing bar.
- **Labelled toolbar instead of the sentence-style controls.** A sentence made of inputs and selects depends on inline wrapping of controls whose widths vary by font, value and viewport. It broke with a lone "," and orphaned selects. A labelled grid (search / max FDV / sort, then the toggle) is predictable, scans faster and stacks cleanly at 375 px.
- **Colour carries meaning only.**
  - ink `#16213A`: text and bars
  - muted `#4F5D74`: secondary text
  - paper `#EEF1F4` / surface `#FFF`: page and inputs/table
  - rule `#C6CFDB`: dividers and skeletons
  - line `#7A8699`: input borders, ≥ 3:1
  - accent `#1F5F8B`: focus, active sort
  - signal `#8A5A00` (dot `#E0A100`): warming, refreshing, progress
  - error `#B3261E`: real failures only

  All text pairs are ≥ 5.2:1 (WCAG AA).
- **Type:** Public Sans via `next/font` (self-hosted at build). I switched from Schibsted Grotesk because its tabular figures also make commas and periods fixed-width ("2 , 750"). Scale: 12/14/16/20/28–36. Numbers are right-aligned with `tabular-nums`.
- **Motion:** only the status dot pulses and the progress bar animates. Both are disabled under `prefers-reduced-motion`. Skeletons are static.
- **States:**
  - **Loading:** "Connecting to backend". Skeleton funnel, plus table header with 5 skeleton rows, so nothing jumps when data arrives. Controls are disabled.
  - **Warming** (503 whose `detail` contains "warming"): amber "Warming up" and a neutral note. No red and no Retry; it auto-retries every 5 s.
  - **Scanning** (200 + `refreshing` + 0 items): the empty verdict is held back, and the last funnel step shows `meta.progress` ("Checked 340 of 692 candidates").
  - **Refreshing** (data + `refreshing`): table stays; status reads "Refreshing, 120 of 692 checked".
  - **Error** (unreachable, timeout, 502, non-warming 503): red block with the message and **Retry**, and status "Not updating". Earlier data stays visible with "Showing data from HH:MM". With no data, the table says so instead of showing skeletons that would look like loading.
  - **Empty from backend:** the steps from `meta.funnel` with the zero step in bold, a sentence naming where the count hit 0 and why, and the toggle.
  - **Empty after your filters:** "None of the 4 projects match “zzz” and have FDV under $5M." plus **Clear filters**.
  - **Mobile:** the table scrolls inside its own frame with a sticky Project column; the page never scrolls sideways.
- Phase logic (`src/lib/status.ts`) and the funnel bottleneck are pure functions with unit tests.

## Other assumptions

- **Filtering/sorting on the client.** The backend owns the required criteria (and the preview toggle, since it needs data the client doesn't have). The UI owns user-driven refinements on a short list (`useMemo` over pure functions in `src/lib/query.ts`), so there are no extra round-trips.
- **Polling.** One `useEffect` loop per mount, retry or toggle change. It re-fetches every 5 s while `meta.refreshing` is true or while warming. The cleanup aborts the request and clears the timer, so React StrictMode's double mount leaves one loop.
- Numbers are typed `number | null` and render as "—". `stale`, `refreshing`, `cached`, `progress`, `funnel` and `require_preview` are optional. Without `funnel`, the UI falls back to `scanned` / `after_prefilter` / `after_details`.
- Time (`fetched_at`) is only rendered after the client fetch, so there's no hydration mismatch.

## Contract notes for the backend

- `meta.funnel` is consumed as an ordered array `[{key, label, passed}]`, with `passed` cumulative. Labels are shown verbatim. `preview_listing = true` reads technical; a label such as "On CoinGecko's preview listing" would read better.
- `meta.progress: {checked, total}` is optional and rendered when present. The backend doesn't send it yet.
- A 503 is treated as warm-up only when `detail` contains "warming". Other 503s are real errors with Retry.
- `meta.cached` is not sent. Extra fields (`coingecko_url`, `detail_errors`, `age_seconds`, `last_error`, `preview_listed`, `tvl_above_min`, …) are ignored.

### Coin detail: what we agreed vs. what the backend ships

The agreed shape (in `lib/types.ts`):
`{ project, passes: [{key, label, passed}], chart: {days, prices, total_volumes} | null, chart_error }`, with 404 → `{detail}`.

The real `GET /api/projects/{id}` (backend commit `bbeeefa`) differs:

| Agreed | Shipped |
|---|---|
| `passes` as an ordered array with labels | `passes` as an object `{market_cap, fdv, volume, supply, tvl, preview_listing: bool}`, without labels |
| `chart.total_volumes` | `chart.volumes` |
| top-level `chart_error` | `meta.chart_error` |
| — | `null` values inside `prices` / `volumes` |
| — | extra `details` and `meta.chart_cached` (ignored) |

The 404 matches: `{"detail": "Unknown coin id '…' (not in the current market scan)"}`.

I did not change the backend. `src/lib/coin.ts` (`normalizeCoin`, tested) accepts both shapes and drops null points. For the object form, the frontend supplies the six rule labels. Once the backend settles on one shape, the other branch can go.

## Limitations

- No dark mode, and no pagination or virtualization (the list is at most about 100 rows).
- The chart range (1D/7D/30D) isn't in the URL; reopening a coin starts at 7D.
- After the toggle in the empty state is clicked, the empty state is replaced by results, so keyboard focus returns to the page. The toolbar toggle shows the new state.
- `NEXT_PUBLIC_API_URL` is fixed at build time.

## Next steps

- Show `meta.last_error` when a background refresh fails.
- Link the coin page to `coingecko_url`, and add Playwright component tests for the states (the screenshot scripts below are a manual check, not shipped).

## AI workflow

- **Generated:**
  - v1: scaffold, `lib/`, components.
  - v2 (this redesign): design proposal, Funnel, toolbar, phase logic, preview toggle, NOTES.
  - v3: coin page (route, `CoinDetail`, `PriceChart`, `chart.ts`), list state in the URL (`listState.ts`), row links, response adapter (`coin.ts`).
  - All written with Claude Code.
- **Verified:**
  - lint, `npm run build`, and `npm test` with 12 tests:
    - search, FDV strict `<` and shorthand, sort;
    - phases, funnel bottleneck;
    - URL state round-trip;
    - chart geometry, nearest point;
    - both detail response shapes.
  - A Playwright script outside the repo (mocks live only there) took screenshots at 1280 and 375 px of: loading, warming, scanning + progress, refreshing + progress, error unreachable, 502 with earlier data, empty from backend with funnel, empty without funnel, toggle on, empty after filters, data + header-click sort, keyboard focus. I looked at each one. The page never scrolls sideways at 375 px.
  - Against the live backend: strict result 0 with the real funnel, the toggle requests `?require_preview=false` and shows 107 rows, and requests go only to `localhost:8000` (plus the logo CDN).
  - Coin page against the live backend (`origin-protocol`, reached via the list with `preview=ignore`), at 1280 and 375 px:
    - a row click opens `/coins/origin-protocol?…list params…`;
    - the back link restores search, toggle and sort;
    - requests go only to `localhost:8000` (plus the logo CDN);
    - no horizontal scroll.

    Screenshots I looked at: 7D, 1D, 30D, hover, touch tap (375), and from fake responses: loading, chart `null`, 502 error, plus the real 404.
- **Corrected after looking at screenshots:**
  - Sort selects overflowed by 183 px (`w-full` beat `w-auto`).
  - Funnel bars were centred on multi-line labels.
  - Schibsted's tabular punctuation, so I switched to Public Sans.
  - Wrapped sort headers on mobile.
  - Disabled selects looked enabled.
  - Skeleton rows during an error looked like loading.
  - The funnel path in the empty state wrapped mid-step.
  - The first mock for "502 with data" was wrong: StrictMode's aborted request used up the data response.
  - Coin page:
    - The empty tooltip at 375 px was a script bug: the chart was below the viewport and `mouse.move` there fires nothing. Fixed by scrolling it into view.
    - A tap on touch screens didn't show the tooltip: there's no `pointermove` and `pointerleave` cleared it right away. Fixed with `onPointerDown` and keeping the point after a touch.
    - `touch-none` on the chart would have blocked page scrolling on phones; it's `touch-pan-y` now.
    - The "Last" label collided with "High" when the high was near the end, so the last price moved to the chart header.
    - An empty grey cell in the 7-stat grid at 2 and 4 columns, in both the page and the skeleton.
    - A missing period in the chart-error text.
