// operative/habitat.js — can a person use it.
//
// Thirty condition codes and not one of them is about a body. The model will tell
// you a conductor is undersized, a rafter overspanned, a plate bored past half its
// depth, a panel unfastened and a roof unflashed — and it has no opinion at all
// about whether you can stand up in the room, get to the toilet, or reach the
// shelf. A trailer can pass every check in this project and be unusable, and
// nothing in it would notice.
//
// So: the same treatment the structure gets. Measure it, cite what the measure is
// against, and report the number rather than an adjective.

import { occludersOf, bounds } from './radiography.js';
import { voxelise, flood, LABEL } from './tomography.js';

/**
 * A body, in inches, seated and standing. Deliberately a 95th-percentile-ish
 * adult rather than a mean: a space sized for the average person excludes half
 * of everybody.
 */
export const BODY = {
  crown: 74,        // standing height to clear
  eye: 64,
  shoulder: 18,     // breadth, for a shoulder through a gap
  hip: 15,
  counter: 36,      // working height
  seat: 18,
  table: 29,
  reachHigh: 72,    // fingertips, standing
  reachShelf: 54,   // comfortable, without a stretch
  knee: 24          // depth under a table
};

/** What the numbers are against. Every one of these is a real published minimum. */
export const CODE = {
  headroom:      { habitable: 84, service: 80, coach: 78,
                   basis: 'IRC R305.1 (7 ft habitable, 6 ft 8 in bath and kitchen); NFPA 1192 4.4 for a coach' },
  aisle:         { min: 22, comfortable: 30, hall: 36, basis: 'NFPA 1192 4.5; IRC R311.6 for a dwelling hallway' },
  exitDoor:      { w: 24, h: 68, basis: 'NFPA 1192 6.2.1' },
  egressWindow:  { area: 5.0, least: 22, sill: 44, basis: 'NFPA 1192 6.3; IRC R310.2.1 for a dwelling' },
  toilet:        { front: 21, side: 15, basis: 'IRC R307.1' },
  lav:           { front: 21, basis: 'IRC R307.1' },
  galley:        { front: 30, basis: 'working space at a counter, conventional' }
};

const between = (v, a, b) => v >= a && v <= b;

/**
 * A plan of the floor at body height: what a person walking through would hit.
 *
 * Not the floor and not the ceiling — the band a torso occupies. A counter at 36
 * in blocks you; a duct at 96 in does not; a deck at 16 in is what you stand on.
 */
export function plan(world, { step = 2, from = 6, to = 66 } = {}) {
  const solids = world.solids();
  const b = bounds(solids.map(e => ({ lo: e.lo, hi: e.hi })));
  const n = [0, 1].map(i => Math.max(1, Math.ceil(b.size[i] / step)));
  const at = (i, j) => j * n[0] + i;
  const lo = [b.lo[0], b.lo[1]];
  const cells = n[0] * n[1];
  const floorTop = new Float32Array(cells).fill(-Infinity);
  const ceil = new Float32Array(cells).fill(Infinity);
  const blocked = new Uint8Array(cells);
  const inside = new Uint8Array(cells);

  const span = (e) => [
    [0, 1].map(i => Math.max(0, Math.floor((e.lo[i] - lo[i]) / step))),
    [0, 1].map(i => Math.min(n[i] - 1, Math.ceil((e.hi[i] - lo[i]) / step) - 1))
  ];
  // 1. the floor: the highest surface in each column you could put a foot on.
  const walkable = solids.filter(e => e.hi[2] - e.lo[2] < 24 && e.kind !== 'opening');
  const deck = world.all().filter(e => e.meta.role === 'floor sheathing');
  const datum = deck.length ? Math.max(...deck.map(e => e.hi[2])) : b.lo[2];
  for (const e of walkable) {
    if (e.hi[2] > datum + 6 || e.hi[2] < datum - 24) continue;    // a floor, not a shelf
    const [a0, a1] = span(e);
    for (let j = a0[1]; j <= a1[1]; j++) for (let i = a0[0]; i <= a1[0]; i++)
      if (e.hi[2] > floorTop[at(i, j)]) floorTop[at(i, j)] = e.hi[2];
  }
  // 2. the ceiling: the lowest thing you would hit with your head.
  //
  // "Overhead" was anything starting more than 24 in above the floor, which made a
  // 36 in worktop the ceiling of the galley: raising the counters from 22 in to
  // their proper height instantly reported 23 sq ft of the trailer as having under
  // 78 in of headroom. A worktop is not a ceiling. Anything below the top of the
  // body band is furniture you walk around, and `blocked` already has it.
  for (const e of solids) {
    const [a0, a1] = span(e);
    for (let j = a0[1]; j <= a1[1]; j++) for (let i = a0[0]; i <= a1[0]; i++) {
      const f = floorTop[at(i, j)];
      if (!isFinite(f) || e.lo[2] < f + to) continue;             // not over your head
      if (e.lo[2] < ceil[at(i, j)]) ceil[at(i, j)] = e.lo[2];
    }
  }
  // 3. inside is floor below and something over your head. NOT airtight.
  //
  // This asked the CT, which answers a different question: the CT's ENCLOSED means
  // air the outside cannot reach. Fired at a plain room with an open doorway — a
  // box whose floor area is 80 sq ft by arithmetic — it reported eighty square
  // feet of nothing, because an open door means no air is enclosed. A room with
  // the door open is still a room. You are inside when there is a floor under you
  // and a roof over you.
  for (let k = 0; k < cells; k++)
    if (isFinite(floorTop[k]) && isFinite(ceil[k]) && ceil[k] - floorTop[k] >= to) inside[k] = 1;
  // 4. blocked: anything standing in the body band above the floor of that column.
  for (const e of solids) {
    const [a0, a1] = span(e);
    for (let j = a0[1]; j <= a1[1]; j++) for (let i = a0[0]; i <= a1[0]; i++) {
      const f = floorTop[at(i, j)];
      if (!isFinite(f)) continue;
      if (e.hi[2] <= f + from || e.lo[2] >= f + to) continue;
      blocked[at(i, j)] = 1;
    }
  }
  return { n, lo, step, at, blocked, inside, floorTop, ceil, floorZ: datum, band: [from, to] };
}

/**
 * How much of the floor you can stand up in, and how much you can only sit in.
 *
 * The ceiling of this trailer is a shed roof, so headroom is a gradient rather
 * than a number, and the honest answer is an area at each height.
 */
export function headroom(world, { step = 2 } = {}) {
  const p = plan(world, { step });
  const cellFt = (step * step) / 144;
  const hs = [];
  for (let k = 0; k < p.inside.length; k++)
    if (p.inside[k]) hs.push(p.ceil[k] - p.floorTop[k]);
  const areaOver = (h) => hs.filter(x => x >= h).length * cellFt;
  return {
    floor: +(hs.length * cellFt).toFixed(1),
    max: +(Math.max(0, ...hs)).toFixed(0),
    min: +(hs.length ? Math.min(...hs) : 0).toFixed(0),
    habitable: +areaOver(CODE.headroom.habitable).toFixed(1),
    service:   +areaOver(CODE.headroom.service).toFixed(1),
    coach:     +areaOver(CODE.headroom.coach).toFixed(1),
    standing:  +areaOver(BODY.crown).toFixed(1),
    basis: CODE.headroom.basis
  };
}

/**
 * The narrowest point on the widest route from the door to somewhere.
 *
 * Not the shortest path — the *widest*. You do not squeeze past the toilet if
 * there is a way round, so the number that matters is the bottleneck on the best
 * available route, which is a maximin problem and not a distance one.
 */
export function routes(world, { step = 2 } = {}) {
  const p = plan(world, { step });
  const { n, at, blocked, inside } = p;
  const free = (i, j) => i >= 0 && j >= 0 && i < n[0] && j < n[1] && !blocked[at(i, j)] && inside[at(i, j)];
  // distance to the nearest thing you would walk into, in cells
  const dist = new Float32Array(n[0] * n[1]).fill(Infinity);
  const q = [];
  for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    if (!free(i, j)) { dist[at(i, j)] = 0; q.push(i, j); }
  }
  for (let h = 0; h < q.length; h += 2) {
    const i = q[h], j = q[h + 1], d = dist[at(i, j)];
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x = i + di, y = j + dj;
      if (x < 0 || y < 0 || x >= n[0] || y >= n[1]) continue;
      if (dist[at(x, y)] > d + 1) { dist[at(x, y)] = d + 1; q.push(x, y); }
    }
  }
  const width = (i, j) => Math.max(0, (dist[at(i, j)] * 2 - 1) * step);   // inscribed, in inches
  const cellOf = (pt) => [Math.floor((pt[0] - p.lo[0]) / step), Math.floor((pt[1] - p.lo[1]) / step)];

  const door = world.all({ kind: 'opening' }).find(o => o.meta.type === 'door');
  if (!door) return { ok: false, why: 'no door to start from', headroom: null };
  // Every free cell in the doorway is a way in, not just the middle one.
  //
  // Seeded from a single cell, the search started on whichever cell happened to
  // be nearest the centre — which for a 36 in door is hard against a jamb, one
  // cell from a king stud, so its own clearance was two inches. A widest path is
  // the minimum along it, so every destination in the trailer came back "2 in at
  // the narrowest" and the bed came back unreachable. The bottleneck was the
  // instrument standing in the doorway.
  const best = new Float32Array(n[0] * n[1]).fill(-1);
  const heap = [];
  const c0 = cellOf([door.lo[0], door.lo[1]]), c1 = cellOf([door.hi[0], door.hi[1]]);
  const pad = Math.ceil(12 / step);
  let start = null;
  for (let j = Math.min(c0[1], c1[1]) - pad; j <= Math.max(c0[1], c1[1]) + pad; j++)
    for (let i = Math.min(c0[0], c1[0]) - pad; i <= Math.max(c0[0], c1[0]) + pad; i++) {
      if (!free(i, j)) continue;
      const v = width(i, j);
      if (v > best[at(i, j)]) { best[at(i, j)] = v; heap.push([v, i, j]); }
      if (!start || v > width(...start)) start = [i, j];
    }
  if (!heap.length) return { ok: false, why: 'no free floor inside the door' };
  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0]);
    const [v, i, j] = heap.pop();
    if (v < best[at(i, j)]) continue;
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x = i + di, y = j + dj;
      if (!free(x, y)) continue;
      const nv = Math.min(v, width(x, y));
      if (nv > best[at(x, y)]) { best[at(x, y)] = nv; heap.push([nv, x, y]); }
    }
  }
  const reachable = [...best].filter(v => v >= 0).length * (step * step) / 144;
  return { ok: true, start, width, best, at, n, lo: p.lo, step, free, reachable: +reachable.toFixed(1),
    /** The bottleneck on the best route from the door to this thing. */
    /**
     * The bottleneck on the best route to standing *next to* this thing.
     *
     * A fixed sixteen inch search around an element's centre finds nothing for a
     * five foot bed — you do not walk to the middle of a mattress, you walk to the
     * edge of it — and the bed came back unreachable in a trailer you can walk
     * round. The radius is the thing's own size plus a stride.
     */
    to(el) {
      const c = cellOf([(el.lo[0] + el.hi[0]) / 2, (el.lo[1] + el.hi[1]) / 2]);
      const R = Math.ceil((Math.max(el.hi[0] - el.lo[0], el.hi[1] - el.lo[1]) / 2 + 18) / step);
      let v = -1;
      for (let di = -R; di <= R; di++) for (let dj = -R; dj <= R; dj++) {
        const x = c[0] + di, y = c[1] + dj;
        if (x < 0 || y < 0 || x >= n[0] || y >= n[1]) continue;
        if (best[at(x, y)] > v) v = best[at(x, y)];
      }
      return v < 0 ? null : +v.toFixed(0);
    } };
}

/** A way out that is not the door you came in by. */
export function egress(world) {
  const out = { door: null, window: null };
  const door = world.all({ kind: 'opening' }).find(o => o.meta.type === 'door');
  if (door) {
    const w = Math.max(door.hi[0] - door.lo[0], door.hi[1] - door.lo[1]);
    const h = door.hi[2] - door.lo[2];
    out.door = { id: door.id, w: +w.toFixed(0), h: +h.toFixed(0),
      ok: w >= CODE.exitDoor.w && h >= CODE.exitDoor.h, basis: CODE.exitDoor.basis };
  }
  const wins = world.all({ kind: 'opening' }).filter(o => o.meta.type === 'window');
  const deck = world.all().filter(e => e.meta.role === 'floor sheathing');
  const floorZ = deck.length ? Math.max(...deck.map(e => e.hi[2])) : 0;
  const rated = wins.map(o => {
    const w = Math.max(o.hi[0] - o.lo[0], o.hi[1] - o.lo[1]);
    const h = o.hi[2] - o.lo[2];
    const area = (w * h) / 144;
    const sill = o.lo[2] - floorZ;
    return { id: o.id, w: +w.toFixed(0), h: +h.toFixed(0), area: +area.toFixed(1), sill: +sill.toFixed(0),
      ok: area >= CODE.egressWindow.area && Math.min(w, h) >= CODE.egressWindow.least && sill <= CODE.egressWindow.sill };
  }).sort((a, b) => b.area - a.area);
  out.windows = rated;
  out.window = rated.find(r => r.ok) || null;
  out.basis = CODE.egressWindow.basis;
  out.ok = !!(out.door && out.door.ok) && !!out.window;
  return out;
}

/** Room in front of the things you have to stand or sit in front of. */
export function clearances(world, { step = 2 } = {}) {
  const p = plan(world, { step });
  const want = { wc: CODE.toilet.front, lav: CODE.lav.front, sink: CODE.galley.front,
                 fridge: CODE.galley.front, 'shower.pan': 30 };
  const out = [];
  for (const [key, need] of Object.entries(want)) {
    let el = world.get(key) || world.all().find(e => e.id === key || e.meta.role === key);
    if (!el) continue;
    // A basin dropped into a counter has no clearance in front of it, because the
    // counter is in front of it. You do not stand in front of the bowl, you stand
    // in front of the cabinet — so ask the thing you actually walk up to.
    const host = el.meta.hostedBy ? world.get(el.meta.hostedBy) : null;
    const subject = host || el;
    // step outward from each of the four faces until something blocks
    let best = 0, dir = null;
    for (const [ax, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
      const mid = [(subject.lo[0] + subject.hi[0]) / 2, (subject.lo[1] + subject.hi[1]) / 2];
      let d = 0;
      for (; d < 60; d += step) {
        const q = mid.slice();
        // A full cell clear of the face, not half. The grid cell that straddles the
        // cabinet's own face is marked blocked *by the cabinet*, so probing at half
        // a cell read 4 in of clearance in front of a galley with a seven foot aisle
        // in front of it.
        q[ax] = (sgn > 0 ? subject.hi[ax] : subject.lo[ax]) + sgn * (d + step);
        const i = Math.floor((q[0] - p.lo[0]) / step), j = Math.floor((q[1] - p.lo[1]) / step);
        if (i < 0 || j < 0 || i >= p.n[0] || j >= p.n[1]) break;
        if (p.blocked[p.at(i, j)] || !p.inside[p.at(i, j)]) break;
      }
      if (d > best) { best = d; dir = `${'xy'[ax]}${sgn > 0 ? '+' : '-'}`; }
    }
    out.push({ id: el.id, at: subject.id, clear: best, need, dir, ok: best >= need,
      basis: key === 'wc' ? CODE.toilet.basis : key === 'lav' ? CODE.lav.basis : CODE.galley.basis });
  }
  return out;
}

/** Storage you would need a stool for. */
export function reach(world) {
  const deck = world.all().filter(e => e.meta.role === 'floor sheathing');
  const floorZ = deck.length ? Math.max(...deck.map(e => e.hi[2])) : 0;
  return world.all().filter(e => /cabinet|shelf|locker/.test(e.meta.role || e.kind))
    .map(e => ({ id: e.id, bottom: +(e.lo[2] - floorZ).toFixed(0), top: +(e.hi[2] - floorZ).toFixed(0),
      ok: e.hi[2] - floorZ <= BODY.reachHigh,
      easy: e.hi[2] - floorZ <= BODY.reachShelf }));
}

/** Everything, in one reading. */
export function habitat(world, { step = 2 } = {}) {
  const h = headroom(world, { step });
  const r = routes(world, { step });
  const e = egress(world);
  const c = clearances(world, { step });
  const targets = ['wc', 'sink', 'lav', 'bed.base', 'cab.galley'];
  const paths = r.ok ? targets.map(id => {
    const el = world.get(id); return el ? { id, bottleneck: r.to(el) } : null;
  }).filter(Boolean) : [];
  return { headroom: h, egress: e, clearances: c, reach: reach(world),
    reachable: r.ok ? r.reachable : 0, paths, routeError: r.ok ? null : r.why };
}

/**
 * Fire it at a room whose answer is arithmetic.
 *
 * 96 x 120 in of clear floor, 84 in to the ceiling, one 36 in doorway, nothing in
 * it: 80 sq ft, all of it reachable, headroom 84. The first version of this module
 * reported **zero square feet** for that room, because it asked the CT what was
 * inside and the CT means airtight — an open doorway means no air is enclosed. It
 * would have said the same about any real house with the door open, and it said
 * the trailer had 70 usable square feet out of 161.
 *
 * A habitability reading that has not been fired at a room you can measure with a
 * tape is not evidence.
 */
export function calibrate({ World, Element, box } = {}) {
  if (!World || !Element || !box) return { ok: false, why: 'pass World, Element and box in' };
  const w = new World();
  const put = (id, lo, hi, meta = {}) => w.add(new Element({ id, kind: 'sheathing', layer: 'walls',
    material: 'ply', box: box([0,1,2].map(i => (lo[i]+hi[i])/2), [0,1,2].map(i => hi[i]-lo[i])), meta }));
  put('cal.deck', [0,0,15], [96,120,16], { role: 'floor sheathing' });
  put('cal.ceil', [0,0,100], [96,120,101], { role: 'ceiling' });
  put('cal.W', [-1,0,16], [0,120,100]);   put('cal.E', [96,0,16], [97,120,100]);
  put('cal.N', [0,120,16], [96,121,100]);
  put('cal.S1', [0,-1,16], [30,0,100]);   put('cal.S2', [66,-1,16], [96,0,100]);
  w.add(new Element({ id: 'cal.door', kind: 'opening', layer: 'walls', material: 'air',
    box: box([48,-0.5,58],[36,1,84]), meta: { type: 'door' } }));
  const h = headroom(w), r = routes(w);
  const exact = (96 * 120) / 144;                       // 80 sq ft, by arithmetic
  const areaOk = Math.abs(h.floor - exact) <= 4;        // 2 in grid at four walls
  const reachOk = r.ok && r.reachable >= h.floor * 0.9;
  const heightOk = Math.abs(h.max - 84) <= 1;
  return { ok: areaOk && reachOk && heightOk,
    floor: h.floor, exact, reachable: r.ok ? r.reachable : 0, height: h.max,
    verdict: areaOk && reachOk && heightOk
      ? 'the instrument can measure a room'
      : `the instrument reads ${h.floor} sq ft and ${r.ok ? r.reachable : 0} reachable in a room that is ${exact} sq ft of open floor` };
}
