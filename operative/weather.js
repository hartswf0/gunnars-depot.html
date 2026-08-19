// operative/weather.js — where the water goes.
//
// A roof in this model has been a plane of corrugated metal bearing on rafters,
// and nothing has ever asked it to shed anything. Rain is the cheapest possible
// physics: it falls, it runs downhill, and everywhere it stops or gets in is a
// place the building fails slowly instead of all at once.
//
// Three questions, in the order water asks them:
//   1. does it drain, or does it sit?           (IRC R905.2 / R903.4)
//   2. where does it get in?                     (every penetration, every joint)
//   3. where does it go when it leaves the roof? (IRC R905.2.8.5, drip edge)

/** Roof surfaces: upward-facing, above the walls, big enough to matter. */
export function roofPlanes(world) {
  // The layer, not the height. Chosen by height, this picked up all eight top
  // plates — they are wide, thin and near the top — and then every ceiling light
  // and every conduit above them counted as coming through the roof.
  const skin = world.solids().filter(e => e.layer === 'roof' && e.kind !== 'flashing' &&
    (e.hi[0] - e.lo[0]) * (e.hi[1] - e.lo[1]) > 200 &&
    (e.hi[2] - e.lo[2]) < Math.min(e.hi[0] - e.lo[0], e.hi[1] - e.lo[1]));
  return skin;
}

/** Slope, in inches per foot, of a member's top face. */
export function slopeOf(e) {
  if (!e.shear || !e.shear.rise) return 0;
  const run = e.shear.axis === 'x' ? (e.hi[0] - e.lo[0]) : (e.hi[1] - e.lo[1]);
  return run ? Math.abs(e.shear.rise) / (run / 12) : 0;
}

/** Minimum slope a roof may have and still be called drained. */
export const MIN_SLOPE = 0.25;             // 1/4 in per foot, IRC R905.2.2 / R905.10.1

/**
 * Everything that comes through the roof. Each one is a hole in the only surface
 * keeping water out, and each one needs to be flashed — which is a *thing*, not
 * an attribute, so if the model does not contain it, it is not there.
 */
export function penetrations(world) {
  const planes = roofPlanes(world);
  if (!planes.length) return [];
  const lo = Math.min(...planes.map(p => p.lo[2]));
  const hi = Math.max(...planes.map(p => p.hi[2]));
  const out = [];
  for (const e of world.all()) {
    if (planes.includes(e)) continue;
    // Through, not on. A PV string lying along the top face of the roof shares its
    // z range with it and was counted as a hole in it. A penetration starts inside
    // and ends outside.
    if (!(e.lo[2] < lo + 0.1 && e.hi[2] > hi - 0.1)) continue;
    // does it actually sit over a roof plane in plan?
    const over = planes.find(p =>
      Math.min(p.hi[0], e.hi[0]) - Math.max(p.lo[0], e.lo[0]) > 0.1 &&
      Math.min(p.hi[1], e.hi[1]) - Math.max(p.lo[1], e.lo[1]) > 0.1);
    if (!over) continue;
    if (e.kind === 'rafter' || e.kind === 'purlin' || e.kind === 'plate') continue;  // structure, under the skin
    out.push({ id: e.id, kind: e.kind, through: over.id,
      flashed: !!(e.meta && e.meta.flashed) || world.all().some(f =>
        f.kind === 'flashing' && f.meta.seals === e.id) });
  }
  return out;
}

/**
 * The drip line: where water leaves the roof, and what is directly below it.
 *
 * `eave: 0` was chosen in the shell spec to keep the trailer inside its towing
 * width, and nothing ever asked what that costs. It costs this: every gallon that
 * lands on the roof leaves at the wall line and runs down the cladding, over the
 * window heads, and into the deck-to-wall joint.
 */
export function dripLine(world) {
  const planes = roofPlanes(world);
  if (!planes.length) return null;
  const roof = planes.reduce((a, b) =>
    (a.hi[0] - a.lo[0]) * (a.hi[1] - a.lo[1]) > (b.hi[0] - b.lo[0]) * (b.hi[1] - b.lo[1]) ? a : b);
  const slope = slopeOf(roof) || (() => {
    // the roof cover may be flat while the rafters under it are not
    const raf = world.all({ kind: 'rafter' }).find(r => r.shear && r.shear.rise);
    return raf ? slopeOf(raf) : 0;
  })();
  const raf = world.all({ kind: 'rafter' }).find(r => r.shear && r.shear.rise);
  const axis = raf && raf.shear ? (raf.shear.axis === 'x' ? 0 : 1) : 0;
  const falling = raf && raf.shear && raf.shear.rise < 0 ? 'low' : 'high';
  const edge = falling === 'low' ? roof.lo[axis] : roof.hi[axis];
  // How far past the wall the roof reaches, measured against the skin as a whole.
  // Looking for one particular sheathing panel near the edge, this returned 0
  // whenever `pitch` moved the walls — and 0 reads as "no overhang", so the check
  // fired on a roof that had one. Not finding the wall and having no overhang are
  // different answers.
  const walls = world.all({ kind: 'sheathing' });
  if (!walls.length) return { roof: roof.id, slope: +slope.toFixed(2), axis: 'xyz'[axis],
                              edge: +edge.toFixed(1), over: null, overhang: null };
  const skinLo = Math.min(...walls.map(w => w.lo[axis]));
  const skinHi = Math.max(...walls.map(w => w.hi[axis]));
  const overhang = falling === 'low' ? skinLo - edge : edge - skinHi;
  const below = walls.find(w =>
    Math.abs((falling === 'low' ? w.lo[axis] : w.hi[axis]) - (falling === 'low' ? skinLo : skinHi)) < 0.01);
  return { roof: roof.id, slope: +slope.toFixed(2), axis: 'xyz'[axis], edge: +edge.toFixed(1),
           over: below ? below.id : null, overhang: +overhang.toFixed(2) };
}

/** Minimum overhang before water is running on the wall rather than off the building. */
export const MIN_OVERHANG = 2;             // in — a drip edge alone is about this

/**
 * Ponding: any upward-facing surface flatter than the minimum, with something
 * standing on it that could dam the water.
 */
export function ponds(world) {
  const out = [];
  for (const e of roofPlanes(world)) {
    const s = slopeOf(e);
    if (s >= MIN_SLOPE) continue;
    const dams = world.solids().filter(o => o.id !== e.id &&
      o.lo[2] >= e.hi[2] - 1 && o.lo[2] <= e.hi[2] + 2 &&
      Math.min(o.hi[0], e.hi[0]) - Math.max(o.lo[0], e.lo[0]) > 4 &&
      Math.min(o.hi[1], e.hi[1]) - Math.max(o.lo[1], e.lo[1]) > 4);
    out.push({ id: e.id, slope: +s.toFixed(3), dams: dams.map(d => d.id) });
  }
  return out;
}

/** Everything at once, for a report or a check. */
export function rain(world) {
  return { planes: roofPlanes(world).map(p => p.id), penetrations: penetrations(world),
           drip: dripLine(world), ponds: ponds(world) };
}
