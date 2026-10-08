import type { ProjectsResponse } from "@/lib/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function fetchProjects(signal: AbortSignal): Promise<ProjectsResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/projects`, {
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

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status);
  }
  return res.json();
}
