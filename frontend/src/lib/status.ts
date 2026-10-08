import type { FunnelStep, ProjectsResponse } from "@/lib/types";

/**
 * What the page is doing right now. Warming (cold start) and scanning are expected states, not errors:
 * they never show red or a Retry button.
 */
export type Phase = "loading" | "warming" | "scanning" | "refreshing" | "stale" | "live" | "error";

export function getPhase(data: ProjectsResponse | null, error: { warming: boolean } | null): Phase {
  if (error && !error.warming) return "error";
  if (!data) return error ? "warming" : "loading";
  if (data.meta.refreshing) return data.items.length ? "refreshing" : "scanning";
  return data.meta.stale ? "stale" : "live";
}

/** Funnel steps that apply: the preview_listing step is dropped when that rule is ignored. */
export function activeSteps(funnel: FunnelStep[], requirePreview: boolean): FunnelStep[] {
  return funnel.filter((s) => requirePreview || s.key !== "preview_listing");
}

/** The first step that leaves 0 coins, with the step before it (what reached it). */
export function bottleneck(steps: FunnelStep[]): { before: FunnelStep; step: FunnelStep } | null {
  const i = steps.findIndex((s, i) => i > 0 && s.passed === 0);
  return i > 0 ? { before: steps[i - 1], step: steps[i] } : null;
}
