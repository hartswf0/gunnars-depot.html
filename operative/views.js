// operative/views.js — the building has to survive being looked at.
//
// A repair can look convincing from one angle and fall apart the moment you
// orbit. Every screenshot this project has taken until now was one three-quarter
// view of the same corner, which is why six ceiling lights hung in mid-air for
// weeks without anyone noticing: nobody ever looked up.
//
// So the sensor is not one camera. It is a fixed set of named positions, and a
// low score from one of them is not a result — it is a reason to move.
//
// No camera-planning intelligence here on purpose. A handful of semantic views a
// person would ask for, and three rules for picking the next one.

export const VIEWS = [
  { id: 'front',      label: 'FRONT',           dir: [0, -1, 0.10], kind: 'exterior' },
  { id: 'rear',       label: 'REAR',            dir: [0, 1, 0.10],  kind: 'exterior' },
  { id: 'left',       label: 'LEFT',            dir: [-1, 0, 0.10], kind: 'exterior' },
  { id: 'right',      label: 'RIGHT',           dir: [1, 0, 0.10],  kind: 'exterior' },
  { id: 'threeq',     label: '3/4 FRONT',       dir: [0.62, -0.72, 0.42], kind: 'exterior' },
  { id: 'threeq.rear',label: '3/4 REAR',        dir: [-0.62, 0.72, 0.42], kind: 'exterior' },
  { id: 'plan',       label: 'PLAN',            dir: [0.001, 0.001, 1], kind: 'plan' },
  { id: 'inside.entry',   label: 'INTERIOR ENTRY',   inside: true, at: [0.5, 0.10, 0.62], look: [0.5, 0.9, 0.42], kind: 'interior' },
  { id: 'inside.reverse', label: 'INTERIOR REVERSE', inside: true, at: [0.5, 0.90, 0.62], look: [0.5, 0.1, 0.42], kind: 'interior' },
  { id: 'inside.up',      label: 'INTERIOR UP',      inside: true, at: [0.5, 0.45, 0.35], look: [0.5, 0.46, 1.4], kind: 'interior' },
  { id: 'under',      label: 'UNDERSIDE',       dir: [0.5, -0.5, -1], kind: 'service' },
  { id: 'service',    label: 'SERVICE / XRAY',  dir: [0.62, -0.72, 0.30], xray: true, kind: 'service' }
];

export const byId = (id) => VIEWS.find(v => v.id === id) || null;

/**
 * Bounds of everything solid, so views are derived from the building, not guessed.
 * `inside` measures the framed box only: the tongue sticks 32 in past the front of
 * the trailer, and an interior camera placed at 10% of the *whole* extent stood
 * out on the drawbar looking at the wall.
 */
export function bounds(world, inside = false) {
  const b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  const pool = inside ? world.solids().filter(e => e.layer === 'frame') : world.solids();
  for (const e of (pool.length ? pool : world.solids()))
    for (let i = 0; i < 3; i++) { b.lo[i] = Math.min(b.lo[i], e.lo[i]); b.hi[i] = Math.max(b.hi[i], e.hi[i]); }
  if (!Number.isFinite(b.lo[0])) return null;
  b.c = b.lo.map((v, i) => (v + b.hi[i]) / 2);
  b.size = b.hi.map((v, i) => v - b.lo[i]);
  b.span = Math.max(...b.size);
  return b;
}

/** Camera position + target for a named view, in world inches. */
export function place(world, view, fovDeg = 45, aspect = 0.55) {
  const b = bounds(world, !!view.inside);
  if (!b) return null;
  const lerp = (i, t) => b.lo[i] + b.size[i] * t;
  if (view.inside) {
    // A camera at 10% of the length stood inside the shower wall and every
    // interior shot came back a flat brown rectangle. Nudge along the length
    // until it is standing in air, the way a person walking in would be.
    const want = [lerp(0, view.at[0]), lerp(1, view.at[1]), lerp(2, view.at[2])];
    return {
      eye: freeSpot(world, want, [0, 1, 2].map(i => (i === 1 ? b.size[1] : 0))),
      target: [lerp(0, view.look[0]), lerp(1, view.look[1]), lerp(2, view.look[2])],
      fov: 62                                   // a room is read wide, like a phone camera
    };
  }
  // The silhouette width, not the nearer of the two axes. Picking one axis put the
  // three-quarter camera 253 in of subject away on a 101 in fit and the x-ray view
  // opened inside a cabinet.
  const d = view.dir;
  const hl = Math.hypot(d[0], d[1]) || 1;
  const across = view.id === 'plan' ? b.size[0]
    : b.size[0] * Math.abs(d[1] / hl) + b.size[1] * Math.abs(d[0] / hl);
  const up = view.id === 'plan' ? Math.max(b.size[0], b.size[1]) : b.size[2] * 1.15;
  const need = Math.max(across / Math.max(aspect, 0.3), up) * 0.58;
  const dist = need / Math.tan((fovDeg * Math.PI / 180) / 2);
  const len = Math.hypot(...d) || 1;
  return {
    eye: [b.c[0] + d[0] / len * dist, b.c[1] + d[1] / len * dist, b.c[2] + d[2] / len * dist],
    target: b.c.slice(), fov: fovDeg
  };
}

/**
 * Which view to look from next.
 *
 * 1. the view that would show what was just criticised
 * 2. after a repair, the opposite of where the repair was judged from
 * 3. otherwise the least recently inspected
 *
 * Deliberately not a planner. Three rules, in order, and the third one guarantees
 * every view comes round eventually.
 */
export function chooseView(history, { lastView, after, hint } = {}) {
  const seen = new Map();
  history.forEach((h, i) => seen.set(h.view, i));
  if (hint) {
    const h = String(hint).toLowerCase();
    const hit = VIEWS.find(v => h.includes(v.id.split('.')[0]) || h.includes(v.label.toLowerCase()));
    if (hit && hit.id !== lastView) return hit;
    if (/inside|interior|room|ceiling|floor|cabinet|galley|bath/.test(h)) {
      const inside = VIEWS.filter(v => v.kind === 'interior' && v.id !== lastView);
      if (inside.length) return least(inside, seen);
    }
    if (/pipe|wire|drain|vent|conduit|panel|service|plumb|electric/.test(h))
      return byId('service');
    if (/under|frame|chassis|axle|tongue|joist/.test(h)) return byId('under');
    if (/roof|above|plan|layout/.test(h)) return byId('plan');
  }
  if (after && lastView) {
    const opp = OPPOSITE[lastView];
    if (opp) return byId(opp);
  }
  return least(VIEWS.filter(v => v.id !== lastView), seen);
}
const least = (pool, seen) =>
  pool.slice().sort((a, b) => (seen.has(a.id) ? seen.get(a.id) : -1) - (seen.has(b.id) ? seen.get(b.id) : -1))[0];

export const OPPOSITE = {
  front: 'rear', rear: 'front', left: 'right', right: 'left',
  threeq: 'threeq.rear', 'threeq.rear': 'threeq',
  plan: 'under', under: 'plan',
  'inside.entry': 'inside.reverse', 'inside.reverse': 'inside.entry',
  'inside.up': 'plan', service: 'inside.up'
};

/** Is this point inside any solid? */
export function occupied(world, p, pad = 1) {
  for (const e of world.solids()) {
    if (e.kind === 'run') continue;
    if (p[0] > e.lo[0] - pad && p[0] < e.hi[0] + pad &&
        p[1] > e.lo[1] - pad && p[1] < e.hi[1] + pad &&
        p[2] > e.lo[2] - pad && p[2] < e.hi[2] + pad) return e.id;
  }
  return null;
}

/** Walk `p` along `axisSpan` in both directions until it is standing in air. */
export function freeSpot(world, p, axisSpan) {
  if (!occupied(world, p)) return p;
  const axis = axisSpan.findIndex(v => v > 0);
  if (axis < 0) return p;
  const step = axisSpan[axis] / 60;
  for (let k = 1; k <= 60; k++) {
    for (const s of [1, -1]) {
      const q = p.slice(); q[axis] += s * step * k;
      if (!occupied(world, q)) return q;
    }
  }
  return p;
}
