import type { CoinDetail, ProjectsResponse } from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }

  /** The backend has no snapshot yet (cold start). Expected, not a failure. */
  get warming(): boolean {
    return this.status === 503 && /warm/i.test(this.message);
  }
}

/** GET a JSON path from our backend; network, timeout and non-2xx responses become ApiError. */
async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      cache: "no-store",
    });
  } catch (err) {
    if (signal.aborted) throw err; // caller cancelled, not a backend problem
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(`Backend did not respond within ${TIMEOUT_MS / 1000} s.`);
    }
    throw new ApiError(`Backend is not reachable at ${API_URL}. Start it and retry.`);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status);
  }
  return body;
}

/** requirePreview=false asks the backend to skip only the preview_listing rule (a deviation from the spec). */
export async function fetchProjects(signal: AbortSignal, requirePreview = true): Promise<ProjectsResponse> {
  const body = (await getJson(`/api/projects${requirePreview ? "" : "?require_preview=false"}`, signal)) as ProjectsResponse;
  if (!Array.isArray(body?.items) || !body.meta || typeof body.meta !== "object") {
    throw new ApiError("Backend sent an unexpected response.");
  }
  return body;
}

/** One coin with its rule checks and a price chart over `days`. 404 = not in the current scan. */
export async function fetchCoin(id: string, days: number, signal: AbortSignal): Promise<CoinDetail> {
  const body = (await getJson(`/api/projects/${encodeURIComponent(id)}?days=${days}`, signal)) as CoinDetail;
  if (!body?.project || !Array.isArray(body.passes)) {
    throw new ApiError("Backend sent an unexpected response.");
  }
  return body;
}
