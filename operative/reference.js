// operative/reference.js — comparing what is built against what was drawn.
//
// The five concept studies in assets/models/concepts/*.stl are the reference
// material this repository already carries. They are read as geometry, projected
// to an elevation, and compared cell by cell against the current world. The
// output is not a picture: it is a measured difference in operational language,
// which is what the next move needs.
import { verts } from './poly.js';

/** Parse a binary STL (Blender export) from an ArrayBuffer into a flat triangle list. */
export function parseSTL(buffer) {
  const dv = new DataView(buffer);
  const n = dv.getUint32(80, true);
  if (84 + n * 50 !== buffer.byteLength) throw new Error('not a binary STL of the expected length');
  const tris = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let v = 0; v < 9; v++) tris[i * 9 + v] = dv.getFloat32(o + v * 4, true);
  }
  return tris;
}

/**
 * Concept STLs are laid out side by side on one sheet, 150 in apart, each in the
 * same local frame. Shifting by (minX + 15) puts the study's west wall face on
 * world x = 0 — the same datum the kit is built on.
 */
export function alignConcept(tris) {
  let minX = Infinity;
  for (let i = 0; i < tris.length; i += 3) minX = Math.min(minX, tris[i]);
  const dx = minX + 15;
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) { out[i] = tris[i] - dx; out[i + 1] = tris[i + 1]; out[i + 2] = tris[i + 2]; }
  return { tris: out, shift: dx };
}

// Two elevations. 'side' looks along x (shows length and roof height);
// 'end' looks along y (shows width and the shed slope).
export const VIEWS = {
  side: { drop: 0, u: 1, v: 2, u0: -48, u1: 168, v0: -8, v1: 132, label: 'side elevation', uName: 'y', vName: 'z' },
  end:  { drop: 1, u: 0, v: 2, u0: -24, u1: 96, v0: -8, v1: 132, label: 'end elevation', uName: 'x', vName: 'z' }
};
export const CELL = 2; // inches

export function makeGrid(view) {
  const w = Math.ceil((view.u1 - view.u0) / CELL);
  const h = Math.ceil((view.v1 - view.v0) / CELL);
  return { w, h, view, bits: new Uint8Array(w * h) };
}
const idx = (g, i, j) => j * g.w + i;
export const cellCenter = (g, i, j) => [g.view.u0 + (i + 0.5) * CELL, g.view.v0 + (j + 0.5) * CELL];

function fillConvex(g, pts) {
  if (pts.length < 3) return;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pts) { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
  const i0 = Math.max(0, Math.floor((u0 - g.view.u0) / CELL)), i1 = Math.min(g.w - 1, Math.ceil((u1 - g.view.u0) / CELL));
  const j0 = Math.max(0, Math.floor((v0 - g.view.v0) / CELL)), j1 = Math.min(g.h - 1, Math.ceil((v1 - g.view.v0) / CELL));
  const hull = convexHull(pts);
  if (hull.length < 3) return;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const [cu, cv] = cellCenter(g, i, j);
      if (insideHull(hull, cu, cv)) g.bits[idx(g, i, j)] = 1;
    }
  }
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
function insideHull(h, x, y) {
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -1e-9) return false;
  }
  return true;
}

export function gridFromTriangles(tris, view) {
  const g = makeGrid(view);
  for (let i = 0; i < tris.length; i += 9) {
    const pts = [];
    for (let k = 0; k < 3; k++) pts.push([tris[i + k * 3 + view.u], tris[i + k * 3 + view.v]]);
    fillConvex(g, pts);
  }
  return g;
}

export function gridFromWorld(world, view, filter) {
  const g = makeGrid(view);
  for (const e of world.solids()) {
    if (e.layer === 'services') continue;
    if (filter && !filter(e)) continue;
    const pts = verts(e.poly()).map(p => [p[view.u], p[view.v]]);
    fillConvex(g, pts);
  }
  return g;
}

/** Connected regions of cells where `a` is set and `b` is not. */
function regions(a, b) {
  const g = a, seen = new Uint8Array(g.bits.length), out = [];
  const want = (i, j) => i >= 0 && j >= 0 && i < g.w && j < g.h && a.bits[idx(g, i, j)] && !b.bits[idx(g, i, j)] && !seen[idx(g, i, j)];
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    if (!want(i, j)) continue;
    const stack = [[i, j]]; seen[idx(g, i, j)] = 1;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, n = 0;
    while (stack.length) {
      const [x, y] = stack.pop(); n++;
      const [cu, cv] = cellCenter(g, x, y);
      u0 = Math.min(u0, cu - CELL / 2); u1 = Math.max(u1, cu + CELL / 2);
      v0 = Math.min(v0, cv - CELL / 2); v1 = Math.max(v1, cv + CELL / 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (want(nx, ny)) { seen[idx(g, nx, ny)] = 1; stack.push([nx, ny]); }
      }
    }
    out.push({ cells: n, area: n * CELL * CELL, u0, u1, v0, v1 });
  }
  return out.sort((p, q) => q.cells - p.cells);
}

/** Height / length / slope taken straight off a silhouette, so both sides are measured the same way. */
export function measures(g) {
  const view = g.view;
  let hi = -Infinity, lo = Infinity, uLo = Infinity, uHi = -Infinity;
  const topAt = new Array(g.w).fill(-Infinity);
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    if (!g.bits[idx(g, i, j)]) continue;
    const [cu, cv] = cellCenter(g, i, j);
    hi = Math.max(hi, cv + CELL / 2); lo = Math.min(lo, cv - CELL / 2);
    uLo = Math.min(uLo, cu - CELL / 2); uHi = Math.max(uHi, cu + CELL / 2);
    topAt[i] = Math.max(topAt[i], cv + CELL / 2);
  }
  // Roof fall, measured only across the columns that actually carry roof. Taken
  // over every occupied column it reported the fender as a 48 in slope.
  const valid = topAt.map((v, i) => [i, v]).filter(([, v]) => v > -Infinity);
  // Only the columns that actually carry roof, and only the longest unbroken run
  // of them: a fender or a porch post at the far edge is not a roof plane.
  const roofBand = hi - 12;
  const band = valid.filter(([, v]) => v >= roofBand);
  let roofCols = [], cur = [];
  for (let k = 0; k < band.length; k++) {
    if (k && band[k][0] !== band[k - 1][0] + 1) { if (cur.length > roofCols.length) roofCols = cur; cur = []; }
    cur.push(band[k]);
  }
  if (cur.length > roofCols.length) roofCols = cur;
  let rise = 0, riseSpan = 0;
  if (roofCols.length > 3) {
    const n = roofCols.length;
    const mu = roofCols.reduce((a, [i]) => a + i, 0) / n;
    const mv = roofCols.reduce((a, [, v]) => a + v, 0) / n;
    let num = 0, den = 0;
    for (const [i, v] of roofCols) { num += (i - mu) * (v - mv); den += (i - mu) ** 2; }
    const slope = den ? num / den : 0;                    // inches of z per column
    riseSpan = (roofCols[n - 1][0] - roofCols[0][0]) * CELL;
    rise = slope * (roofCols[n - 1][0] - roofCols[0][0]);
  }
  return { top: hi, bottom: lo, extent: uHi - uLo, uLo, uHi,
           roofFall: +rise.toFixed(1), roofSpan: +riseSpan.toFixed(1), view: view.label };
}

/** The comparison itself. */
export function compare(current, ref) {
  let inter = 0, union = 0;
  for (let k = 0; k < current.bits.length; k++) {
    const a = current.bits[k], b = ref.bits[k];
    if (a && b) inter++;
    if (a || b) union++;
  }
  const missing = regions(ref, current).filter(r => r.cells >= 6).slice(0, 4);
  const extra = regions(current, ref).filter(r => r.cells >= 6).slice(0, 4);
  return {
    view: current.view.label,
    agreement: union ? +(inter / union).toFixed(3) : 1,
    current: measures(current), reference: measures(ref),
    missing, extra
  };
}

/** Turn a comparison into the sentence a builder would say next. */
export function describe(cmp) {
  const v = cmp.current.view === 'side elevation' ? { u: 'y', vlabel: 'length' } : { u: 'x', vlabel: 'width' };
  const lines = [];
  const dh = cmp.reference.top - cmp.current.top;
  if (Math.abs(dh) >= 2) lines.push(`reference tops out ${Math.abs(dh).toFixed(0)} in ${dh > 0 ? 'higher' : 'lower'} (${cmp.reference.top.toFixed(0)} vs ${cmp.current.top.toFixed(0)} in)`);
  const dr = cmp.reference.roofFall - cmp.current.roofFall;
  if (Math.abs(dr) >= 2) lines.push(`reference roof rises ${cmp.reference.roofFall.toFixed(0)} in over ${cmp.reference.roofSpan.toFixed(0)} in of ${cmp.current.view === 'end elevation' ? 'width' : 'length'}; yours rises ${cmp.current.roofFall.toFixed(0)} in`);
  const de = cmp.reference.extent - cmp.current.extent;
  if (Math.abs(de) >= 3) lines.push(`reference is ${Math.abs(de).toFixed(0)} in ${de > 0 ? 'longer' : 'shorter'} on ${v.u}`);
  for (const r of cmp.missing.slice(0, 2))
    lines.push(`reference has ${Math.round(r.area)} in² of material you do not, at ${v.u} ${r.u0.toFixed(0)}..${r.u1.toFixed(0)}, z ${r.v0.toFixed(0)}..${r.v1.toFixed(0)}`);
  for (const r of cmp.extra.slice(0, 1))
    lines.push(`you have ${Math.round(r.area)} in² the reference does not, at ${v.u} ${r.u0.toFixed(0)}..${r.u1.toFixed(0)}, z ${r.v0.toFixed(0)}..${r.v1.toFixed(0)}`);
  if (!lines.length) lines.push('silhouettes agree within the grid');
  return lines;
}

/** Bind a reference study to the world. Grids for the reference are computed once. */
export function bindReference(world, { id, name, tris }) {
  const aligned = alignConcept(tris);
  world.reference = {
    id, name, shift: aligned.shift,
    tris: aligned.tris,
    grids: { end: gridFromTriangles(aligned.tris, VIEWS.end), side: gridFromTriangles(aligned.tris, VIEWS.side) }
  };
  return world.reference;
}

/** Compare the built world against the bound reference, in both elevations. */
export function compareToReference(world) {
  if (!world.reference) return null;
  const out = {};
  for (const name of ['end', 'side']) {
    const cmp = compare(gridFromWorld(world, VIEWS[name]), world.reference.grids[name]);
    cmp.lines = describe(cmp);
    out[name] = cmp;
  }
  return out;
}

/**
 * The reference is not a code rule, so it never blocks. It reports a measured
 * disagreement and, where the disagreement has an operational name, what would
 * answer it.
 */
export function referenceConditions(world) {
  const cmps = compareToReference(world);
  if (!cmps) return [];
  const out = [];
  for (const [name, cmp] of Object.entries(cmps)) {
    let repair = null;
    if (name === 'end') {
      const d = cmp.reference.roofFall - cmp.current.roofFall;
      if (Math.abs(d) >= 3) {
        // reference roofFall < 0 means its roof loses height toward +x: high at west.
        // Half the correction goes up on the high wall and half comes down on the
        // low one, so the pitch changes without the whole building growing — the
        // first version raised one wall by the full fall and the next measurement
        // reported the roof 8 in too high.
        const high = cmp.reference.roofFall < 0 ? 'W' : 'E';
        const low = high === 'W' ? 'E' : 'W';
        const half = Math.max(1, Math.round(Math.abs(d) / 2));
        repair = { chain: [
          { op: 'raise', args: { wall: high, by: half } },
          { op: 'raise', args: { wall: low, by: -half } },
          { op: 'pitch', args: {} }
        ], note: `pitch the roof ${(2 * half)} in toward ${low}` };
      }
    }
    if (cmp.agreement < 0.97) {
      out.push({
        code: 'PROFILE_DEVIATION', severity: 1,
        message: `${cmp.view} agrees ${(cmp.agreement * 100).toFixed(0)}% with ${world.reference.name}: ${cmp.lines[0]}`,
        elements: [], measure: { view: name, agreement: cmp.agreement, lines: cmp.lines,
          currentTop: cmp.current.top, referenceTop: cmp.reference.top,
          currentRoofFall: cmp.current.roofFall, referenceRoofFall: cmp.reference.roofFall },
        repair
      });
    }
  }
  return out;
}
