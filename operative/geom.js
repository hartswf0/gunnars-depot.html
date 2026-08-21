// operative/geom.js — axis-aligned box algebra in inches, Z up.
// Coordinate frame discovered from assets/models/*.stl:
//   X = width  (shell 0..72)
//   Y = length (shell 0..144)
//   Z = height (deck top 14, wall top 76, roof 74.8..82.7)

export const TOL = 0.03; // inches: below this two faces are "touching", not "overlapping"

export const box = (p, s) => ({ p: [p[0], p[1], p[2]], s: [s[0], s[1], s[2]] });

export const min = (b, i) => b.p[i] - b.s[i] / 2;
export const max = (b, i) => b.p[i] + b.s[i] / 2;

export const lo = (b) => [min(b, 0), min(b, 1), min(b, 2)];
export const hi = (b) => [max(b, 0), max(b, 1), max(b, 2)];

/** Signed overlap on one axis. Positive = interpenetration depth. */
export function axisOverlap(a, b, i) {
  return Math.min(max(a, i), max(b, i)) - Math.max(min(a, i), min(b, i));
}

/** Interpenetration volume. 0 when merely touching or apart. */
export function overlapVolume(a, b) {
  let v = 1;
  for (let i = 0; i < 3; i++) {
    const o = axisOverlap(a, b, i) - TOL;
    if (o <= 0) return 0;
    v *= o;
  }
  return v;
}

/** Deepest interpenetration axis+depth, for describing a conflict in operational language. */
export function penetration(a, b) {
  let best = null;
  for (let i = 0; i < 3; i++) {
    const o = axisOverlap(a, b, i);
    if (o <= TOL) return null;
    if (!best || o < best.depth) best = { axis: 'xyz'[i], depth: o, i };
  }
  return best;
}

/** Contact: a sits on b (a's underside within TOL of b's top, footprints overlapping). */
export function seatedOn(a, b) {
  if (Math.abs(min(a, 2) - max(b, 2)) > 0.5) return 0;
  const ox = axisOverlap(a, b, 0);
  const oy = axisOverlap(a, b, 1);
  if (ox <= TOL || oy <= TOL) return 0;
  return ox * oy; // contact area, in²
}

/** Any-face contact (used for lateral bracing / bearing against a member). */
export function touching(a, b) {
  let touch = 0, gap = 0;
  for (let i = 0; i < 3; i++) {
    const o = axisOverlap(a, b, i);
    if (o < -0.5) return false;
    if (o <= TOL) touch++; else gap++;
  }
  return touch >= 1 && gap >= 2;
}

/** Clip a segment (p0->p1) against a box. Returns {t0,t1} or null. Slab method. */
export function segmentBox(p0, p1, b) {
  let t0 = 0, t1 = 1;
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  for (let i = 0; i < 3; i++) {
    const bmin = min(b, i), bmax = max(b, i);
    if (Math.abs(d[i]) < 1e-9) {
      if (p0[i] < bmin || p0[i] > bmax) return null;
      continue;
    }
    let ta = (bmin - p0[i]) / d[i];
    let tb = (bmax - p0[i]) / d[i];
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return { t0, t1 };
}

export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Union bounds of boxes. */
export function bounds(boxes) {
  if (!boxes.length) return null;
  const l = [Infinity, Infinity, Infinity], h = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let i = 0; i < 3; i++) {
    l[i] = Math.min(l[i], min(b, i));
    h[i] = Math.max(h[i], max(b, i));
  }
  return { lo: l, hi: h };
}
