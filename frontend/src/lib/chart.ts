export type Point = [number, number]; // [unix ms, value]

export type Geometry = {
  /** SVG path data in a W x H box (draw with preserveAspectRatio="none"). */
  line: string;
  area: string;
  /** Position of point i in percent of the box, for HTML overlays (labels, hover). */
  at: (i: number) => { x: number; y: number };
  minIdx: number;
  maxIdx: number;
};

export const W = 1000;
export const H = 300;

/** Line/area geometry for a time series. Y is padded so the line never touches the edges. */
export function geometry(points: Point[]): Geometry | null {
  if (points.length < 2) return null;
  const t0 = points[0][0];
  const span = points[points.length - 1][0] - t0 || 1;
  let minIdx = 0;
  let maxIdx = 0;
  points.forEach(([, v], i) => {
    if (v < points[minIdx][1]) minIdx = i;
    if (v > points[maxIdx][1]) maxIdx = i;
  });
  const min = points[minIdx][1];
  const max = points[maxIdx][1];
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1;
  const lo = min - pad;
  const hi = max + pad;

  const x = (t: number) => ((t - t0) / span) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = points.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return {
    line,
    area: `${line}L${W},${H}L0,${H}Z`,
    at: (i) => ({ x: (x(points[i][0]) / W) * 100, y: (y(points[i][1]) / H) * 100 }),
    minIdx,
    maxIdx,
  };
}

/** Index of the point closest in time to a horizontal position (0..1 of the chart width). */
export function nearestIndex(points: Point[], frac: number): number {
  if (!points.length) return -1;
  const t0 = points[0][0];
  const target = t0 + Math.min(1, Math.max(0, frac)) * (points[points.length - 1][0] - t0);
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i][0] - target) < Math.abs(points[best][0] - target)) best = i;
  }
  return best;
}
