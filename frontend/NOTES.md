# Frontend notes

## Run

```bash
cd frontend
cp .env.example .env.local   # optional; defaults to http://localhost:8000
npm install
npm run dev                  # http://localhost:3000 (backend CORS allows this origin)
```

Checks: `npm run lint`, `npm test` (pure query functions, `node:test`, no extra deps), `npm run build`.

`NEXT_PUBLIC_API_URL` is inlined at build time, so set it before `npm run build`.

## Features

- Lists projects from `GET {NEXT_PUBLIC_API_URL}/api/projects`. The browser calls only our backend. Coin logos are static images on CoinGecko's CDN, not API calls.
- Search: trimmed, case-insensitive substring match on name **or symbol** (`eth` → Ethereum).
- Max FDV filter in USD: strict `<`. Projects with null FDV are hidden while the filter is on. Empty input means no filter. Invalid or negative input is ignored and an inline hint says so. Commas and spaces are allowed (`1,000,000`), and so is JS number syntax such as `1e9`.
- Sort by market cap or 24h volume, both directions. Sorting works on a copy, and nulls always go last.
- States:
  - loading
  - error with Retry. 502/503 show the backend `detail`. If the backend is down: "Backend is not reachable at <url>". Requests time out after 30 s.
  - backend refreshing or stale
  - backend returned 0 projects, explained with `meta` (scanned / after_prefilter / after_details)
  - 0 left after local filters, with a Clear filters button

## Assumptions and decisions

- **Filtering/sorting on the client.** The backend owns the 6 required criteria. The UI owns user-driven refinements on a small list (`useMemo` over pure functions in `src/lib/query.ts`), so there are no extra round-trips and no extra backend params.
- **Polling.** One `useEffect` loop per mount or retry. While `meta.refreshing` is true it re-fetches every 5 s and stops when it turns false. It does the same on **503**, because the backend answers 503 "Data is warming up" before its first snapshot exists. The cleanup aborts the in-flight request (`AbortController`) and clears the timer, so React StrictMode's double mount leaves one loop.
- If a poll fails after data has loaded, the last data stays visible under the error.
- Numbers are typed `number | null` and render as "—" when missing. `stale`, `refreshing` and `cached` are optional.
- Time (`fetched_at`) is only rendered after the client fetch, so there's no server/client hydration mismatch.
- Plain `<img>` for logos instead of `next/image` (avoids `remotePatterns` config).
- Design: one font (Schibsted Grotesk, self-hosted by `next/font` at build time), cool light palette, and controls written as one sentence ("Show projects matching … with FDV under $… by …"). Tabular figures in the table.

## Contract vs. current backend (`backend/app/schemas.py`)

- `meta.cached` is not sent. The UI doesn't use it.
- The backend also sends `coingecko_url`, `meta.detail_errors`, `age_seconds` and `last_error`. These are ignored and not typed.
- The backend returns 503 + `Retry-After: 30` until its first snapshot is ready. The UI handles this with the auto-retry described above.

## Limitations

- No dark mode, no pagination or virtualization (the list is small), and filters aren't kept in the URL.
- `NEXT_PUBLIC_API_URL` is fixed at build time.

## Next steps

- Persist search, FDV and sort in query params.
- Show `meta.last_error` when a background refresh fails.
- Sortable column headers, a link to `coingecko_url`, and component tests (e.g. Playwright) for the states.

## AI workflow

- **Generated:** the scaffold (create-next-app), `lib/` (types, api, query, format, test), the four components, and these notes. All written with Claude Code from the agreed contract.
- **Verified:**
  - lint, `npm test`, `npm run build`, and `tsc`.
  - Playwright run against `next dev`:
    - backend blocked: "not reachable" error, then Retry loads data
    - real backend warming (503) and then live: real data returned 0 projects, and the empty state shows its meta numbers
    - mocked responses: 503 → auto-retry; `refreshing` polling every 5 s, stopping when it turns false (one loop under StrictMode); both sorts in both directions with nulls last; search `  ETH `; FDV strict `<`; invalid and negative FDV ignored; filtered-empty + Clear filters
    - 375 px width with no horizontal page scroll
  - Network: requests only to `localhost:3000` and `localhost:8000`.
- **Corrected:**
  - `node --test <dir>` didn't pick up `.ts` files. Switched to a glob and enabled `allowImportingTsExtensions`.
  - Tabular figures spaced out the header time, so they're limited to the table.
  - Read the backend and found the 503 warm-up response, so 503 now triggers auto-retry.
