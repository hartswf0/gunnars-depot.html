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

/**
 * What has to be reachable, and how much room in front of it.
 *
 * Keyed on the *role*, and deliberately short. The first version put a rule on
 * every `fixture` and reported twenty-one violations, most of them nonsense: a
 * sink is supposed to be in a counter, a shower pan is supposed to be in a floor,
 * and a PV panel on a roof is not something you stand in front of. A check that
 * cries about the sink teaches you to ignore it when it cries about the fuse box.
 *
 * These five are the things a person has to walk up to, open, and work on.
 */
export const CLEARANCE = {
  panel:      { depth: 36, width: 30, height: 78, basis: 'NEC 110.26(A)', why: 'you have to be able to open it and stand there' },
  controller: { depth: 30, width: 24, height: 60, basis: 'NEC 110.26(A)', why: 'a charge controller is serviced in place' },
  inverter:   { depth: 30, width: 24, height: 48, basis: 'NEC 110.26(A)', why: 'an inverter is serviced in place' },
  battery:    { depth: 24, width: 24, height: 36, basis: 'NEC 110.26(A)', why: 'terminals get torqued and cells get checked' },
  regulator:  { depth: 18, width: 18, height: 30, basis: 'IFGC 303', why: 'a shutoff you cannot reach is not a shutoff' }
};

/** Structure is the room, not clutter in it. You stand on the floor. */
export const NOT_AN_OBSTRUCTION = new Set([
  'deck', 'joist', 'chassis', 'pad', 'wheel', 'rafter', 'purlin', 'sheathing',
  'plate', 'stud', 'king', 'jack', 'cripple', 'header', 'blocking', 'strap',
  'hanger', 'wellcap', 'wellside', 'panel', 'opening'
]);

/** The box in front of e that has to stay empty, on the wall face it opens from. */
export function workspaceOf(world, e) {
  // `fixture` is the element kind for everything from an outlet to a fuse block;
  // what it actually *is* lives in meta.role. Keyed on kind alone this rule never
  // fired once, on any panel, in a trailer full of them.
  const role = e.meta && e.meta.role;
  // role first: every panel in this trailer is kind 'fixture', so keying on kind
  // matched the generic fixture rule and a 12 in cube stood in for NEC's 30 x 36 x 78.
  const c = CLEARANCE[role] || CLEARANCE[e.kind] || null;
  if (!c) return null;
  if (e.lo[2] > 100) return null;      // roof-mounted: you get to it from outside, on a ladder
  // It opens off its thin axis, facing into the building. Guessing the direction
  // from which side of a wall line it fell on put the fuse block's working space
  // outside the trailer, where nothing could ever intrude on it.
  const b = worldCentre(world);
  const ec = [0, 1, 2].map(i => (e.lo[i] + e.hi[i]) / 2);
  const axis = (e.hi[0] - e.lo[0]) <= (e.hi[1] - e.lo[1]) ? 0 : 1;
  const dir = b[axis] >= ec[axis] ? 1 : -1;
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

/**
 * How much of the working space's *floor* is taken, which is the thing the rule
 * is actually about. Measured as a volume fraction, a bed base filling the whole
 * standing area of a 30 x 36 x 78 in space scored 8%, because most of that box is
 * air above head height. You cannot stand in the 8%.
 */
export function blockage(world, space, ignore = new Set()) {
  const area = (space.hi[0] - space.lo[0]) * (space.hi[1] - space.lo[1]);
  if (area <= 0) return { fraction: 0, by: [] };
  const by = [];
  let covered = 0;
  for (const o of world.solids()) {
    if (ignore.has(o.id)) continue;
    if (o.kind === 'run' || o.layer === 'services') continue;   // a wire is not an obstruction
    if (NOT_AN_OBSTRUCTION.has(o.kind)) continue;               // nor is the floor you stand on
    if (o.hi[2] <= space.lo[2] + 0.5 || o.lo[2] >= space.hi[2] - 0.5) continue;
    const ox = Math.min(space.hi[0], o.hi[0]) - Math.max(space.lo[0], o.lo[0]);
    const oy = Math.min(space.hi[1], o.hi[1]) - Math.max(space.lo[1], o.lo[1]);
    if (ox <= 0.5 || oy <= 0.5) continue;
    covered += ox * oy;
    by.push({ id: o.id, kind: o.kind, part: +(ox * oy / area).toFixed(2) });
  }
  by.sort((a, b) => b.part - a.part);
  return { fraction: Math.min(1, +(covered / area).toFixed(2)), by };
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

/** Centre of the framed box, used to work out which way a wall-mounted thing faces. */
export function worldCentre(world) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const pool = world.solids().filter(e => e.layer === 'frame');
  for (const e of (pool.length ? pool : world.solids()))
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], e.lo[i]); hi[i] = Math.max(hi[i], e.hi[i]); }
  return [0, 1, 2].map(i => (lo[i] + hi[i]) / 2);
}
