// operative/light.js — can you see in here?
//
// The trailer has six DC pucks and five headed openings, and until this file
// existed not one thing in the model knew whether any of it reached the floor.
// A light is an object with a wattage; an opening is a hole with a header over
// it. Neither of them has ever been asked to illuminate anything.
//
// Two questions, and they are not the same question:
//   1. does daylight get in?          (IRC R303.1 — glazing at 8% of floor area)
//   2. can you see at night?          (the pucks, and whether anything blocks them)
//
// The measure is a grid on the floor, because that is where a person is.

const GRID = 12;                      // in — a sample every foot of floor

/** Points on the floor, inside the framed box, that a person could stand on. */
export function floorGrid(world, step = GRID) {
  const frame = world.solids().filter(e => e.layer === 'frame');
  if (!frame.length) return [];
  const lo = [0, 1].map(i => Math.min(...frame.map(e => e.lo[i])));
  const hi = [0, 1].map(i => Math.max(...frame.map(e => e.hi[i])));
  const deck = world.all({ kind: 'deck' });
  const z = deck.length ? Math.max(...deck.map(d => d.hi[2])) : world.datum.deckTop;
  const blockers = world.solids().filter(e =>
    e.layer === 'interior' && e.lo[2] < z + 30 && e.hi[2] > z + 2);
  const out = [];
  for (let x = lo[0] + step / 2; x < hi[0]; x += step)
    for (let y = lo[1] + step / 2; y < hi[1]; y += step) {
      const p = [x, y, z + 30];                       // eye height for a seated person
      // inside the walls, and not standing inside the furniture
      if (blockers.some(b => x > b.lo[0] && x < b.hi[0] && y > b.lo[1] && y < b.hi[1])) continue;
      out.push(p);
    }
  return { points: out, z, area: (hi[0] - lo[0]) * (hi[1] - lo[1]) / 144 };
}

/**
 * The opaque things, cached with their bounds. Rebuilding this list inside every
 * ray took the night-light pass to thirty seconds for one trailer; nobody runs a
 * thirty-second check, which means nobody runs it.
 */
export function opaque(world, ignore = new Set()) {
  return world.solids()
    .filter(e => !ignore.has(e.id) && e.kind !== 'run' && e.kind !== 'flashing' &&
                 e.kind !== 'opening' && e.layer !== 'services')
    .map(e => ({ id: e.id, lo: e.lo, hi: e.hi }));
}

/** Does a straight line from a to b pass through anything opaque? */
export function clearLine(world, a, b, ignore = new Set(), cache = null) {
  const solids = cache || opaque(world, ignore);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  if (!len) return true;
  // only the boxes whose bounds the segment could possibly enter
  const slo = [0, 1, 2].map(i => Math.min(a[i], b[i]));
  const shi = [0, 1, 2].map(i => Math.max(a[i], b[i]));
  const near = solids.filter(e =>
    e.hi[0] > slo[0] && e.lo[0] < shi[0] && e.hi[1] > slo[1] &&
    e.lo[1] < shi[1] && e.hi[2] > slo[2] && e.lo[2] < shi[2]);
  if (!near.length) return true;
  const n = Math.ceil(len / 3);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a[0] + d[0] * t, y = a[1] + d[1] * t, z = a[2] + d[2] * t;
    for (const e of near)
      if (x > e.lo[0] && x < e.hi[0] && y > e.lo[1] && y < e.hi[1] &&
          z > e.lo[2] && z < e.hi[2]) return false;
  }
  return true;
}

/** IRC R303.1: glazing not less than 8% of the floor area it serves. */
export const GLAZING_FRACTION = 0.08;

export function daylight(world) {
  const g = floorGrid(world);
  if (!g.points) return null;
  const windows = world.all({ kind: 'opening' }).filter(o => o.meta.type !== 'door');
  const doors = world.all({ kind: 'opening' }).filter(o => o.meta.type === 'door');
  const glazing = windows.reduce((a, o) =>
    a + ((o.hi[0] - o.lo[0]) * (o.hi[2] - o.lo[2]) || 0) +
        ((o.hi[1] - o.lo[1]) * (o.hi[2] - o.lo[2]) || 0), 0) / 2 / 144;
  const ignore = new Set(world.all({ kind: 'opening' }).map(o => o.id));
  const cache = opaque(world, ignore);
  let lit = 0;
  const dark = [];
  for (const p of g.points) {
    const sees = windows.some(o => clearLine(world, p,
      [(o.lo[0] + o.hi[0]) / 2, (o.lo[1] + o.hi[1]) / 2, (o.lo[2] + o.hi[2]) / 2], ignore, cache));
    if (sees) lit++; else dark.push(p);
  }
  return {
    points: g.points.length, lit, dark: dark.length,
    fraction: g.points.length ? +(lit / g.points.length).toFixed(2) : 0,
    floorArea: +g.area.toFixed(1), glazingArea: +glazing.toFixed(1),
    glazingFraction: g.area ? +(glazing / g.area).toFixed(3) : 0,
    needs: +(g.area * GLAZING_FRACTION).toFixed(1),
    windows: windows.length, doors: doors.length,
    darkest: dark.slice(0, 6).map(p => p.map(n => +n.toFixed(0)))
  };
}

/**
 * Night. A puck is a point source; illuminance falls off with the square of the
 * distance and stops at the first thing in the way. 5 foot-candles is the number
 * below which a corridor is "unlit" in most habitability codes; a work surface
 * wants 30 or more.
 */
export const LUMENS_PER_WATT = 90;     // LED
export const MIN_FC = 5;               // below this a space is unlit, not dim
export const TARGET_FC = 10;           // general residential, IES-ish
export const CU = 0.5;                 // coefficient of utilisation, light-coloured small room
export const LLF = 0.9;                // light loss factor

export function artificial(world) {
  const g = floorGrid(world);
  if (!g.points) return null;
  const lamps = world.all().filter(e => (e.meta.role === 'light' || e.kind === 'light') && e.meta.watts);
  const ignore = new Set([...lamps.map(l => l.id), ...world.all({ kind: 'opening' }).map(o => o.id)]);
  const cache = opaque(world, ignore);
  const out = [];
  for (const p of g.points) {
    let fc = 0;
    for (const l of lamps) {
      const c = [(l.lo[0] + l.hi[0]) / 2, (l.lo[1] + l.hi[1]) / 2, l.lo[2]];
      const d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) / 12;   // feet
      if (d < 0.5) { fc += 1000; continue; }
      if (!clearLine(world, p, c, ignore, cache)) continue;
      fc += (l.meta.watts * LUMENS_PER_WATT) / (4 * Math.PI * d * d);
    }
    out.push({ p, fc: +fc.toFixed(1) });
  }
  const dark = out.filter(o => o.fc < MIN_FC);
  // Two models, because they answer two questions. The lumen method gives the
  // room its average and is what a lighting designer uses; the point-source pass
  // finds the corner the cabinet is shadowing, which an average cannot.
  const watts = lamps.reduce((a, l) => a + l.meta.watts, 0);
  const lumens = watts * LUMENS_PER_WATT;
  const average = g.area ? (lumens * CU * LLF) / g.area : 0;
  return {
    lamps: lamps.length, watts, lumens,
    average: +average.toFixed(1), target: TARGET_FC,
    wattsNeeded: +((TARGET_FC * g.area) / (CU * LLF) / LUMENS_PER_WATT).toFixed(0),
    points: out.length, dark: dark.length,
    fraction: out.length ? +(1 - dark.length / out.length).toFixed(2) : 0,
    median: +median(out.map(o => o.fc)).toFixed(1),
    darkest: dark.slice(0, 6).map(o => ({ at: o.p.map(n => +n.toFixed(0)), fc: o.fc }))
  };
}
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
