// operative/gravity.js — switch gravity on and see what falls.
//
// For a long time this file did not exist and the support check carried this
// exemption:
//
//   if (e.layer === 'services') continue;
//   // Service equipment is strapped to framing rather than stacked, so it is
//   // asked for continuity (check 6) instead of for a gravity path.
//
// Which is to say: the floating things were exempted from the floating check,
// with a justification written next to them. Six ceiling lights hung 85 in above
// the floor, attached to nothing. The world was asked whether they were *wired*,
// never whether they were *held*.
//
// A light is not stacked, true. It is screwed to a rafter or to blocking. That is
// a joint, and this project already models joints. So the fix is not to exempt
// equipment from gravity — it is to make it hang off something, and to say so
// loudly when it does not.
//
// The measure is the honest one: how far would it fall?

import { scheduleFor } from './joints.js';

/** The height of the highest thing directly beneath e's footprint (0 = ground). */
export function floorUnder(world, e, solids) {
  let best = 0;
  for (const o of solids) {
    if (o.id === e.id) continue;
    if (o.hi[2] > e.lo[2] + 1e-6) continue;                       // not below
    const ox = Math.min(e.hi[0], o.hi[0]) - Math.max(e.lo[0], o.lo[0]);
    const oy = Math.min(e.hi[1], o.hi[1]) - Math.max(e.lo[1], o.lo[1]);
    if (ox <= 0.05 || oy <= 0.05) continue;                       // no footprint over it
    if (o.hi[2] > best) best = o.hi[2];
  }
  return best;
}

/**
 * Every solid the support graph never reached, with the distance it would fall.
 * Sorted worst first, because the light that drops 85 in matters more than the
 * bottle that drops 2.
 */
export function dropTest(world) {
  const g = world.grounded();
  const solids = world.solids();
  const out = [];
  for (const e of solids) {
    if (g.seen.has(e.id)) continue;
    const fall = +(e.lo[2] - floorUnder(world, e, solids)).toFixed(2);
    out.push({ id: e.id, kind: e.kind, layer: e.layer, fall, z: +e.lo[2].toFixed(2) });
  }
  out.sort((a, b) => b.fall - a.fall);
  return { falling: out, totalFall: +out.reduce((a, r) => a + r.fall, 0).toFixed(1) };
}

/** How far a fixture may reach to find something to screw to. */
export const REACH = 6;

/**
 * What e could be mounted to: framing and carcass within reach, nearest first.
 * An electrician looks for a stud, a joist, a rafter, or blocking — in that
 * order of what happens to be there — and if nothing is there, adds blocking.
 */
export const MOUNTABLE = new Set(['stud', 'plate', 'joist', 'rafter', 'chassis', 'blocking',
                                  'deck', 'sheathing', 'wellcap', 'wellside', 'cabinet',
                                  'bed', 'bench', 'partition', 'purlin', 'chase', 'header']);

export function mountsFor(world, e, reach = REACH) {
  const out = [];
  for (const o of world.solids()) {
    if (o.id === e.id) continue;
    if (!MOUNTABLE.has(o.kind)) continue;
    // gap on each axis; negative means they already overlap on that axis
    const gap = [0, 1, 2].map(i => Math.max(o.lo[i] - e.hi[i], e.lo[i] - o.hi[i], 0));
    const d = Math.hypot(...gap);
    if (d > reach) continue;
    // prefer something above or behind: you hang a light from what is over it
    out.push({ id: o.id, kind: o.kind, gap: +d.toFixed(2), above: o.lo[2] >= e.hi[2] - 0.01 });
  }
  // Prefer framing. A vent stack is strapped to a stud, not to the skin, and
  // "nearest" alone kept choosing the sheathing because the sheathing is what
  // everything is nearest to.
  const RANK = { blocking: 0, stud: 1, joist: 1, rafter: 1, plate: 1, header: 1, purlin: 1,
                 chassis: 2, cabinet: 3, bed: 3, bench: 3, partition: 3, chase: 3,
                 deck: 4, wellcap: 4, wellside: 4, sheathing: 5 };
  const rank = (k) => (RANK[k] === undefined ? 6 : RANK[k]);
  // Distance first, in half-inch buckets, then preference. Preferring framing
  // outright made a hanger reach past the deck to the sole plate above it and pass
  // straight through the floor on the way. You fasten to the thing in front of
  // you; you do not reach through it for a nicer one.
  const bucket = (g) => Math.round(g * 2);
  out.sort((a, b) => (b.above - a.above) || (bucket(a.gap) - bucket(b.gap)) ||
                     (rank(a.kind) - rank(b.kind)) || (a.gap - b.gap));
  return out;
}

/**
 * NEC 110.26(A): clear working space in front of equipment you have to open —
 * 30 in wide, 36 in deep, 78 in high. This is the rule a shelf hung across the
 * fuse panel breaks, and the reason "it fits" is not the same as "it works".
 */
export const WORKSPACE = { width: 30, depth: 36, height: 78 };

/** Kinds that need to be reachable, and how much room each needs in front. */
export const CLEARANCE = {
  panel:    { depth: 36, width: 30, height: 78, basis: 'NEC 110.26(A)', why: 'you have to be able to open it and stand there' },
  controller: { depth: 30, width: 24, height: 60, basis: 'NEC 110.26(A)', why: 'a charge controller is serviced in place' },
  battery:  { depth: 24, width: 24, height: 36, basis: 'NEC 110.26(A)', why: 'terminals get torqued and cells get checked' },
  source:   { depth: 18, width: 18, height: 30, basis: 'IFGC 303', why: 'a shutoff you cannot reach is not a shutoff' },
  fixture:  { depth: 12, width: 12, height: 12, basis: 'field practice', why: 'a fixture behind a cabinet cannot be serviced or used' }
};

/** The box in front of e that has to stay empty, on the wall face it opens from. */
export function workspaceOf(world, e) {
  const c = CLEARANCE[e.kind] || (e.meta && e.meta.serviceable ? CLEARANCE.fixture : null);
  if (!c) return null;
  // the face it opens from: the widest horizontal face, pointing away from the
  // nearest wall. Mounted on the E wall, it opens west.
  const cx = (e.lo[0] + e.hi[0]) / 2, cy = (e.lo[1] + e.hi[1]) / 2;
  const W = world.walls || {};
  let axis = 0, dir = 1;
  const spanX = e.hi[0] - e.lo[0], spanY = e.hi[1] - e.lo[1];
  if (spanX <= spanY) { axis = 0; dir = cx < ((W.E && W.E.at) || 51) ? 1 : -1; }
  else { axis = 1; dir = cy < ((W.N && W.N.at) || 120) ? 1 : -1; }
  const lo = [e.lo[0], e.lo[1], e.lo[2]], hi = [e.hi[0], e.hi[1], e.hi[2]];
  const other = axis === 0 ? 1 : 0;
  const octr = (lo[other] + hi[other]) / 2;
  lo[other] = octr - c.width / 2; hi[other] = octr + c.width / 2;
  const zc = (e.lo[2] + e.hi[2]) / 2;
  lo[2] = Math.max(0, zc - c.height / 2); hi[2] = zc + c.height / 2;
  if (dir > 0) { lo[axis] = hi[axis]; hi[axis] = lo[axis] + c.depth; }
  else { hi[axis] = lo[axis]; lo[axis] = hi[axis] - c.depth; }
  return { lo, hi, rule: c, axis, dir };
}

/** How much of a box another solid eats, as a fraction of that box's volume. */
export function intrusion(space, o) {
  const ov = [0, 1, 2].map(i => Math.min(space.hi[i], o.hi[i]) - Math.max(space.lo[i], o.lo[i]));
  if (ov.some(v => v <= 0.05)) return 0;
  const vol = [0, 1, 2].reduce((a, i) => a * (space.hi[i] - space.lo[i]), 1);
  return (ov[0] * ov[1] * ov[2]) / vol;
}

/**
 * Daylight: an opening exists to let light and a view through. Something parked
 * inside the prism just behind it has covered a window, which is what "hanging
 * shelves that cover things" actually means in a model.
 */
export function daylightOf(world, op, depth = 24) {
  const lo = op.lo.slice(), hi = op.hi.slice();
  const w = world.walls && world.walls[op.meta.wall];
  if (!w) return null;
  const axis = w.axis === 'y' ? 0 : 1;     // a wall running in y faces along x
  const inward = -w.normal[axis];
  if (inward > 0) { lo[axis] = hi[axis]; hi[axis] = lo[axis] + depth; }
  else { hi[axis] = lo[axis]; lo[axis] = hi[axis] - depth; }
  return { lo, hi, axis };
}
