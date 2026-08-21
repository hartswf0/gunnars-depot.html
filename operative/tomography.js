// operative/tomography.js — slice the patient, and let every part hold the lamp.
//
// The ray scan in radiography.js answers one question well: does light get out.
// It cannot say what is *inside*, and it cannot say which part the hole belongs
// to. Two more instruments, both built on the same caster:
//
//   1. VOXELS. Fill the bounding box with a grid, mark what is material, then
//      flood the air inward from the outside. Air the flood cannot reach is an
//      enclosed cavity — a room, a wall bay, or a pocket nobody meant to make.
//      This is the CT: the slices are cuts through that labelled volume, and the
//      labels are the diagnosis.
//
//      It is also a completely independent check on the ray scan. If the inside
//      of a building is reachable from the outside by a flood through air, the
//      building leaks — arrived at by a different method, with different failure
//      modes. Two instruments agreeing is worth more than one instrument
//      insisting.
//
//   2. EXPOSURE. Put the lamp on each part in turn and see how much of its light
//      reaches the sky. An exterior panel is supposed to be exposed. A cabinet is
//      not. Every interior part with exposure is a part standing next to a hole,
//      and the union of those maps is the leak attributed to the parts that
//      should have closed it.

import { cast, occludersOf, bounds, sphereDirections } from './radiography.js';

export const LABEL = { OUTSIDE: 0, MATERIAL: 1, ENCLOSED: 2 };

/**
 * Occupancy grid. `step` in inches; 2 in on a 20 ft trailer is about 420,000
 * cells, which is a fifth of a second and enough to see a stud bay.
 */
export function voxelise(occluders, { step = 2, pad = 1 } = {}) {
  const solids = occluders.solids || occluders;
  const b = bounds(solids);
  const lo = b.lo.map(v => v - step * pad);
  const n = [0, 1, 2].map(i => Math.max(1, Math.ceil((b.hi[i] + step * pad - lo[i]) / step)));
  const grid = new Uint8Array(n[0] * n[1] * n[2]);
  const at = (x, y, z) => (z * n[1] + y) * n[0] + x;
  // Mark material by walking each solid's own cells rather than testing every
  // cell against every solid: 420,000 x 260 is a hundred million tests and this
  // is a few hundred thousand.
  for (const e of solids) {
    const a = [0, 1, 2].map(i => Math.max(0, Math.floor((e.lo[i] - lo[i]) / step)));
    const z = [0, 1, 2].map(i => Math.min(n[i] - 1, Math.ceil((e.hi[i] - lo[i]) / step)));
    for (let k = a[2]; k <= z[2]; k++)
      for (let j = a[1]; j <= z[1]; j++)
        for (let i = a[0]; i <= z[0]; i++) {
          const p = [lo[0] + (i + 0.5) * step, lo[1] + (j + 0.5) * step, lo[2] + (k + 0.5) * step];
          if (e.tri) { grid[at(i, j, k)] = LABEL.MATERIAL; continue; }   // a surface: its cells are material
          // Overlap, not centre-inside. A half-inch panel on a two-inch grid only
          // catches the cells whose centres happen to land in it — roughly one
          // column in four — so the skin came out porous and the flood walked
          // straight into the building. Every wall in the model was a sieve and
          // the CT reported no enclosed volume at all.
          const half = step / 2;
          if (p[0] + half > e.lo[0] && p[0] - half < e.hi[0] &&
              p[1] + half > e.lo[1] && p[1] - half < e.hi[1] &&
              p[2] + half > e.lo[2] && p[2] - half < e.hi[2]) grid[at(i, j, k)] = LABEL.MATERIAL;
        }
  }
  return { grid, n, lo, step, at, count: grid.length };
}

/**
 * Flood the air from the border inward. What the flood reaches is outside; what
 * it does not is enclosed. A building that works has exactly one big enclosed
 * region — the rooms — and a handful of small ones, which are the stud bays.
 */
export function flood(vox) {
  const { grid, n, at } = vox;
  const seen = new Uint8Array(grid.length);
  const q = [];
  const push = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= n[0] || y >= n[1] || z >= n[2]) return;
    const i = at(x, y, z);
    if (seen[i] || grid[i] === LABEL.MATERIAL) return;
    seen[i] = 1; q.push(x, y, z);
  };
  for (let z = 0; z < n[2]; z++) for (let y = 0; y < n[1]; y++) { push(0, y, z); push(n[0] - 1, y, z); }
  for (let z = 0; z < n[2]; z++) for (let x = 0; x < n[0]; x++) { push(x, 0, z); push(x, n[1] - 1, z); }
  for (let y = 0; y < n[1]; y++) for (let x = 0; x < n[0]; x++) { push(x, y, 0); push(x, y, n[2] - 1); }
  while (q.length) {
    const z = q.pop(), y = q.pop(), x = q.pop();
    push(x + 1, y, z); push(x - 1, y, z);
    push(x, y + 1, z); push(x, y - 1, z);
    push(x, y, z + 1); push(x, y, z - 1);
  }
  let material = 0, outside = 0, enclosed = 0;
  const label = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === LABEL.MATERIAL) { label[i] = LABEL.MATERIAL; material++; }
    else if (seen[i]) { label[i] = LABEL.OUTSIDE; outside++; }
    else { label[i] = LABEL.ENCLOSED; enclosed++; }
  }
  return { ...vox, label, material, outside, enclosed };
}

/** The enclosed regions, separately, largest first. */
export function cavities(v, { minCells = 8 } = {}) {
  const { label, n, at, lo, step } = v;
  const seen = new Uint8Array(label.length);
  const out = [];
  for (let z = 0; z < n[2]; z++) for (let y = 0; y < n[1]; y++) for (let x = 0; x < n[0]; x++) {
    const i0 = at(x, y, z);
    if (seen[i0] || label[i0] !== LABEL.ENCLOSED) continue;
    const q = [x, y, z]; seen[i0] = 1;
    let cells = 0;
    const mn = [x, y, z], mx = [x, y, z];
    while (q.length) {
      const cz = q.pop(), cy = q.pop(), cx = q.pop();
      cells++;
      for (let k = 0; k < 3; k++) { const c = [cx, cy, cz][k]; if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c; }
      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= n[0] || ny >= n[1] || nz >= n[2]) continue;
        const i = at(nx, ny, nz);
        if (seen[i] || label[i] !== LABEL.ENCLOSED) continue;
        seen[i] = 1; q.push(nx, ny, nz);
      }
    }
    if (cells < minCells) continue;
    out.push({
      cells, volume: +(cells * step ** 3 / 1728).toFixed(2),            // cubic feet
      lo: mn.map((c, k) => +(lo[k] + c * step).toFixed(1)),
      hi: mx.map((c, k) => +(lo[k] + (c + 1) * step).toFixed(1))
    });
  }
  return out.sort((a, b) => b.cells - a.cells);
}

/**
 * The route the air takes.
 *
 * "Enclosed = 0" tells you the building leaks and nothing else. This walks the
 * shortest path through air from a point inside to the outside of the grid and
 * hands back the route in inches — which is the hole, plus everything the air had
 * to get past to reach it. Tracing the path rather than reporting the number is
 * the difference between "there is a leak" and "it goes out here".
 */
export function escapeRoute(v, from) {
  const { grid, n, at, lo, step } = v;
  const start = [0, 1, 2].map(i => Math.max(0, Math.min(n[i] - 1, Math.round((from[i] - lo[i]) / step - 0.5))));
  if (grid[at(...start)] === LABEL.MATERIAL) return { ok: false, why: 'that point is inside something' };
  const prev = new Int32Array(grid.length).fill(-1);
  const seen = new Uint8Array(grid.length);
  let q = [start], head = 0;
  seen[at(...start)] = 1;
  let exit = null;
  const queue = [at(...start)];
  const coords = (i) => { const x = i % n[0]; const y = ((i - x) / n[0]) % n[1];
                          const z = ((i - x) / n[0] - y) / n[1]; return [x, y, z]; };
  while (head < queue.length && !exit) {
    const i = queue[head++];
    const [x, y, z] = coords(i);
    if (x === 0 || y === 0 || z === 0 || x === n[0] - 1 || y === n[1] - 1 || z === n[2] - 1) { exit = i; break; }
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= n[0] || ny >= n[1] || nz >= n[2]) continue;
      const j = at(nx, ny, nz);
      if (seen[j] || grid[j] === LABEL.MATERIAL) continue;
      seen[j] = 1; prev[j] = i; queue.push(j);
    }
  }
  if (exit === null) return { ok: true, sealed: true, path: [], note: 'no path out through air' };
  const path = [];
  for (let i = exit; i !== -1; i = prev[i]) {
    const [x, y, z] = coords(i);
    path.push([+(lo[0] + (x + 0.5) * step).toFixed(1),
               +(lo[1] + (y + 0.5) * step).toFixed(1),
               +(lo[2] + (z + 0.5) * step).toFixed(1)]);
  }
  path.reverse();
  return { ok: true, sealed: false, path, cells: path.length,
           through: path[Math.max(0, path.length - 3)], out: path[path.length - 1] };
}

/**
 * One cut through the labelled volume. `axis` 0/1/2 for sagittal / coronal /
 * axial — which in a building are: across the width, across the length, and the
 * plan cut a drawing already calls a floor plan.
 */
export function slice(v, axis, index) {
  const { label, n, at } = v;
  const u = axis === 0 ? 1 : 0, w = axis === 2 ? 1 : 2;
  const W = n[u], H = n[w];
  const px = new Uint8Array(W * H);
  for (let b = 0; b < H; b++) for (let a = 0; a < W; a++) {
    const c = [0, 0, 0];
    c[axis] = index; c[u] = a; c[w] = b;
    px[b * W + a] = label[at(c[0], c[1], c[2])];
  }
  return { w: W, h: H, px, axis, index,
           at: +(v.lo[axis] + (index + 0.5) * v.step).toFixed(1) };
}

/** Every cut along an axis, for a scrubber. */
export const sliceCount = (v, axis) => v.n[axis];

/**
 * EXPOSURE — the lamp goes on each part in turn.
 *
 * Rays leave a shell just outside the part's own surface, so it does not block
 * itself, and are counted as escaping if they reach the outside without hitting
 * anything. An exterior panel should be exposed. A cabinet should not be. Every
 * interior part with exposure is standing next to a hole, and the union of their
 * maps is the leak attributed to the parts that should have closed it.
 */
/** The label of the cell a world point falls in. */
export function labelAt(v, p) {
  const c = [0, 1, 2].map(i => Math.floor((p[i] - v.lo[i]) / v.step));
  if (c.some((x, i) => x < 0 || x >= v.n[i])) return LABEL.OUTSIDE;
  return v.label ? v.label[v.at(...c)] : v.grid[v.at(...c)];
}

export function exposure(occluders, { rays = 64, ids = null, skin = 0.6, sample = 3,
                                      subjects = null, enclosure = null } = {}) {
  const solids = occluders.solids || occluders;
  // The thing holding the lamp need not be the thing that blocks it. On a mesh
  // every triangle is a "part", which is 1,350 lamps and no meaning; the parts a
  // person named are the subjects, and the triangles remain the occluders.
  const lamps = subjects || solids;
  const b = bounds(solids);
  const R = Math.hypot(...b.size) * 2;
  const dirs = sphereDirections(rays);
  const out = [];
  for (const e of lamps) {
    if (ids && !ids.has(e.id)) continue;
    // sample points on the part's own surface, pushed out by `skin`
    const pts = [];
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const p = [0, 1, 2].map(k => (e.lo[k] + e.hi[k]) / 2);
        p[i] = s < 0 ? e.lo[i] - skin : e.hi[i] + skin;
        pts.push(p);
        // and a few off-centre, so a long member is not judged by its midpoint
        for (let j = 1; j < sample; j++) {
          const q = p.slice();
          const other = (i + 1) % 3;
          q[other] = e.lo[other] + (e.hi[other] - e.lo[other]) * (j / sample);
          pts.push(q);
        }
      }
    }
    let escaped = 0, blocked = 0;
    const faces = {};
    // Where the lamp may stand. Pushed 0.6 in off a corner stud, a sample lands
    // outside the wall it is part of, and a lamp standing in the garden reports
    // the whole sky as exposure — every stud, plate and sole in the trailer came
    // back "unexpectedly exposed" that way.
    //
    // The CT already knows what is inside: given its flood, a sample counts only
    // if it lands in enclosed air. Without one, fall back to "not buried in
    // another solid", which is weaker and says so.
    const usable = pts.filter(p => enclosure
      ? labelAt(enclosure, p) === LABEL.ENCLOSED
      : !solids.some(o => o.id !== e.id && !o.tri &&
          p[0] > o.lo[0] && p[0] < o.hi[0] && p[1] > o.lo[1] &&
          p[1] < o.hi[1] && p[2] > o.lo[2] && p[2] < o.hi[2]));
    if (!usable.length && enclosure) {
      out.push({ id: e.id, kind: e.kind, layer: e.layer, cast: 0, escaped: 0,
                 fraction: 0, outside: true, faces: {} });
      continue;
    }
    for (const p of (usable.length ? usable : pts)) for (const d of dirs) {
      if (cast(p, d, solids, R)) { blocked++; continue; }
      escaped++;
      // which way out
      let best = null, bt = Infinity;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) continue;
        for (const [plane, name] of [[b.lo[i], `-${'xyz'[i]}`], [b.hi[i], `+${'xyz'[i]}`]]) {
          const t = (plane - p[i]) / d[i];
          if (t > 1e-6 && t < bt) { bt = t; best = name; }
        }
      }
      if (best) faces[best] = (faces[best] || 0) + 1;
    }
    const cast_ = escaped + blocked;
    out.push({ id: e.id, kind: e.kind, layer: e.layer, cast: cast_, escaped,
               buried: usable.length === 0,
               fraction: cast_ ? +(escaped / cast_).toFixed(3) : 0, faces });
  }
  return out.sort((a, b) => b.fraction - a.fraction);
}

/**
 * Which parts are exposed that should not be. The rule is not a list of names:
 * a part is expected to see the sky if it is *on* the outside, which is a fact
 * about its position, not its label. So the envelope is whatever the outermost
 * shell of the model is, and anything inboard of it with exposure is a finding.
 */
// Not `services`: a PV panel is equipment and it lives on the roof, so exposure
// is its job. The layers that are supposed to be indoors are the framing and the
// things standing on the floor.
export const INSIDE_LAYERS = new Set(['interior', 'frame']);

/**
 * Which parts see the sky that should not.
 *
 * With a chart — a World, where a part knows what layer it is on — this is
 * exact: a cabinet or a stud with exposure is standing next to a hole. With a
 * bare mesh there is no chart, only a geometric guess, and the guess is weak:
 * on a 1,350-triangle concept study it called seventy parts of eighty-four
 * "unexpected", because nearly everything in a thin-shelled model touches the
 * bounding box. So it says which it did, and how sure it is.
 */
export function unexpectedExposure(occluders, exp, { margin = 1.5, subjects = null } = {}) {
  const solids = occluders.solids || occluders;
  const b = bounds(solids);
  const byId = new Map((subjects || solids).map(e => [e.id, e]));
  const charted = exp.some(x => INSIDE_LAYERS.has(x.layer));
  const onTheOutside = (e) => !e || [0, 1, 2].some(i =>
    e.lo[i] <= b.lo[i] + margin || e.hi[i] >= b.hi[i] - margin);
  const hits = exp.filter(x => x.fraction > 0.001 &&
    (charted ? INSIDE_LAYERS.has(x.layer) : !onTheOutside(byId.get(x.id))));
  hits.sort((a, b) => b.fraction - a.fraction);
  hits.basis = charted
    ? 'the part says what layer it is on, so this is exact'
    : 'no chart: inferred from position alone, and on a thin-shelled mesh that is a weak guess';
  return hits;
}

/** One occluder-shaped record per named part of a mesh, for use as `subjects`. */
export function partsOf(mesh, tris) {
  return (mesh.parts || []).map((p, i) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let t = p.start; t < p.start + p.count; t++)
      for (let v = 0; v < 3; v++)
        for (let k = 0; k < 3; k++) {
          const c = tris[(t * 3 + v) * 3 + k];
          if (c < lo[k]) lo[k] = c;
          if (c > hi[k]) hi[k] = c;
        }
    return { id: p.name || `part.${i}`, kind: 'part', layer: 'mesh', lo, hi,
             start: p.start, count: p.count };
  }).filter(p => Number.isFinite(p.lo[0]));
}
