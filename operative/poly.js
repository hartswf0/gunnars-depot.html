// operative/poly.js — exact convex tests for boxes and *sheared* boxes.
//
// Why this exists: the first support-graph probe on the seed kit showed a shed
// rafter cannot be told the truth as an axis-aligned block — its AABB swallowed
// the roof cover and reported a phantom conflict. A member is therefore a
// parallelepiped: centre + three edge vectors. An axis-aligned box is the
// special case where the edge vectors are the axes.
//
// Separating Axis Theorem over 3+3 face normals and 9 edge cross-products.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/**
 * Build a polytope from an element's box plus an optional shear.
 * shear = { axis: 'x'|'y', rise: inches } tilts the member's z along that axis:
 * the low end sits rise/2 below centre, the high end rise/2 above.
 */
export function poly(box, shear) {
  const [sx, sy, sz] = box.s;
  let a = [sx, 0, 0], b = [0, sy, 0], c = [0, 0, sz];
  if (shear && shear.rise) {
    if (shear.axis === 'x') a = [sx, 0, shear.rise];
    else if (shear.axis === 'y') b = [0, sy, shear.rise];
  }
  return { c: box.p.slice(), a, b, c3: c };
}

export function verts(P) {
  const out = [];
  for (const i of [-0.5, 0.5]) for (const j of [-0.5, 0.5]) for (const k of [-0.5, 0.5]) {
    out.push([
      P.c[0] + P.a[0] * i + P.b[0] * j + P.c3[0] * k,
      P.c[1] + P.a[1] * i + P.b[1] * j + P.c3[1] * k,
      P.c[2] + P.a[2] * i + P.b[2] * j + P.c3[2] * k
    ]);
  }
  return out;
}

export function aabb(P) {
  const v = verts(P);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of v) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  return { lo, hi };
}

const span = (P, ax) => {
  let mn = Infinity, mx = -Infinity;
  for (const p of verts(P)) { const d = dot(p, ax); if (d < mn) mn = d; if (d > mx) mx = d; }
  return [mn, mx];
};

function axesFor(P, Q) {
  const out = [cross(P.a, P.b), cross(P.b, P.c3), cross(P.c3, P.a),
               cross(Q.a, Q.b), cross(Q.b, Q.c3), cross(Q.c3, Q.a)];
  for (const e of [P.a, P.b, P.c3]) for (const f of [Q.a, Q.b, Q.c3]) out.push(cross(e, f));
  return out.filter(v => len(v) > 1e-9).map(v => scale3(v, 1 / len(v)));
}

/** Minimum translation to separate, or null if already apart by more than tol. */
export function separation(P, Q, tol = 0.03) {
  // Cheap AABB reject first.
  const A = aabb(P), B = aabb(Q);
  for (let i = 0; i < 3; i++) if (A.lo[i] > B.hi[i] - tol || B.lo[i] > A.hi[i] - tol) return null;
  let best = null;
  for (const ax of axesFor(P, Q)) {
    const [p0, p1] = span(P, ax), [q0, q1] = span(Q, ax);
    const depth = Math.min(p1, q1) - Math.max(p0, q0);
    if (depth <= tol) return null;              // separating axis found -> no interpenetration
    if (!best || depth < best.depth) best = { depth, axis: ax };
  }
  return best;
}

/** Interpenetration volume estimate — AABB of the overlap region, good enough to rank conflicts. */
export function overlapVolume(P, Q, tol = 0.03) {
  if (!separation(P, Q, tol)) return 0;
  const A = aabb(P), B = aabb(Q);
  let v = 1;
  for (let i = 0; i < 3; i++) v *= Math.max(0, Math.min(A.hi[i], B.hi[i]) - Math.max(A.lo[i], B.lo[i]));
  return v;
}

/**
 * Does A bear on B? A is dropped by `reach` and must then meet B while not
 * already interpenetrating it, and A's centre must sit above B's.
 * Returns bearing area in in² (footprint intersection), else 0.
 */
export function bearsOn(A, B, reach = 0.6) {
  // Compare tops, not centroids: a rafter landing on a plate has its centroid far
  // out over the room and below the plate it bears on.
  const ab = aabb(A), bb = aabb(B);
  if (ab.hi[2] <= bb.hi[2]) return 0;
  if (separation(A, B, 0.05)) return 0;                       // already interpenetrating -> conflict, not bearing
  const dropped = { ...A, c: [A.c[0], A.c[1], A.c[2] - reach] };
  if (!separation(dropped, B, 0.0)) return 0;
  const a = ab, b = bb;
  const ox = Math.min(a.hi[0], b.hi[0]) - Math.max(a.lo[0], b.lo[0]);
  const oy = Math.min(a.hi[1], b.hi[1]) - Math.max(a.lo[1], b.lo[1]);
  return ox > 0.05 && oy > 0.05 ? ox * oy : 0;
}

/** Grow a polytope by `r` inches on every face, along its own edge directions. */
export function expand(P, r) {
  const grow = (e) => { const L = len(e); return L < 1e-9 ? e : scale3(e, (L + 2 * r) / L); };
  return { c: P.c.slice(), a: grow(P.a), b: grow(P.b), c3: grow(P.c3) };
}

/**
 * Face-to-face contact without bearing: nailed, welded, lagged. Returns contact
 * area in in².
 *
 * This used to compare axis-aligned bounds, which reported a sheared rafter as
 * fastened to a plate its material floated 8 in above. The proximity test is now
 * done on the real solids; only the area estimate stays approximate.
 */
export function fastenedTo(A, B, reach = 0.35) {
  if (separation(A, B, 0.05)) return 0;          // interpenetrating -> conflict, not a joint
  if (!separation(expand(A, reach), B, 0)) return 0;   // genuinely apart
  const a = aabb(A), b = aabb(B);
  let touchAxis = -1, gaps = 0;
  const ov = [];
  for (let i = 0; i < 3; i++) {
    const o = Math.min(a.hi[i], b.hi[i]) - Math.max(a.lo[i], b.lo[i]);
    ov.push(o);
    if (o < -reach) return 0;
    if (o <= reach) touchAxis = i; else gaps++;
  }
  if (touchAxis < 0 || gaps < 2) return 0;
  let area = 1;
  for (let i = 0; i < 3; i++) if (i !== touchAxis) area *= Math.max(0, ov[i]);
  return area;
}

/** Clip a segment against a polytope, in the polytope's own (possibly sheared) frame. */
export function segmentPoly(p0, p1, P) {
  // Solve for barycentric coords in the (a,b,c3) frame: p = c + a*u + b*v + c3*w, |u,v,w| <= .5
  const M = [[P.a[0], P.b[0], P.c3[0]], [P.a[1], P.b[1], P.c3[1]], [P.a[2], P.b[2], P.c3[2]]];
  const inv = invert3(M);
  if (!inv) return null;
  const q0 = mul3(inv, sub(p0, P.c));
  const q1 = mul3(inv, sub(p1, P.c));
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = q1[i] - q0[i];
    if (Math.abs(d) < 1e-9) { if (q0[i] < -0.5 || q0[i] > 0.5) return null; continue; }
    let ta = (-0.5 - q0[i]) / d, tb = (0.5 - q0[i]) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return { t0, t1 };
}

function invert3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [[A / det, (c * h - b * i) / det, (b * f - c * e) / det],
          [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
          [C / det, (b * g - a * h) / det, (a * e - b * d) / det]];
}
const mul3 = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];


/** Is B wholly inside A? Used for hollow hosts — a cabinet is a carcass, not a solid. */
export function containsFully(A, B, slack = 0.35) {
  const a = aabb(A), b = aabb(B);
  for (let i = 0; i < 3; i++) if (b.lo[i] < a.lo[i] - slack || b.hi[i] > a.hi[i] + slack) return false;
  return true;
}
