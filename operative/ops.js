// operative/ops.js — the operative vocabulary.
//
// Every move is explicit, inspectable and reversible. Nothing changes the world
// except through commit(), which measures the conditions before and after so the
// world's answer is attached to the instruction that provoked it.
import { Element, SECTIONS } from './world.js';
import { box } from './geom.js';
import { poly, segmentPoly, aabb } from './poly.js';
import { checkAll, SPAN_TABLE, BORE } from './checks.js';
import { scheduleFor, required, joinKey } from './joints.js';
import { mountsFor, REACH } from './gravity.js';

const key = (c) => `${c.code}:${c.elements.join('|')}`;

/** Deep snapshot of the mutable world, so any move can be walked back. */
function snapshot(world) {
  return {
    // joints are state too; undo used to leave them behind, so a walked-back world
    // kept 398 connections to members that no longer existed
    joints: [...world.joints.entries()].map(([k, v]) => [k, { ...v }]),
    elements: world.all().map(e => JSON.parse(JSON.stringify({
      id: e.id, kind: e.kind, layer: e.layer, box: e.box, shear: e.shear, material: e.material,
      system: e.system, section: e.section, meta: e.meta, ports: e.ports, trace: e.trace
    })))
  };
}
function restore(world, snap) {
  world.elements.clear();
  for (const e of snap.elements) world.add(new Element(e));
  if (snap.joints) { world.joints.clear(); for (const [k, v] of snap.joints) world.joints.set(k, v); }
  world._lintHash = null;
}

/**
 * Walk back everything committed since `mark`, in one move. The loop used to call
 * undo() in a while-loop, which walks back the *last* snapshot-bearing record each
 * time — and when one had no snapshot it spun, and when several did it went far
 * past where it was asked to stop, leaving the shell and no building.
 */
export function rollbackTo(world, mark) {
  if (world.history.length <= mark) return { ok: true, note: 'nothing to walk back' };
  const first = world.history[mark];
  if (!first || !first.snapshot) return { ok: false, note: 'no snapshot at that point' };
  restore(world, first.snapshot);
  const dropped = world.history.length - mark;
  world.history.length = mark;
  world.conditions = checkAll(world);
  world._lintHash = world.hash();
  return { ok: true, note: `walked back ${dropped} move${dropped === 1 ? '' : 's'}`, dropped };
}

/**
 * Run one operation and let the world answer.
 * Returns a report: what was requested, what changed, what opened, what closed.
 */
export function commit(world, name, args = {}, cause = null) {
  return commitChain(world, [{ op: name, args }], cause);
}

/**
 * Run a sequence of operations as ONE move.
 *
 * This exists because a compound repair was being judged as if each of its steps
 * were a resting state: raising the west wall and lowering the east wall to pitch
 * a roof reported forty conflicts in between, all of them closed by the very next
 * step, and the invariant counter dutifully learned thirty-one "overlaps" from
 * states the building was never actually in. Conditions are measured once, before
 * and after the whole chain.
 */
export function commitChain(world, steps, cause = null) {
  if (!steps.length) return { ok: false, note: 'nothing to run' };
  for (const s of steps) if (!OPS[s.op]) return { ok: false, note: `no operation named "${s.op}"` };

  // The after-state of the last commit is the before-state of this one. Re-linting
  // it cost a full pass per operation — about half of all the time the build spent.
  const beforeHash = world.hash();
  const before = (world._lintHash === beforeHash && world.conditions) ? world.conditions : checkAll(world);
  const beforeKeys = new Set(before.map(key));
  const snap = snapshot(world);

  const notes = [], changed = [];
  const flatten = (list) => list.flatMap(s => s.then ? [{ op: s.op, args: s.args }, s.then] : [s]);
  for (const s of flatten(steps)) {
    let result;
    try { result = OPS[s.op](world, s.args || {}) || {}; }
    catch (err) { restore(world, snap); return { ok: false, note: `${s.op} failed: ${err.message}` }; }
    if (result.ok === false) { restore(world, snap); return { ok: false, note: result.note || `${s.op} refused` }; }
    notes.push(result.note || s.op);
    for (const id of result.changed || []) if (!changed.includes(id)) changed.push(id);
  }

  const after = checkAll(world);
  const afterKeys = new Set(after.map(key));
  const opened = after.filter(c => !beforeKeys.has(key(c)));
  const closed = before.filter(c => !afterKeys.has(key(c)));
  world.conditions = after;
  world._lintHash = world.hash();

  const report = {
    ok: true, op: steps.map(s => s.op).join('+'), args: steps.length === 1 ? steps[0].args : steps,
    note: notes.join('; '), notes,
    elements: changed, opened, closed,
    before: beforeHash, after: world.hash(),
    counts: { before: before.length, after: after.length }
  };
  const rec = world.record({
    kind: 'op', op: report.op, args: report.args, note: report.note, cause,
    elements: changed,
    opened: opened.map(c => ({ code: c.code, message: c.message, elements: c.elements, measure: c.measure })),
    closed: closed.map(c => ({ code: c.code, message: c.message })),
    before: beforeHash, after: report.after
  });
  rec.snapshot = snap;                 // reversibility lives in the journal, not in a side channel
  report.t = rec.t;
  return report;
}

/** Walk the world back to just before journal entry t. */
export function undo(world, t, { relint = true } = {}) {
  for (let i = world.history.length - 1; i >= 0; i--) {
    const rec = world.history[i];
    if (rec.snapshot && (t === undefined || rec.t === t)) {
      restore(world, rec.snapshot);
      world.history.splice(i, 1);
      // walking back twenty entries used to re-lint twenty times
      if (relint) world.conditions = checkAll(world);
      world.record({ kind: 'undo', note: `walked back ${rec.op || rec.kind} (t=${rec.t})`, elements: [] });
      return { ok: true, note: `walked back ${rec.op || rec.kind}`, hash: world.hash() };
    }
  }
  return { ok: false, note: 'nothing to walk back' };
}

// ------------------------------------------------------------------ helpers
const wallOf = (world, id) => world.walls[id];
const along = (w) => (w.axis === 'y' ? 1 : 0);      // index of the axis members are spaced along
const across = (w) => (w.axis === 'y' ? 0 : 1);

function wallBox(w, u0, u1, z0, z1, thickness) {
  const p = [0, 0, (z0 + z1) / 2], s = [0, 0, z1 - z0];
  p[along(w)] = (u0 + u1) / 2; s[along(w)] = u1 - u0;
  p[across(w)] = w.at;         s[across(w)] = thickness ?? w.thickness;
  return box(p, s);
}
const uOf = (el, w) => el.box.p[along(w)];

/** How long the two members actually run together, for spacing-based schedules. */
function contactLength(A, B) {
  const a = { lo: A.lo, hi: A.hi }, b = { lo: B.lo, hi: B.hi };
  const ov = [0, 1, 2].map(i => Math.min(a.hi[i], b.hi[i]) - Math.max(a.lo[i], b.lo[i]));
  return Math.max(...ov.filter(v => v > 0), 0);
}

/**
 * The top of whatever the wall bears on at station `u`. Over a wheel well that is
 * the well's own sole plate, 15 in above the floor — the floor is not there. The
 * header op used to assume one datum for the whole wall and drove four jack studs
 * straight through the west wheel well.
 */
function wallBaseAt(world, wallId, u) {
  const w = world.walls[wallId];
  const ax = along(w);
  let top = world.datum.soleTop;
  for (const p of world.all({ kind: 'plate' })) {
    if (p.meta.wall !== wallId || p.meta.role === 'lower top plate' || p.meta.role === 'upper top plate') continue;
    const lo = p.box.p[ax] - p.box.s[ax] / 2, hi = p.box.p[ax] + p.box.s[ax] / 2;
    if (u < lo || u > hi) continue;
    top = Math.max(top, p.box.p[2] + p.box.s[2] / 2);
  }
  return top;
}
const memberDepth = (el) => (el.section && SECTIONS[el.section]) ? SECTIONS[el.section][1]
  : Math.min(...el.box.s);

// ------------------------------------------------------------------ the vocabulary
/** Is this element a point on some service run? Then its position is a decision. */
function onARun(world, e) {
  for (const r of Object.values(world.runs || {}))
    for (const pt of r.path)
      if (Math.abs(pt[0] - e.box.p[0]) < 2 && Math.abs(pt[1] - e.box.p[1]) < 2 && Math.abs(pt[2] - e.box.p[2]) < 2) return true;
  return false;
}

export const OPS = {

  /** Cut an opening in a wall. Studs in the way are interrupted, and that is the point. */
  cut(world, { wall, from, to, sill = 0, head, type = 'window', id }) {
    const w = wallOf(world, wall);
    if (!w) return { ok: false, note: `no wall "${wall}"` };
    const d = world.datum;
    const z0 = type === 'door' ? d.soleTop : d.deckTop + sill;
    const z1 = head !== undefined ? d.deckTop + head : z0 + (type === 'door' ? 80 : 36);
    if (to - from < 6) return { ok: false, note: 'an opening under 6 in wide is not an opening' };
    const openId = id || `${type}.${wall}.${Math.round(from)}`;
    if (world.get(openId)) return { ok: false, note: `${openId} already exists` };

    const changed = [];
    const cut = [];
    for (const stud of world.all({ kind: 'stud' })) {
      if (stud.meta.wall !== wall) continue;
      const u = uOf(stud, w), half = stud.box.s[along(w)] / 2;
      if (u + half <= from + 0.01 || u - half >= to - 0.01) continue;
      const sLo = stud.lo[2], sHi = stud.hi[2];
      if (sHi <= z0 || sLo >= z1) continue;
      cut.push(stud.id);
      world.remove(stud.id);
      if (z0 - sLo > 3) {                                   // material survives below the sill
        const cid = `cripple.${stud.id.slice(5)}.sill`;
        const cb = box([...stud.box.p], [...stud.box.s]);
        cb.s[2] = z0 - sLo; cb.p[2] = sLo + cb.s[2] / 2;
        world.add(new Element({ id: cid, kind: 'cripple', layer: 'frame', material: stud.material,
          section: stud.section, box: cb, meta: { ...stud.meta, role: 'sill cripple', opening: openId, from: stud.id } }));
        changed.push(cid);
      }
    }
    const op = world.add(new Element({
      id: openId, kind: 'opening', layer: 'walls', material: 'paint',
      box: wallBox(w, from, to, z0, z1, w.thickness + 1),
      meta: { wall, axis: w.axis, type, from, to, sill: z0, head: z1, cutStuds: cut, headroom: z1 - z0 }
    }));
    changed.push(openId, ...cut);
    return { changed, note: `${type} ${(to - from).toFixed(0)}x${(z1 - z0).toFixed(0)} in cut in wall ${wall}; ${cut.length} stud${cut.length === 1 ? '' : 's'} interrupted` };
  },

  /** Carry the load over an opening: header sized from the span table, on jacks, with kings and cripples. */
  header(world, { opening, section }) {
    const op = world.get(opening);
    if (!op || op.kind !== 'opening') return { ok: false, note: `no opening "${opening}"` };
    const w = wallOf(world, op.meta.wall);
    const d = world.datum;
    const plateBot = w.topPlateBot;
    const span = op.meta.to - op.meta.from;
    if (!section) {
      section = Object.entries(SPAN_TABLE.header)
        .filter(([, allow]) => allow >= span)
        .sort((a, b) => a[1] - b[1])[0]?.[0] || '(2)2x10';
    }
    const [thk, dep] = SECTIONS[section] || SECTIONS['(2)2x6'];
    if (op.meta.head + dep > plateBot + 0.01) {
      return { ok: false, note: `a ${section} header over ${opening} would land ${(op.meta.head + dep - plateBot).toFixed(1)} in above wall ${w.id}'s top plate — the wall is not tall enough to carry this opening` };
    }
    const changed = [];
    const hid = `header.${opening}`;
    for (const old of world.all({ kind: ['header', 'jack', 'king'] })) if (old.meta.opening === opening) world.remove(old.id);
    for (const c of world.all({ kind: 'cripple' })) if (c.meta.opening === opening && c.meta.role === 'head cripple') world.remove(c.id);

    const zBot = op.meta.head, zTop = zBot + dep;
    world.add(new Element({ id: hid, kind: 'header', layer: 'frame', material: 'engineered_lumber', section,
      box: wallBox(w, op.meta.from - 1.5, op.meta.to + 1.5, zBot, zTop),
      meta: { opening, wall: op.meta.wall, spanAxis: w.axis, role: 'header', clear: span } }));
    changed.push(hid);

    for (const [i, u] of [op.meta.from - 0.75, op.meta.to + 0.75].entries()) {
      const base = wallBaseAt(world, op.meta.wall, u);
      const jid = `jack.${opening}.${i}`;
      world.add(new Element({ id: jid, kind: 'jack', layer: 'frame', material: 'treated_wood', section: '2x4',
        box: wallBox(w, u - 0.75, u + 0.75, base, zBot),
        meta: { opening, wall: op.meta.wall, role: 'jack stud', bearing: true } }));
      const kid = `king.${opening}.${i}`;
      const ku = i === 0 ? op.meta.from - 2.25 : op.meta.to + 2.25;
      if (!world.all({ kind: 'stud' }).some(s => s.meta.wall === op.meta.wall && Math.abs(uOf(s, w) - ku) < 1.4)) {
        world.add(new Element({ id: kid, kind: 'king', layer: 'frame', material: 'treated_wood', section: '2x4',
          box: wallBox(w, ku - 0.75, ku + 0.75, wallBaseAt(world, op.meta.wall, ku), plateBot),
          meta: { opening, wall: op.meta.wall, role: 'king stud', bearing: true } }));
        changed.push(kid);
      }
      changed.push(jid);
    }
    if (zTop < plateBot - 3) {
      let n = 0;
      for (let u = op.meta.from + 0.75; u <= op.meta.to; u += 16) {
        const cid = `cripple.${opening}.${n++}`;
        world.add(new Element({ id: cid, kind: 'cripple', layer: 'frame', material: 'treated_wood', section: '2x4',
          box: wallBox(w, u - 0.75, u + 0.75, zTop, plateBot),
          meta: { opening, wall: op.meta.wall, role: 'head cripple' } }));
        changed.push(cid);
      }
    }
    return { changed, note: `${section} header over ${opening}, ${span.toFixed(0)} in clear, on 2 jacks` };
  },

  /** Place a service source (shore power inlet, water inlet). */
  source(world, { id, system, at, size, layer = 'services', hostedBy }) {
    world.add(new Element({ id, kind: 'source', layer, system, material: 'steel',
      box: box(at, size || [3, 3, 3]), meta: { role: `${system} source`, hostedBy: hostedBy || null } }));
    return { changed: [id], note: `${system} source ${id} placed` };
  },

  /** Place a fixture that will need to be fed. */
  /**
   * A fixture is a thing that needs feeding. Floor-standing ones (a toilet, a
   * tank) also have to be carried, so they take `layer: 'interior'` and are held
   * to the load-path check like any other object.
   */
  fixture(world, { id, system, at, kind = 'outlet', size, layer = 'services', material = 'paint', hollow, hostedBy }) {
    const s = size || (kind === 'sink' ? [20, 16, 8] : [3, 2, 4]);
    world.add(new Element({ id, kind: 'fixture', layer, system, material,
      box: box(at, s), meta: { role: kind, hollow: !!hollow, hostedBy: hostedBy || null } }));
    return { changed: [id], note: `${kind} ${id} placed${system ? `; no ${system} to it yet` : ''}` };
  },

  /**
   * Route a service along a path. Every member the path crosses is bored, and
   * the bore is recorded on that member — which is where the world starts to push back.
   */
  route(world, { system, run, path, dia = 0.75, amps, awg, volts, load }) {
    if (!path || path.length < 2) return { ok: false, note: 'a run needs at least two points' };
    const runId = run || `${system}.${world.all({ kind: 'run' }).length + 1}`;
    OPS.unroute(world, { run: runId });
    world.runs = world.runs || {};
    world.runs[runId] = { system, path: path.map(p => p.slice()), dia, amps, awg, volts: volts || 12, load };
    const changed = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const id = `run.${runId}.${i}`;
      const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const s = [Math.max(dia, Math.abs(b[0] - a[0])), Math.max(dia, Math.abs(b[1] - a[1])), Math.max(dia, Math.abs(b[2] - a[2]))];
      world.add(new Element({ id, kind: 'run', layer: 'services', system, material: system === 'power' ? 'steel' : 'polycarbonate',
        box: box(c, s), meta: { run: runId, from: a, to: b, dia, index: i } }));
      changed.push(id);
      // bore every solid the segment passes through
      for (const m of world.solids()) {
        if (m.layer === 'services' || m.kind === 'strap') continue;   // you bore framing, not equipment
        const hit = segmentPoly(a, b, m.poly());
        if (!hit || hit.t1 - hit.t0 < 1e-4) continue;
        const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const L = Math.hypot(...dir);
        const nd = dir.map(v => v / (L || 1));
        const entry = [a[0] + dir[0] * hit.t0, a[1] + dir[1] * hit.t0, a[2] + dir[2] * hit.t0];
        const bb = aabb(m.poly());
        // The bored face is the one most perpendicular to the run; edge distance is
        // measured on the *other* horizontal-ish axis of the member's cross section.
        let boreAxis = 0, bestDot = -1;
        for (let k = 0; k < 3; k++) if (Math.abs(nd[k]) > bestDot) { bestDot = Math.abs(nd[k]); boreAxis = k; }
        const depth = memberDepth(m);
        // Edge distance is measured across the member's *depth* — the dimension the
        // span table is about. Taking whichever axis happened to be smallest measured
        // a joist across its 1.5 in thickness, which is the length of the bore, not
        // its edge, and reported every diagonal crossing as a violation.
        let depthAxis = -1, closest = Infinity;
        for (let k = 0; k < 3; k++) {
          if (k === boreAxis) continue;
          const d = Math.abs((bb.hi[k] - bb.lo[k]) - depth);
          if (d < closest) { closest = d; depthAxis = k; }
        }
        let edge, edgeAxis = null;
        if (depthAxis >= 0) {
          edge = Math.min(entry[depthAxis] - bb.lo[depthAxis], bb.hi[depthAxis] - entry[depthAxis]) - dia / 2;
          edgeAxis = 'xyz'[depthAxis];
        } else edge = Infinity;
        // The per-run filter used to live here, which meant segment 2 deleted the
        // bore segment 1 had just recorded in the same member. unroute() clears the
        // run once, up front; from here it is push-only.
        m.meta.penetrations = m.meta.penetrations || [];
        m.meta.penetrations.push({
          run: runId, segment: id, kind: 'bore', dia, memberDepth: depth,
          edge: edge === Infinity ? undefined : +edge.toFixed(3), edgeAxis,
          at: entry.map(v => +v.toFixed(2)), through: +(L * (hit.t1 - hit.t0)).toFixed(2)
        });
        m.trace.push({ t: world.clock + 1, kind: 'bored', note: `${dia.toFixed(2)} in bore for ${runId} at ${entry.map(v => v.toFixed(0)).join('/')}, ${edge === Infinity ? 'through' : edge.toFixed(2) + ' in of edge left'}` });
        if (!changed.includes(m.id)) changed.push(m.id);
      }
    }
    return { changed, note: `${system} run ${runId}: ${path.length - 1} segment${path.length === 2 ? '' : 's'}, ${dia.toFixed(2)} in` };
  },

  /**
   * Repair a run the world refused. Not a specified feature: it exists because
   * boring a 2 in line through a bearing stud kept failing the same way, and
   * repairing the outputs one at a time was not converging.
   *
   * Two corrections, both computed from the world, never guessed:
   *   bay    — the line moves out of the stud and into the cavity beside it
   *   centre — the line moves to the member's centreline to recover edge distance
   */
  reroute(world, { run }) {
    const rec = (world.runs || {})[run];
    if (!rec) return { ok: false, note: `no run "${run}" to reroute` };
    const offences = [];
    for (const m of world.solids()) {
      for (const pen of m.meta.penetrations || []) {
        if (pen.run !== run) continue;
        const frac = pen.dia / pen.memberDepth;
        const limitFrac = m.kind === 'stud' ? (m.meta.bearing !== false ? BORE.studBearingMaxFrac : BORE.studNonBearingMaxFrac)
          : m.kind === 'plate' ? BORE.plateMaxFrac
          : (m.kind === 'joist' || m.kind === 'rafter') ? BORE.joistMaxFrac : 1;
        const minEdge = (m.kind === 'joist' || m.kind === 'rafter') ? BORE.joistMinEdge : BORE.minEdgeDistance;
        if (frac > limitFrac + 1e-6) offences.push({ member: m, pen, why: 'oversize' });
        else if (pen.edge !== undefined && pen.edge < minEdge - 1e-6) offences.push({ member: m, pen, why: 'edge' });
      }
    }
    if (!offences.length) return { ok: false, note: `run ${run} has nothing to answer for` };

    const path = rec.path.map(p => p.slice());
    const moves = [];
    // Terminals stay put: a run that loses its source or its fixture has not been
    // repaired, it has been abandoned. Interior vertices move and the line jogs.
    const shiftInterior = (axis, near, to, window) => {
      let n = 0;
      for (let i = 1; i < path.length - 1; i++) {
        if (Math.abs(path[i][axis] - near) < window) { path[i][axis] = +to.toFixed(2); n++; }
      }
      return n;
    };
    for (const off of offences) {
      const m = off.member;
      const depthAxisOK = off.pen.dia <= off.pen.memberDepth / 3;
      if ((m.kind === 'joist' || m.kind === 'rafter') && !depthAxisOK) {
        // No bore position in this member can take this diameter. The line goes
        // under the framing instead of through it.
        const bottom = m.lo[2];
        const z = bottom - off.pen.dia / 2 - 0.5;
        if (shiftInterior(2, off.pen.at[2], z, 3.0)) moves.push(`under ${m.kind}s at z=${z.toFixed(1)} in (a ${off.pen.dia} in line does not fit a ${m.section})`);
        continue;
      }
      if ((m.kind === 'stud' || m.kind === 'king' || m.kind === 'cripple') && off.why === 'oversize') {
        // move the line into the nearest clear bay of that wall
        const w = world.walls[m.meta.wall];
        if (!w) continue;
        const ax = w.axis === 'y' ? 1 : 0;
        const members = world.all({ kind: ['stud', 'king', 'jack', 'cripple'] })
          .filter(e => e.meta.wall === m.meta.wall)
          .map(e => ({ u: e.box.p[ax], half: e.box.s[ax] / 2 }))
          .sort((a, b) => a.u - b.u);
        const at = off.pen.at[ax];
        let best = null;
        for (let i = 0; i < members.length - 1; i++) {
          const gapLo = members[i].u + members[i].half, gapHi = members[i + 1].u - members[i + 1].half;
          if (gapHi - gapLo < rec.dia + 1) continue;
          const mid = (gapLo + gapHi) / 2;
          if (!best || Math.abs(mid - at) < Math.abs(best - at)) best = mid;
        }
        if (best === null) continue;
        if (shiftInterior(ax, at, best, 2.0)) moves.push(`out of ${m.id} into the bay at ${'xyz'[ax]}=${best.toFixed(1)} in`);
      } else if (off.why === 'edge') {
        const k = 'xyz'.indexOf(off.pen.edgeAxis);
        if (k < 0) continue;
        if (shiftInterior(k, off.pen.at[k], m.box.p[k], 2.5)) moves.push(`centred in ${m.id} on ${off.pen.edgeAxis}`);
      }
    }
    if (!moves.length) return { ok: false, note: `run ${run} cannot be corrected by shifting; it needs a different path` };
    const out = OPS.route(world, { system: rec.system, run, path, dia: rec.dia });
    return { changed: out.changed, note: `run ${run} rerouted: ${moves.join('; ')}` };
  },

  unroute(world, { run }) {
    const changed = [];
    for (const r of world.all({ kind: 'run' })) if (r.meta.run === run) { world.remove(r.id); changed.push(r.id); }
    for (const m of world.solids()) {
      if (!m.meta.penetrations) continue;
      const kept = m.meta.penetrations.filter(p => p.run !== run);
      if (kept.length !== m.meta.penetrations.length) { m.meta.penetrations = kept; changed.push(m.id); }
    }
    return { changed, note: changed.length ? `run ${run} pulled out` : `no run ${run}` };
  },

  move(world, { id, delta }) {
    const e = world.get(id);
    if (!e) return { ok: false, note: `no element "${id}"` };
    e.box.p = e.box.p.map((v, i) => v + (delta[i] || 0));
    return { changed: [id], note: `${id} moved (${delta.map(v => v.toFixed(2)).join(', ')}) in` };
  },

  remove(world, { id }) {
    const e = world.remove(id);
    return e ? { changed: [id], note: `${id} removed` } : { ok: false, note: `no element "${id}"` };
  },

  material(world, { id, material }) {
    const e = world.get(id);
    if (!e) return { ok: false, note: `no element "${id}"` };
    const was = e.material; e.material = material;
    return { changed: [id], note: `${id}: ${was} -> ${material}` };
  },

  /** Step a member up to the next section that covers its span. */
  upsize(world, { id, section }) {
    const e = world.get(id);
    if (!e) return { ok: false, note: `no element "${id}"` };
    const table = e.kind === 'joist' ? SPAN_TABLE.floor : e.kind === 'rafter' ? SPAN_TABLE.rafter : SPAN_TABLE.header;
    const order = Object.keys(table);
    const next = section || order[Math.min(order.indexOf(e.section) + 1, order.length - 1)];
    if (!SECTIONS[next]) return { ok: false, note: `no section "${next}"` };
    const [thk, dep] = SECTIONS[next];
    const was = e.section;
    e.section = next;
    const depthAxis = e.kind === 'header' ? 2 : 2;
    const bottom = e.box.p[depthAxis] - e.box.s[depthAxis] / 2;
    e.box.s[depthAxis] = dep;
    e.box.p[depthAxis] = bottom + dep / 2;
    return { changed: [id], note: `${id}: ${was} -> ${next}` };
  },

  /** A steel tie across a plate cut past half its width. */
  strap(world, { id }) {
    const m = world.get(id);
    if (!m) return { ok: false, note: `no element "${id}"` };
    const pens = m.meta.penetrations || [];
    if (!pens.length) return { ok: false, note: `${id} has nothing to tie across` };
    const at = pens[0].at;
    const sid = `strap.${id}`;
    // A tie is screwed to the inside face of the plate. Modelled enveloping the
    // plate it read as interpenetration and as carrying no load — which is what a
    // strap floating inside a stick of lumber would be.
    const w = world.walls[m.meta.wall];
    const k = w ? (w.axis === 'y' ? 0 : 1) : (m.box.s[0] < m.box.s[1] ? 0 : 1);
    const inward = w ? -w.normal[k] : 1;
    const t = 0.06;
    const p = [at[0], at[1], m.box.p[2]];
    p[k] = m.box.p[k] + inward * (m.box.s[k] / 2 + t / 2);
    const s = [0, 0, m.box.s[2]];
    s[k] = t; s[k === 0 ? 1 : 0] = 12;
    world.add(new Element({ id: sid, kind: 'strap', layer: 'frame', material: 'steel', box: box(p, s),
      meta: { ties: id, role: 'steel tie', wall: m.meta.wall } }));
    m.meta.tied = true;
    // Screwing the tie on *is* the joint. Left for a later nail-off pass the strap
    // stood there touching the plate, unjoined and carrying nothing — the repair
    // scored worse than the condition it repaired and the loop walked it back.
    OPS.join(world, { a: sid, b: id });
    return { changed: [sid, id], note: `${sid}: 12 in steel tie across the cut plate, screwed off` };
  },

  /**
   * Raise walls by `by` inches — one named wall, or all four. This is the scale
   * change: not an object move but a building one. The roof does not follow
   * automatically, and that is deliberate: raising one wall under a flat roof is
   * exactly the conflict the world should report.
   */
  raise(world, { by, wall }) {
    if (!by) return { ok: false, note: 'raise needs a height' };
    const d = world.datum;
    const ids = wall ? [wall] : Object.keys(world.walls);
    for (const id of ids) if (!world.walls[id]) return { ok: false, note: `no wall "${id}"` };
    const set = new Set(ids);
    const changed = [];
    const stretchUp = (e) => { e.box.s[2] += by; e.box.p[2] += by / 2; changed.push(e.id); };
    const lift = (e) => { e.box.p[2] += by; changed.push(e.id); };
    const all = !wall;
    for (const e of world.all()) {
      if (!set.has(e.meta.wall) && !(all && (e.kind === 'rafter' || (e.kind === 'panel' && e.layer === 'roof')))) continue;
      if (e.kind === 'stud' || e.kind === 'king' || e.kind === 'sheathing') stretchUp(e);
      else if (e.kind === 'plate' && e.meta.role !== 'sole plate') lift(e);
      else if (e.kind === 'strap' && e.meta.role === 'steel tie') { /* stays with its plate */ }
      else if (e.kind === 'cripple' && e.meta.role === 'head cripple') stretchUp(e);
      else if (all && (e.kind === 'rafter' || (e.kind === 'panel' && e.layer === 'roof'))) lift(e);
    }
    for (const id of ids) { world.walls[id].topPlateBot += by; world.walls[id].wallTop += by; }
    if (all) { d.topPlateBot += by; d.wallTop += by; d.studLen += by; }
    return { changed, note: `${wall ? `wall ${wall}` : 'all four walls'} ${by > 0 ? 'raised' : 'lowered'} ${Math.abs(by)} in; wall ${ids[0]} now tops out at ${world.walls[ids[0]].wallTop.toFixed(1)} in` };
  },

  /**
   * Reseat the roof on whatever the walls are now. The pitch is not a free
   * parameter — it is whatever the two bearing walls make it.
   */
  pitch(world, {} = {}) {
    const W = world.walls.W, E = world.walls.E;
    const dz = E.wallTop - W.wallTop;
    const run = E.at - W.at;
    const m = dz / run;
    // Seat on the *downhill* edge of each plate. Anchored on the plate centreline
    // the sloped rafter dipped 0.2 in into the outer half of every top plate —
    // which the world duly reported twenty times.
    const edge = m < 0 ? W.thickness / 2 : -W.thickness / 2;
    const anchorX = W.at + edge, anchorZ = W.wallTop;
    const plane = (x) => anchorZ + m * (x - anchorX);
    const changed = [];

    for (const e of world.all({ kind: ['rafter'] }).concat(world.all({ kind: 'panel' }).filter(p => p.layer === 'roof'))) {
      const sx = e.box.s[0];
      const zAtCentre = plane(e.box.p[0]);
      const isCover = e.kind === 'panel';
      const seat = isCover ? zAtCentre + SECTIONS['2x6'][1] + 0.5 : zAtCentre;
      e.shear = Math.abs(m) < 1e-6 ? null : { axis: 'x', rise: +(m * sx).toFixed(4) };
      e.box.p[2] = seat + e.box.s[2] / 2;
      changed.push(e.id);
    }

    // The end walls have to follow the roof they carry. Left flat, their plates
    // stood straight through the tilted rafters at both ends of the trailer.
    const pT = SECTIONS['2x4'][0];
    for (const id of ['S', 'N']) {
      const wall = world.walls[id];
      if (!wall) continue;
      let lowest = Infinity;
      for (const e of world.all()) {
        if (e.meta.wall !== id) continue;
        if (e.kind === 'plate' && e.meta.role !== 'sole plate') {
          const tier = e.meta.role === 'upper top plate' ? 0 : 1;
          const top = plane(e.box.p[0]) - tier * pT;
          e.shear = Math.abs(m) < 1e-6 ? null : { axis: 'x', rise: +(m * e.box.s[0]).toFixed(4) };
          e.box.p[2] = top - e.box.s[2] / 2;
          changed.push(e.id);
        } else if (e.kind === 'stud' || e.kind === 'king') {
          // measured at the stud's downhill edge, where the sloping plate is lowest
          const top = plane(e.box.p[0] + (m < 0 ? e.box.s[0] / 2 : -e.box.s[0] / 2)) - 2 * pT;
          const bot = e.box.p[2] - e.box.s[2] / 2;
          e.box.s[2] = Math.max(6, top - bot);
          e.box.p[2] = bot + e.box.s[2] / 2;
          lowest = Math.min(lowest, top);
          changed.push(e.id);
        } else if (e.kind === 'sheathing') {
          const bot = e.box.p[2] - e.box.s[2] / 2;
          const top = plane(e.box.p[0]);
          e.shear = Math.abs(m) < 1e-6 ? null : { axis: 'x', rise: +(m * e.box.s[0]).toFixed(4) };
          e.box.s[2] = top - bot;
          e.box.p[2] = bot + e.box.s[2] / 2;
          changed.push(e.id);
        }
      }
      // a header on a sloping end wall has to fit under its lowest point
      if (Number.isFinite(lowest)) { wall.topPlateBot = lowest; wall.wallTop = lowest + 2 * pT; }
    }

    const fall = -(m * (E.at - W.at));
    return { changed, note: Math.abs(m) < 1e-6
      ? `roof reseated flat on both plates`
      : `roof reseated on the plates: falls ${Math.abs(fall).toFixed(1)} in from ${fall > 0 ? 'W to E' : 'E to W'} over ${Math.abs(run).toFixed(0)} in; end walls follow it` };
  },

  // A sleeved-penetration object used to live here. It was written because a vent
  // and a flue overlapped the roof and the plates they pass through, and it made
  // that worse: every sleeve then collided with the roof, the skin and the other
  // sleeves — nine conflicts to resolve two. Backed out. A pipe crossing a member
  // is a *bore*, which this world already models well, so vents and flues are runs
  // like every other pipe and are judged by the same boring rules.

  /** A P-trap under a fixture: the water seal that keeps the drain from venting into the room. */
  trap(world, { fixture, size = 1.5 }) {
    const f = world.get(fixture);
    if (!f) return { ok: false, note: `no fixture "${fixture}"` };
    const id = `trap.${fixture}`;
    if (world.get(id)) return { ok: false, note: `${id} already exists` };
    // A trap belongs in the line, at the point the fixture's drain leaves it — not
    // merely underneath the bowl. Placed under the fixture it sat 5.5 in off the
    // drain that was supposed to run through it, and the waste graph said so.
    let at = [f.box.p[0], f.box.p[1], f.box.p[2] - f.box.s[2] / 2 - size * 2];
    let best = Infinity;
    for (const r of world.all({ kind: 'run' })) {
      if (r.system !== 'waste') continue;
      for (const p of [r.meta.from, r.meta.to]) {
        const d = Math.hypot(p[0] - f.box.p[0], p[1] - f.box.p[1], p[2] - f.box.p[2]);
        if (d < best) { best = d; at = [p[0], p[1], p[2]]; }
      }
    }
    // in the line horizontally, but hung below what it serves; a floor fixture traps
    // under the deck, a basin traps inside its own cabinet
    const dBot = world.datum.deckTop - 0.75;
    let top = f.lo[2] - 0.25;
    if (top > dBot && top - size * 3 < world.datum.deckTop) top = dBot;
    at[2] = top - size * 1.5;
    world.add(new Element({ id, kind: 'trap', layer: 'services', system: 'waste', material: 'polycarbonate',
      box: box(at, [size * 2.5, size * 3, size * 3]),
      meta: { role: 'P-trap', serves: fixture, size, onDrain: best < 24 } }));
    return { changed: [id], note: `${size} in P-trap under ${fixture}` };
  },

  /** A vent, taken up through the roof so the trap seal is not siphoned. */
  /**
   * A vent: a connection point on the drain and a stack running up out of the roof.
   * The stack is a run, so it bores what it crosses and the bore rules judge it.
   */
  vent(world, { near, id, at, size = 1.5 }) {
    const anchor = world.get(near);
    if (!anchor) return { ok: false, note: `no element "${near}"` };
    const vid = id || `vent.${near.replace(/^trap\./, '')}`;
    if (world.get(vid)) return { ok: false, note: `${vid} already exists` };
    const x = at ? at[0] : anchor.box.p[0];
    const y = at ? at[1] : anchor.box.p[1];
    // The take-off is above the trap arm — and, when it has been offset into a wall
    // cavity, above the sole plate too: placed at trap height it sat inside the deck
    // and the plate it was meant to rise beside.
    const above = anchor.box.p[2] + anchor.box.s[2] / 2 + size / 2 + 0.25;
    const bot = at ? Math.max(above, world.datum.soleTop + size + 0.5) : above;
    const top = world.walls.W.wallTop + 14;
    world.add(new Element({ id: vid, kind: 'vent', layer: 'services', system: 'waste', material: 'polycarbonate',
      box: box([x, y, bot], [size, size, size]),
      meta: { role: 'vent connection', serves: near, size } }));
    // the trap arm runs from the trap across to the cavity, then the stack goes up
    const path = at
      ? [[anchor.box.p[0], anchor.box.p[1], anchor.box.p[2]], [x, y, anchor.box.p[2]], [x, y, bot], [x, y, top]]
      : [[x, y, bot], [x, y, top]];
    const out = OPS.route(world, { system: 'waste', run: `stack.${vid}`, dia: size, path });
    // Clip it to the framing on the way up. Installed and left loose, the new vent
    // was itself FLOATING — a blocking condition traded for a serious one — so the
    // loop walked the whole repair back and the trap stayed unvented. An op that
    // puts a part in the building fastens the part it puts in.
    const m = OPS.mount(world, { id: vid });
    return { changed: [vid, ...(out.changed || [])],
      note: `${size} in vent at ${near}, stack up through the roof` +
            (m.ok === false ? `; nothing in reach to clip it to` : `, ${m.note.replace(/^\S+ /, '')}`) };
  },

  /** Put a heavier conductor on a circuit that could not deliver its load. */
  regauge(world, { run, awg }) {
    const rec = (world.runs || {})[run];
    if (!rec) return { ok: false, note: `no run "${run}"` };
    const was = rec.awg;
    rec.awg = awg;
    const changed = [];
    for (const r of world.all({ kind: 'run' })) if (r.meta.run === run) { r.meta.awg = awg; changed.push(r.id); }
    return { changed, note: `${run}: ${was} AWG -> ${awg} AWG` };
  },

  /**
   * Nail two members together. An act, not an observation: before this existed the
   * model inferred "fastened" from adjacency and 687 pairs were connected by nothing.
   */
  join(world, { a, b, count, type, size, how }) {
    const A = world.get(a), B = world.get(b);
    if (!A || !B) return { ok: false, note: `need both ${a} and ${b}` };
    const rule = scheduleFor(A.kind, B.kind);
    const len = contactLength(A, B);
    const need = rule ? required(rule, len) : 2;
    const j = {
      a, b, type: type || (rule ? rule.type : 'nail'), size: size || (rule ? rule.size : '16d'),
      count: count || need, how: how || (rule ? rule.how : 'face nail'),
      required: need, schedule: rule ? rule.note || `${rule.a}/${rule.b}` : 'no schedule entry',
      contact: +len.toFixed(1), t: world.clock + 1
    };
    world.joints.set(joinKey(a, b), j);
    A.trace.push({ t: j.t, kind: 'joined', note: `${j.count} ${j.size} ${j.type} to ${b} (${j.how})` });
    B.trace.push({ t: j.t, kind: 'joined', note: `${j.count} ${j.size} ${j.type} to ${a} (${j.how})` });
    return { changed: [a, b], note: `${a} + ${b}: ${j.count} ${j.size} ${j.type}, ${j.how}` };
  },

  /**
   * Nail off everything the schedule covers — what a framer actually does, in one
   * pass, rather than one joint at a time.
   */
  nailOff(world, { only } = {}) {
    const g = world.grounded();
    let made = 0, skipped = 0;
    const changed = [];
    for (const [id, ups] of g.under) {
      for (const u of ups) {
        const A = world.get(id), B = world.get(u.id);
        if (!A || !B) continue;
        if (world.joints.has(joinKey(id, u.id))) continue;
        const rule = scheduleFor(A.kind, B.kind);
        if (!rule) { skipped++; continue; }
        if (only && ![A.kind, B.kind].includes(only)) continue;
        const r = OPS.join(world, { a: id, b: u.id });
        if (r.changed) { made++; changed.push(...r.changed); }
      }
    }
    return { changed: [...new Set(changed)], note: `nailed off ${made} joint${made === 1 ? '' : 's'}${skipped ? `; ${skipped} contacts have no schedule entry` : ''}` };
  },

  /** A placeholder the loop replaces: a requirement's stage is run by the caller. */
  stage(world, { name }) { return { changed: [], note: `stage ${name}` }; },

  /** A measurement worth keeping in the journal, which changes no geometry. */
  note(world, { text }) { return { changed: [], note: text }; },

  /**
   * Mount a fixture on the thing that will hold it: bring it into contact along
   * one axis, then screw it off. A light hanging 1 in below a rafter is not
   * screwed to the rafter — it is near it. Nothing is connected because it is
   * close.
   *
   * The move is deliberately small. If making contact would take more than
   * `REACH`, this refuses: that is not mounting, it is relocating, and moving a
   * fixture across a room is a decision the world should be asked for rather
   * than one a repair performs quietly. The first version had no such limit and
   * dragged a propane bottle off the tongue and into the floor joists, opening
   * five overlaps to close one FLOATING.
   */
  mount(world, { id, to }) {
    const e = world.get(id);
    if (!e) return { ok: false, note: `no element "${id}"` };
    const near = mountsFor(world, e);
    let host = to && world.get(to);
    if (!host) {
      if (!near.length) return { ok: false, note: `${id} has nothing within reach to mount to` };
      host = world.get(near[0].id);
    }
    // Which face holds it? Something sitting on a thing rests; something under a
    // thing hangs; anything else is screwed to a vertical face.
    const sep = (i) => Math.max(host.lo[i] - e.hi[i], e.lo[i] - host.hi[i]);
    const over  = host.hi[2] <= e.lo[2] + 0.01;             // host is below -> e rests on it
    const under = host.lo[2] >= e.hi[2] - 0.01;             // host is above -> e hangs from it
    let axis, delta;
    if (over)       { axis = 2; delta = host.hi[2] - e.lo[2]; }
    else if (under) { axis = 2; delta = host.lo[2] - e.hi[2]; }
    else {
      axis = [0, 1].reduce((m, i) => (sep(i) > sep(m) ? i : m), 0);
      const d = sep(axis);
      if (d <= 0.01) { axis = -1; delta = 0; }              // already in contact
      else delta = host.lo[axis] - e.hi[axis] > e.lo[axis] - host.hi[axis]
                 ? host.lo[axis] - e.hi[axis] : host.hi[axis] - e.lo[axis];
    }
    if (Math.abs(delta) > REACH)
      return { ok: false, note: `${id} is ${Math.abs(delta).toFixed(1)} in from ${host.id}; ` +
        `mounting it would be relocating it. Place it where its support is, or add support where it is.` };
    // Some things must not be moved to reach their support. The grey water outlet
    // is a point on a drain that falls 1.25 in across the trailer — the floor was
    // deepened to 2x8 to make that fall legal — and shoving it 2.5 in up to touch
    // the deck tilted the main backwards through four joists. A pipe gets a
    // hanger; the pipe stays where the fall put it.
    if (Math.abs(delta) > 0.01 && onARun(world, e))
      return OPS.hanger(world, { id, to: host.id });
    let moved = 0;
    if (axis >= 0 && Math.abs(delta) > 0.001) { e.box.p[axis] += delta; moved = +delta.toFixed(2); }
    // A fixture that moves takes its wiring with it. Leave the run behind and the
    // next lint correctly reports the fixture as orphaned.
    let rerouted = 0;
    for (const [rid, r] of Object.entries(world.runs || {})) {
      for (const pt of r.path) {
        if (Math.abs(pt[0] - (e.box.p[0] - (axis === 0 ? delta : 0))) < 2 &&
            Math.abs(pt[1] - (e.box.p[1] - (axis === 1 ? delta : 0))) < 2 &&
            Math.abs(pt[2] - (e.box.p[2] - (axis === 2 ? delta : 0))) < 2) {
          pt[axis] += delta; rerouted++;
        }
      }
      if (rerouted) OPS.route(world, { ...r, run: rid });
    }
    const j = OPS.join(world, { a: id, b: host.id });
    e.trace.push({ t: world.clock + 1, kind: 'mounted',
      note: `mounted on ${host.id}${moved ? `, brought ${Math.abs(moved)} in to reach it` : ''}` });
    return { changed: [id, host.id],
      note: `${id} ${over ? 'set on' : under ? 'hung from' : 'screwed to'} ${host.id} (${host.kind})` +
            (moved ? `, moved ${Math.abs(moved)} in to make contact` : '') +
            (rerouted ? `, ${rerouted} run point followed it` : '') };
  },

  /**
   * A strap, hanger or bracket that bridges the gap between a thing and what
   * holds it, rather than moving the thing. What a plumber reaches for when the
   * pipe is where it has to be and the joist is three inches away.
   */
  hanger(world, { id, to }) {
    const e = world.get(id), host = world.get(to);
    if (!e || !host) return { ok: false, note: `need both ${id} and ${to}` };
    const hid = `hanger.${id}`;
    if (world.get(hid)) return { ok: false, note: `${hid} already exists` };
    // spans from the host's near face to the element, across the widest gap
    const p = [0, 1, 2].map(i => 0), sz = [0, 1, 2].map(i => 0);
    let axis = 0, best = -Infinity;
    for (let i = 0; i < 3; i++) {
      const d = Math.max(host.lo[i] - e.hi[i], e.lo[i] - host.hi[i]);
      if (d > best) { best = d; axis = i; }
    }
    for (let i = 0; i < 3; i++) {
      if (i === axis) {
        const a = Math.min(host.hi[i], e.hi[i]), b = Math.max(host.lo[i], e.lo[i]);
        p[i] = (Math.min(a, b) + Math.max(a, b)) / 2;
        sz[i] = Math.abs(b - a);          // exactly the gap: it touches both, occupies neither
      } else {
        // exactly where the two already agree. Padded out to a minimum width it
        // grew past both of them and clipped the deck next door.
        const a = Math.max(e.lo[i], host.lo[i]), b = Math.min(e.hi[i], host.hi[i]);
        if (b - a > 0.25) { p[i] = (a + b) / 2; sz[i] = b - a; }
        else { p[i] = e.box.p[i]; sz[i] = Math.min(e.hi[i] - e.lo[i], host.hi[i] - host.lo[i]); }
      }
    }
    world.add(new Element({ id: hid, kind: 'hanger', layer: 'services', material: 'steel',
      box: box(p, sz), meta: { role: 'hanger', hangs: id, from: host.id } }));
    // No counts here: the schedule says how many, the same as for everything else.
    // Asserting "1 pipe hanger" by hand made the joint UNDER_NAILED against its own
    // rule, which scored worse than the unvented trap and got the vent walked back.
    OPS.join(world, { a: hid, b: host.id });
    OPS.join(world, { a: id, b: hid });
    e.trace.push({ t: world.clock + 1, kind: 'hung', note: `hung from ${host.id} on ${hid}, without moving` });
    return { changed: [hid, id, host.id],
      note: `${id} hung from ${host.id} on a ${best.toFixed(1)} in hanger — it stays where it is` };
  },

  /**
   * Hang everything that is hanging in the air — the equipment equivalent of
   * `nailOff`, and run for the same reason: a tradesman mounts a box before
   * pulling wire to it, not after. Run afterwards instead, every mount drags its
   * conductor off the fixture and the world reports an orphan it just created.
   */
  mountAll(world, { only } = {}) {
    const g = world.grounded();
    let made = 0, stuck = [];
    const changed = [];
    for (const e of world.solids()) {
      if (g.seen.has(e.id)) continue;
      if (only && e.layer !== only) continue;
      const near = mountsFor(world, e);
      const r = near.length ? OPS.mount(world, { id: e.id, to: near[0].id })
                            : { ok: false, note: 'nothing within reach' };
      if (r.ok === false) { stuck.push(`${e.id} (${r.note.replace(/\.$/, '')})`); continue; }
      made++; changed.push(...r.changed);
    }
    return { changed, note: `mounted ${made}` +
      (stuck.length ? `; ${stuck.length} still in the air: ${stuck.slice(0, 2).join(', ')}` : '') };
  },

  /**
   * Add blocking for something that has nothing to screw to — what an electrician
   * does when the box lands in a bay: a 2x4 flat between the two nearest members,
   * and the fixture goes on that. It refuses when the framing is out of reach,
   * because blocking spanning four feet to catch a stray object is not blocking.
   */
  blocking(world, { id, between }) {
    const e = world.get(id);
    if (!e) return { ok: false, note: `no element "${id}"` };
    const c = [0, 1, 2].map(i => (e.lo[i] + e.hi[i]) / 2);
    const dist = (o) => Math.hypot(...[0, 1, 2].map(i => Math.max(o.lo[i] - e.hi[i], e.lo[i] - o.hi[i], 0)));
    const scored = world.solids()
      .filter(o => ['stud', 'rafter', 'joist'].includes(o.kind))
      .map(o => ({ o, d: dist(o) })).sort((a, b) => a.d - b.d);
    if (!scored.length) return { ok: false, note: 'no framing to block between' };
    if (scored[0].d > REACH * 2)
      return { ok: false, note: `the nearest framing is ${scored[0].d.toFixed(1)} in from ${id}; ` +
        `it is not in a bay, it is in the air. It needs a place in the building, not a block.` };
    const first = scored[0].o;
    const thin = [0, 1, 2].reduce((m, i) => (first.hi[i] - first.lo[i]) < (first.hi[m] - first.lo[m]) ? i : m, 0);
    const mate = scored.slice(1).find(x => x.o.kind === first.kind &&
      Math.abs(((x.o.lo[thin] + x.o.hi[thin]) / 2) - ((first.lo[thin] + first.hi[thin]) / 2)) > 1);
    if (!mate) return { ok: false, note: `nothing to span to beside ${first.id}` };
    const a = Math.min(first.hi[thin], mate.o.hi[thin]), b = Math.max(first.lo[thin], mate.o.lo[thin]);
    const p = c.slice(), sz = [1.5, 1.5, 1.5];
    p[thin] = (a + b) / 2; sz[thin] = Math.abs(b - a);
    const depthAxis = first.kind === 'stud' ? [0, 1].find(i => i !== thin) : 2;
    sz[depthAxis] = 3.5; p[depthAxis] = (first.lo[depthAxis] + first.hi[depthAxis]) / 2;
    const bid = `blocking.${id}`;
    if (world.get(bid)) return { ok: false, note: `${bid} already exists` };
    world.add(new Element({ id: bid, kind: 'blocking', layer: 'frame', material: 'wood',
      section: '2x4', box: box(p, sz),
      meta: { role: `blocking for ${id}`, between: [first.id, mate.o.id] } }));
    OPS.join(world, { a: bid, b: first.id });
    OPS.join(world, { a: bid, b: mate.o.id });
    const m = OPS.mount(world, { id, to: bid });
    return { changed: [bid, id, first.id, mate.o.id],
      note: `2x4 blocking between ${first.id} and ${mate.o.id}; ${m.ok === false ? m.note : m.note}` };
  },

  place(world, { id, kind, layer, at, size, material, section, shear }) {
    if (world.get(id)) return { ok: false, note: `${id} already exists` };
    world.add(new Element({ id, kind, layer: layer || 'interior', box: box(at, size), material, section, shear }));
    return { changed: [id], note: `${id} placed` };
  }
};
