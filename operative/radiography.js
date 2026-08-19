// operative/radiography.js — light the inside and see where it gets out.
//
// Every check in this project so far has had to know what it was looking for.
// UNJOINED knows about fasteners. PONDING knows about slope. ACCESS_BLOCKED knows
// about NEC 110.26. Each one answers a question somebody thought to ask, and the
// things that hurt are the ones nobody thought to ask about — the wall skin that
// stopped at the top plate and left a band of open air right round the building,
// found by accident, in a photograph.
//
// This asks nothing. It fills the inside with light and records where the light
// gets out. A ray does not need to know what a wall is; it only needs to not hit
// one. Anywhere a ray escapes that is not a window is a hole, and the map of
// escapes is a map of the holes, whether or not anyone has a rule for them.
//
// The dome is the film. Sit a sphere outside the building, fire rays from inside,
// and every ray that reaches the sphere exposes a point on it. A sealed building
// exposes nothing. A building with a seam exposes a line.
//
// AND — the reason this matters more than another check:
//
//   Fire the same rays at a box you *know* is sealed. If they get out, the
//   instrument is broken, not the building.
//
// That is `calibrate()`, and it is the difference between "the building is
// fucked" and "our eyes are fucked". No other check in here can tell those apart.

import { poly, aabb, segmentPoly } from './poly.js';

// ---------------------------------------------------------------- directions
/**
 * A Fibonacci sphere: n directions spread as evenly as a sphere allows, with no
 * randomness at all. Two scans of the same building are the same scan, which is
 * the whole reason to prefer it over Monte Carlo here — a leak that appears and
 * disappears between runs teaches you nothing.
 */
export function sphereDirections(n) {
  const out = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = phi * i;
    out.push([Math.cos(a) * r, Math.sin(a) * r, z]);
  }
  return out;
}

// ---------------------------------------------------------------- occluders
/**
 * What stops a ray. Not everything in the model does: a conduit is not a wall, a
 * window opening is a hole on purpose, and services hang in the air rather than
 * enclosing anything.
 */
export const TRANSPARENT = new Set(['run', 'opening', 'port']);

export function occludersOf(world, { include = null, openings = 'transparent' } = {}) {
  const out = [];
  for (const e of world.all()) {
    if (TRANSPARENT.has(e.kind)) continue;
    if (e.layer === 'services' && e.kind !== 'panel') continue;
    if (include && !include(e)) continue;
    const P = poly(e.box, e.shear);
    const bb = aabb(P);
    out.push({ id: e.id, kind: e.kind, layer: e.layer, P, lo: bb.lo, hi: bb.hi });
  }
  // The openings are the holes the building is supposed to have. They are cut
  // through the skin as their own elements, so a ray leaving through a window has
  // to be told apart from a ray leaving through a seam — otherwise every window
  // reads as a defect and the real defects drown.
  const holes = openings === 'transparent'
    ? world.all({ kind: 'opening' }).map(o => {
        const P = poly(o.box, o.shear); const bb = aabb(P);
        return { id: o.id, kind: 'opening', P, lo: bb.lo, hi: bb.hi, meta: o.meta };
      })
    : [];
  return { solids: out, holes };
}

// ---------------------------------------------------------------- casting
/** Slab test: does the ray's AABB range overlap this box at all? Cheap reject. */
function slab(o, invd, lo, hi, tmax) {
  let t0 = 0, t1 = tmax;
  for (let i = 0; i < 3; i++) {
    const a = (lo[i] - o[i]) * invd[i], b = (hi[i] - o[i]) * invd[i];
    const lo_ = a < b ? a : b, hi_ = a < b ? b : a;
    if (lo_ > t0) t0 = lo_;
    if (hi_ < t1) t1 = hi_;
    if (t0 > t1) return null;
  }
  return t0;
}

/**
 * Nearest thing the ray hits, exactly. The broad phase is an axis-aligned slab
 * test because it is six comparisons; the exact test is only run on what survives
 * it, because a rafter is a sheared box and its bounding box is a lie about where
 * it is — the same lie that once swallowed the whole roof cover.
 */
export function cast(origin, dir, occ, tmax = 1e6) {
  const invd = [1 / (dir[0] || 1e-12), 1 / (dir[1] || 1e-12), 1 / (dir[2] || 1e-12)];
  let best = null;
  const end = [origin[0] + dir[0] * tmax, origin[1] + dir[1] * tmax, origin[2] + dir[2] * tmax];
  for (const e of occ) {
    const t = slab(origin, invd, e.lo, e.hi, tmax);
    if (t === null || (best && t > best.t)) continue;
    let tt;
    if (e.tri) {
      tt = rayTriangle(origin, dir, e.tri);
      if (tt === null || tt > tmax) continue;
    } else {
      const hit = segmentPoly(origin, end, e.P);
      if (!hit) continue;
      tt = hit.t0 * tmax;
      if (tt < 1e-6) continue;                      // started inside it; ignore this face
    }
    if (!best || tt < best.t) best = { t: tt, id: e.id, kind: e.kind, layer: e.layer };
  }
  return best;
}

/** Total material a ray passes through, for a radiograph rather than a leak map. */
export function attenuate(origin, dir, occ, tmax, density) {
  const invd = [1 / (dir[0] || 1e-12), 1 / (dir[1] || 1e-12), 1 / (dir[2] || 1e-12)];
  const end = [origin[0] + dir[0] * tmax, origin[1] + dir[1] * tmax, origin[2] + dir[2] * tmax];
  let sum = 0;
  for (const e of occ) {
    if (slab(origin, invd, e.lo, e.hi, tmax) === null) continue;
    if (e.tri) {
      // A surface has no thickness, so a mesh radiograph counts crossings rather
      // than path length: two crossings is one wall's worth of stuff.
      if (rayTriangle(origin, dir, e.tri) !== null) sum += 0.5 * (density ? density(e) : 1);
      continue;
    }
    const hit = segmentPoly(origin, end, e.P);
    if (!hit) continue;
    sum += (hit.t1 - hit.t0) * tmax * (density ? density(e) : 1);
  }
  return sum;
}

// ---------------------------------------------------------------- the scan
export function bounds(list) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const e of list) for (let i = 0; i < 3; i++) {
    if (e.lo[i] < lo[i]) lo[i] = e.lo[i];
    if (e.hi[i] > hi[i]) hi[i] = e.hi[i];
  }
  return { lo, hi, c: lo.map((v, i) => (v + hi[i]) / 2),
           size: lo.map((v, i) => hi[i] - v) };
}

/** Where a ray crosses the shell of the building — which is where the hole is. */
function shellCrossing(origin, dir, b) {
  let t = Infinity, face = null;
  for (let i = 0; i < 3; i++) {
    for (const [plane, name] of [[b.lo[i], `-${'xyz'[i]}`], [b.hi[i], `+${'xyz'[i]}`]]) {
      if (Math.abs(dir[i]) < 1e-9) continue;
      const tt = (plane - origin[i]) / dir[i];
      if (tt <= 1e-6 || tt >= t) continue;
      const p = [0, 1, 2].map(k => origin[k] + dir[k] * tt);
      let inside = true;
      for (let k = 0; k < 3; k++) if (k !== i && (p[k] < b.lo[k] - 0.5 || p[k] > b.hi[k] + 0.5)) inside = false;
      if (inside) { t = tt; face = name; }
    }
  }
  return t === Infinity ? null : { t, face, at: [0, 1, 2].map(k => origin[k] + dir[k] * t) };
}

/**
 * Fire rays from every emitter in every direction and record what got out.
 *
 * `escapes` is the finding. `throughOpening` is the control group: rays that left
 * through a window are not leaks, and counting them as leaks is exactly how a
 * diagnostic teaches you to ignore it.
 */
export function scan(occluders, emitters, {
  rays = 256, radius = null, openings = [], holeTolerance = 1.0
} = {}) {
  const solids = occluders.solids || occluders;
  const holes = occluders.holes || openings;
  const b = bounds(solids);
  const R = radius || Math.hypot(...b.size);
  const dirs = sphereDirections(rays);
  const escapes = [], viaOpening = [];
  let blocked = 0, cast_ = 0;

  for (const src of emitters) {
    for (const d of dirs) {
      cast_++;
      const hit = cast(src, d, solids, R * 2);
      if (hit) { blocked++; continue; }
      // it got out. Where did it cross the shell, and did it go through a window?
      const x = shellCrossing(src, d, b);
      if (!x) { blocked++; continue; }
      // Asked at the shell crossing, this was wrong for every ray leaving at an
      // angle: a ray through the west door exits the bounding box at the north
      // end, matches no opening there, and is filed as a leak. Six hundred of
      // them were. The question is whether the ray passed through the opening,
      // which is a question about the ray, not about where it ended up.
      const through = holes.length ? cast(src, d, holes, x.t + holeTolerance) : null;
      const rec = { from: src, dir: d, at: x.at, face: x.face, t: +x.t.toFixed(1) };
      if (through) viaOpening.push({ ...rec, opening: through.id });   // the control group
      else escapes.push(rec);
    }
  }
  return {
    cast: cast_, blocked, escapes, viaOpening,
    leakFraction: cast_ ? +(escapes.length / cast_).toFixed(4) : 0,
    sealed: escapes.length === 0, bounds: b, radius: R, rays
  };
}

/**
 * Where to stand the lamps. A grid through the inside of the framed box, keeping
 * only the points that are in air — because a lamp inside a cabinet measures the
 * cabinet, and a lamp inside a wall measures nothing at all.
 */
export function emittersFor(world, { step = 24, margin = 6 } = {}) {
  const frame = world.solids().filter(e => e.layer === 'frame');
  const b = bounds((frame.length ? frame : world.solids()).map(e => ({ lo: e.lo, hi: e.hi })));
  const occ = occludersOf(world).solids;
  const out = [];
  for (let x = b.lo[0] + margin; x <= b.hi[0] - margin; x += step)
    for (let y = b.lo[1] + margin; y <= b.hi[1] - margin; y += step)
      for (let z = b.lo[2] + margin; z <= b.hi[2] - margin; z += step) {
        const p = [x, y, z];
        if (occ.some(e => p[0] > e.lo[0] && p[0] < e.hi[0] && p[1] > e.lo[1] &&
                          p[1] < e.hi[1] && p[2] > e.lo[2] && p[2] < e.hi[2])) continue;
        // A lamp stands on a floor. Seeded anywhere inside the frame's bounding
        // box, they went into the wheel wells — which are open to the road by
        // design — and reported seventeen rays escaping through the bottom of the
        // trailer as though the floor were missing. A point with nothing under it
        // is not in the room.
        if (!cast(p, [0, 0, -1], occ, 400)) continue;
        out.push(p);
      }
  return out;
}

// ---------------------------------------------------------------- the dome
/**
 * The film. Every escaping ray exposes one point on a sphere around the building;
 * the image is that sphere unrolled. A sealed building develops black. A seam
 * develops as a line, because a seam is a line.
 */
export function dome(escapes, w = 360, h = 180) {
  const px = new Float64Array(w * h);
  let peak = 0;
  for (const e of escapes) {
    const d = e.dir;
    const lon = Math.atan2(d[1], d[0]);                   // -pi..pi
    const lat = Math.asin(Math.max(-1, Math.min(1, d[2])));  // -pi/2..pi/2
    const x = Math.min(w - 1, Math.max(0, Math.floor((lon + Math.PI) / (2 * Math.PI) * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor((Math.PI / 2 - lat) / Math.PI * h)));
    const v = ++px[y * w + x];
    if (v > peak) peak = v;
  }
  return { w, h, px, peak };
}

/**
 * The building's own surface, unfolded flat, with every escape plotted where it
 * actually left. This is the plate worth looking at.
 *
 * The dome above sorts escapes by the *direction* they went, which is what a
 * physical dome would record and is nearly useless here: one hole sprays rays
 * across half the sky, and 226 of them over a 720x360 plate is a starfield.
 * A leak has a *place*. Unfolded, the six faces of the building lie flat in a
 * cross and a seam draws itself as a line on the face it is in.
 *
 *          +z
 *    -x    +y    +x    -y
 *          -z
 */
export function unwrap(escapes, b, cell = 120) {
  const W = b.size[0], L = b.size[1], H = b.size[2];
  const sx = cell / Math.max(W, L, H);
  const cw = Math.ceil(W * sx), cl = Math.ceil(L * sx), ch = Math.ceil(H * sx);
  // column widths across the cross: -x is L deep, +y is W wide, +x is L, -y is W
  const cols = [cl, cw, cl, cw];
  const x0 = [0, cols[0], cols[0] + cols[1], cols[0] + cols[1] + cols[2]];
  const w = x0[3] + cols[3], h = ch + Math.max(cl, ch) * 0 + cl + cl;
  const rowTop = 0, rowMid = cl, rowBot = cl + ch;
  const H2 = rowBot + cl;
  const px = new Float64Array(w * H2);
  let peak = 0;
  const put = (px_, py_) => {
    const ix = Math.round(px_), iy = Math.round(py_);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = ix + dx, Y = iy + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= H2) continue;
      const v = (px[Y * w + X] += (dx === 0 && dy === 0) ? 1 : 0.35);
      if (v > peak) peak = v;
    }
  };
  for (const e of escapes) {
    const p = e.at;
    const u = (i) => (p[i] - b.lo[i]) * sx;              // 0..extent, in pixels
    switch (e.face) {
      case '+z': put(x0[1] + u(0), rowTop + (cl - u(1))); break;
      case '-z': put(x0[1] + u(0), rowBot + u(1)); break;
      case '-x': put(x0[0] + u(1), rowMid + (ch - u(2))); break;
      case '+y': put(x0[1] + u(0), rowMid + (ch - u(2))); break;
      case '+x': put(x0[2] + (cl - u(1)), rowMid + (ch - u(2))); break;
      case '-y': put(x0[3] + (cw - u(0)), rowMid + (ch - u(2))); break;
    }
  }
  return { w, h: H2, px, peak,
           faces: [
             { face: '+z', x: x0[1], y: rowTop, w: cw, h: cl, label: 'ROOF' },
             { face: '-x', x: x0[0], y: rowMid, w: cl, h: ch, label: 'WEST' },
             { face: '+y', x: x0[1], y: rowMid, w: cw, h: ch, label: 'NORTH' },
             { face: '+x', x: x0[2], y: rowMid, w: cl, h: ch, label: 'EAST' },
             { face: '-y', x: x0[3], y: rowMid, w: cw, h: ch, label: 'SOUTH' },
             { face: '-z', x: x0[1], y: rowBot, w: cw, h: cl, label: 'UNDERSIDE' }
           ] };
}

/**
 * A radiograph. Parallel rays through the building, each one carrying how much
 * material it passed through. This is the plain X-ray: it does not find holes, it
 * shows you density, and a thing that is not where you thought it was shows up as
 * a shadow in the wrong place.
 */
export function radiograph(occluders, axis = 0, { w = 256, h = 256, density = null } = {}) {
  const solids = occluders.solids || occluders;
  const b = bounds(solids);
  const u = axis === 0 ? 1 : 0, v = 2;
  const dir = [0, 0, 0]; dir[axis] = 1;
  const px = new Float64Array(w * h);
  let peak = 0;
  const span = Math.hypot(...b.size) * 2;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = [0, 0, 0];
      o[axis] = b.lo[axis] - span / 4;
      o[u] = b.lo[u] + (b.size[u] * (i + 0.5)) / w;
      o[v] = b.hi[v] - (b.size[v] * (j + 0.5)) / h;
      const a = attenuate(o, dir, solids, span, density);
      px[j * w + i] = a;
      if (a > peak) peak = a;
    }
  }
  return { w, h, px, peak, axis, bounds: b };
}

// ---------------------------------------------------------------- clustering
/**
 * Escapes gather. One hole makes a cloud of exit points a few inches across, and
 * a list of 4,000 exit points is not something anyone can read. Cluster them, and
 * name the parts that bound each one.
 */
export function clusters(escapes, radius = 6) {
  const pts = escapes.map(e => e.at);
  const seen = new Uint8Array(pts.length);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    if (seen[i]) continue;
    const q = [i]; seen[i] = 1;
    const members = [];
    while (q.length) {
      const k = q.pop(); members.push(k);
      for (let j = 0; j < pts.length; j++) {
        if (seen[j]) continue;
        const d = Math.hypot(pts[k][0] - pts[j][0], pts[k][1] - pts[j][1], pts[k][2] - pts[j][2]);
        if (d <= radius) { seen[j] = 1; q.push(j); }
      }
    }
    const at = [0, 1, 2].map(a => members.reduce((s, m) => s + pts[m][a], 0) / members.length);
    out.push({ n: members.length, at: at.map(n => +n.toFixed(1)),
               face: escapes[members[0]].face,
               extent: [0, 1, 2].map(a =>
                 +(Math.max(...members.map(m => pts[m][a])) - Math.min(...members.map(m => pts[m][a]))).toFixed(1)) });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** What is around a leak — the parts that ought to have closed it. */
export function around(world, at, radius = 12) {
  return world.all()
    .filter(e => !TRANSPARENT.has(e.kind))
    .map(e => ({ id: e.id, kind: e.kind,
      d: Math.hypot(...[0, 1, 2].map(i => Math.max(e.lo[i] - at[i], at[i] - e.hi[i], 0))) }))
    .filter(x => x.d <= radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
}

// ---------------------------------------------------------------- meshes
/**
 * The same scan on an existing structure, from a mesh.
 *
 * Nothing about the method changes — rays still go out or they do not — but a
 * triangle is not a box, so it gets a triangle test. Möller-Trumbore, no
 * precomputation, wrapped in the same slab reject as everything else.
 *
 * This is the point at which the scanner stops being about *this* trailer. Any
 * STL in the repository, or any STL anyone drops in, can be filled with light and
 * asked whether it holds any.
 */
export function fromTriangles(tris) {
  // `parseSTL` returns a flat Float32Array of nine numbers per triangle, which is
  // how every STL reader returns them and not at all what a nested array looks
  // like. Accept either.
  const flat = ArrayBuffer.isView(tris) || (tris.length && typeof tris[0] === 'number');
  const n = flat ? tris.length / 9 : tris.length;
  const solids = [];
  for (let i = 0; i < n; i++) {
    const t = flat
      ? [[tris[i * 9], tris[i * 9 + 1], tris[i * 9 + 2]],
         [tris[i * 9 + 3], tris[i * 9 + 4], tris[i * 9 + 5]],
         [tris[i * 9 + 6], tris[i * 9 + 7], tris[i * 9 + 8]]]
      : tris[i];
    const lo = [0, 1, 2].map(k => Math.min(t[0][k], t[1][k], t[2][k]));
    const hi = [0, 1, 2].map(k => Math.max(t[0][k], t[1][k], t[2][k]));
    solids.push({ id: `tri.${i}`, kind: 'triangle', tri: t, lo, hi });
  }
  return { solids, holes: [], mesh: true, triangles: n };
}

const EPS = 1e-9;
export function rayTriangle(o, d, t) {
  const [a, b, c] = t;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < EPS) return null;
  const inv = 1 / det;
  const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
  if (u < -EPS || u > 1 + EPS) return null;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < -EPS || u + v > 1 + EPS) return null;
  const tt = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return tt > 1e-6 ? tt : null;
}

/**
 * Points inside a closed mesh, by parity: a ray from the point crosses an odd
 * number of surfaces if it started inside. Three rays rather than one, and a
 * point only counts as interior if all three agree — a single ray that grazes an
 * edge gets the answer exactly wrong, and a scanner seeded from outside the
 * building reports the whole sky as a leak.
 */
export function interiorOf(occ, { step = 24, margin = 0 } = {}) {
  const solids = occ.solids || occ;
  const b = bounds(solids);
  const probes = [[1, 0.013, 0.007], [0.011, 1, 0.009], [0.008, 0.006, 1]];
  const span = Math.hypot(...b.size) * 2;
  const out = [];
  for (let x = b.lo[0] + step / 2 + margin; x < b.hi[0] - margin; x += step)
    for (let y = b.lo[1] + step / 2 + margin; y < b.hi[1] - margin; y += step)
      for (let z = b.lo[2] + step / 2 + margin; z < b.hi[2] - margin; z += step) {
        const p = [x, y, z];
        let inside = true;
        for (const d of probes) {
          const n = Math.hypot(...d);
          const u = d.map(v => v / n);
          let hits = 0;
          const invd = [1 / (u[0] || 1e-12), 1 / (u[1] || 1e-12), 1 / (u[2] || 1e-12)];
          for (const e of solids) {
            if (slab(p, invd, e.lo, e.hi, span) === null) continue;
            if (e.tri) { if (rayTriangle(p, u, e.tri) !== null) hits++; }
            else {
              const end = [p[0] + u[0] * span, p[1] + u[1] * span, p[2] + u[2] * span];
              if (segmentPoly(p, end, e.P)) hits += 2;    // a solid box is entered and left
            }
          }
          if (hits % 2 === 0) { inside = false; break; }
        }
        if (inside) out.push(p);
      }
  return out;
}

// ---------------------------------------------------------------- calibration
/**
 * IS THE BUILDING FUCKED, OR ARE OUR EYES FUCKED?
 *
 * A box of six panels with no gaps. Fire the same rays through it. Every single
 * one must be stopped. If any of them get out, the number the scanner is about to
 * report on a real building is not a finding — it is the instrument's noise floor,
 * and the correct response is to fix the scanner and say nothing about the
 * building.
 *
 * Returns the noise floor rather than a pass/fail, because it is a number a
 * finding has to beat.
 */
export function calibrate({ rays = 256, size = 100, thickness = 1 } = {}) {
  const half = size / 2, t = thickness;
  const panels = [];
  const P = (p, s, id) => {
    const pl = poly({ p, s }, null); const bb = aabb(pl);
    panels.push({ id, kind: 'panel', P: pl, lo: bb.lo, hi: bb.hi });
  };
  P([0, 0, -half + t / 2], [size, size, t], 'cal.floor');
  P([0, 0, half - t / 2], [size, size, t], 'cal.ceiling');
  P([-half + t / 2, 0, 0], [t, size, size], 'cal.west');
  P([half - t / 2, 0, 0], [t, size, size], 'cal.east');
  P([0, -half + t / 2, 0], [size, t, size], 'cal.south');
  P([0, half - t / 2, 0], [size, t, size], 'cal.north');
  const sealed = scan({ solids: panels, holes: [] }, [[0, 0, 0], [10, -10, 12], [-20, 15, -8]], { rays });

  // and the same box with one panel taken away, so the instrument is shown to be
  // able to find a hole at all. A scanner that reports zero on everything is also
  // reporting zero on the sealed box.
  const open = scan({ solids: panels.filter(p => p.id !== 'cal.north'), holes: [] },
                    [[0, 0, 0], [10, -10, 12], [-20, 15, -8]], { rays });
  return {
    noiseFloor: sealed.escapes.length,
    sealedIsSealed: sealed.escapes.length === 0,
    findsAKnownHole: open.escapes.length > sealed.escapes.length,
    knownHoleReads: open.escapes.length,
    cast: sealed.cast,
    verdict: sealed.escapes.length === 0
      ? (open.escapes.length > 0 ? 'the instrument is honest' : 'the instrument is blind — it cannot see a missing wall')
      : `the instrument leaks ${sealed.escapes.length} of ${sealed.cast} rays through a sealed box`
  };
}
