// operative/ops.js — the operative vocabulary.
//
// Every move is explicit, inspectable and reversible. Nothing changes the world
// except through commit(), which measures the conditions before and after so the
// world's answer is attached to the instruction that provoked it.
import { Element, SECTIONS } from './world.js';
import { box } from './geom.js';
import { poly, segmentPoly, aabb } from './poly.js';
import { checkAll, SPAN_TABLE, BORE } from './checks.js';
import { scheduleFor, required, joinKey, scheduleForPair, sortOf } from './joints.js';
import { mountsFor, REACH } from './gravity.js';
import { artificial, TARGET_FC } from './light.js';

const key = (c) => `${c.code}:${c.elements.join('|')}`;

/** Deep snapshot of the mutable world, so any move can be walked back. */
/** A complete, serialisable copy of the world's state. */
export function snapshot(world) {
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
/** Put a snapshot back. */
export function restore(world, snap) {
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
/**
 * Expand a polyline into axis-aligned legs. Already-axial input is returned
 * unchanged, so this is safe to apply to every route.
 */
export function axial(path, sloped = false) {
  const out = [path[0].slice()];
  const push = (p) => { const l = out[out.length - 1];
    if (Math.abs(l[0] - p[0]) > 1e-6 || Math.abs(l[1] - p[1]) > 1e-6 || Math.abs(l[2] - p[2]) > 1e-6) out.push(p.slice()); };
  for (let i = 0; i < path.length - 1; i++) {
    const a = out[out.length - 1], b = path[i + 1];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const moving = [0, 1, 2].filter(k => Math.abs(d[k]) > 1e-6);
    if (moving.length <= 1) { push(b); continue; }
    const horiz = [0, 1].filter(k => Math.abs(d[k]) > 1e-6)
      .sort((x, y) => Math.abs(d[y]) - Math.abs(d[x]));   // the long leg first
    const hlen = Math.hypot(d[0], d[1]);
    // A shallow slope over a long horizontal run is not a diagonal shortcut, it is
    // a fall. Squaring it off cost the drain every inch of its slope — the floor
    // was deepened to 2x8 to make that slope legal — so a leg gentler than 3 in
    // per foot keeps its z, distributed across the horizontal legs it becomes.
    // Only gravity drainage gets this. A 12 V wire dropping 38 in across 17 ft is
    // not a fall, it is a diagonal, and letting it ramp put the conduit back on
    // the slant the whole expansion exists to remove.
    const SLOPE = 0.25;
    if (sloped && hlen > 1e-6 && Math.abs(d[2]) / hlen <= SLOPE) {
      const p = a.slice();
      let done = 0;
      for (const k of horiz) {
        done += Math.abs(d[k]);
        p[k] = b[k];
        p[2] = a[2] + d[2] * (done / (Math.abs(d[0]) + Math.abs(d[1])));
        push(p);
      }
      push(b);
      continue;
    }
    // Otherwise: rise early, fall late. A wire goes up the wall then across the
    // ceiling; a vertical drop happens at the end of the horizontal run.
    const order = Math.abs(d[2]) > 1e-6 ? (d[2] > 0 ? [2, ...horiz] : [...horiz, 2]) : horiz;
    const p = a.slice();
    for (const k of order) { p[k] = b[k]; push(p); }
    push(b);
  }
  return out;
}

/**
 * The vocabulary, with real argument names, read off the functions themselves.
 *
 * Written by hand this list goes stale the first time an op changes, and a caller
 * working from a stale list calls `move(id, by)` against `move(id, delta)`: the
 * op refuses, the refusal is silent enough to look like a no-op, and the loop
 * spins answering a criticism it never acted on.
 */
export function signatures() {
  const out = {};
  for (const [name, fn] of Object.entries(OPS)) {
    const src = fn.toString();
    const m = src.match(/^[^(]*\(\s*world\s*,\s*\{([^}]*)\}/);
    out[name] = m
      ? m[1].split(',').map(a => a.split(/[:=]/)[0].trim()).filter(Boolean)
      : [];
  }
  return out;
}

/** One line per op, for a prompt or a help screen. */
export function vocabulary() {
  const sig = signatures();
  return Object.keys(sig).sort().map(k => `${k}(${sig[k].join(', ')})`).join('\n');
}

/** The roof plane an element comes through, if any. */
function roofUnder(world, e) {
  return world.solids().find(p => p.layer === 'roof' && p.kind === 'panel' &&
    e.lo[2] < p.hi[2] && e.hi[2] > p.lo[2] &&
    Math.min(p.hi[0], e.hi[0]) - Math.max(p.lo[0], e.lo[0]) > 0.1 &&
    Math.min(p.hi[1], e.hi[1]) - Math.max(p.lo[1], e.lo[1]) > 0.1) || null;
}

/** Is this element a point on some service run? Then its position is a decision. */
function onARun(world, e) {
  for (const r of Object.values(world.runs || {}))
    for (const pt of r.path)
      if (Math.abs(pt[0] - e.box.p[0]) < 2 && Math.abs(pt[1] - e.box.p[1]) < 2 && Math.abs(pt[2] - e.box.p[2]) < 2) return true;
  return false;
}

/** The middle of the building, for deciding which way is out. */
function worldCentre(world) {
  const s = world.solids();
  if (!s.length) return [0, 0, 0];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const e of s) for (let i = 0; i < 3; i++) {
    if (e.lo[i] < lo[i]) lo[i] = e.lo[i];
    if (e.hi[i] > hi[i]) hi[i] = e.hi[i];
  }
  return [0, 1, 2].map(i => (lo[i] + hi[i]) / 2);
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

    // And cut the skin. For the whole life of this project `cut` interrupted the
    // studs, added a header and recorded an opening — and left the exterior
    // sheathing as one unbroken panel across it. The trailer had a framed door
    // you could not walk through and four framed windows you could not see out
    // of, and nothing said so, because every check was about the framing.
    //
    // It surfaced when the ray scanner reported that not one ray in fifty
    // thousand had left through an opening. The control group was empty. The
    // absence of the expected reading was the finding.
    const panels = world.all({ kind: 'sheathing' }).filter(p =>
      p.meta.wall === wall && !p.meta.opening &&
      p.lo[2] < z1 - 0.01 && p.hi[2] > z0 + 0.01);
    const u = along(w);                       // the axis the wall runs along
    for (const p of panels) {
      if (p.lo[u] > from - 0.01 && p.hi[u] < to + 0.01 && p.lo[2] > z0 - 0.01 && p.hi[2] < z1 + 0.01) {
        world.remove(p.id); changed.push(p.id); continue;    // wholly inside the hole
      }
      if (p.hi[u] <= from + 0.01 || p.lo[u] >= to - 0.01) continue;   // clear of it
      // An eighth of an inch at every cut edge. Every sheet of sheathing ships with
      // that gap printed on it for expansion, and without it the four pieces butt
      // face to face and the overlap check — which inflates by a tolerance before
      // testing — reports the wall as interpenetrating itself.
      const GAP = 0.125;
      const pieces = [
        ['below', p.lo[u], p.hi[u], p.lo[2], Math.min(z0, p.hi[2]) - GAP],
        ['above', p.lo[u], p.hi[u], Math.max(z1, p.lo[2]) + GAP, p.hi[2]],
        ['near',  p.lo[u], Math.min(from, p.hi[u]) - GAP, Math.max(z0, p.lo[2]), Math.min(z1, p.hi[2])],
        ['far',   Math.max(to, p.lo[u]) + GAP, p.hi[u], Math.max(z0, p.lo[2]), Math.min(z1, p.hi[2])]
      ];
      let made = 0;
      const made2 = [];
      for (const [tag, a, b, c, e] of pieces) {
        if (b - a < 0.5 || e - c < 0.5) continue;
        const np = [...p.box.p], ns = [...p.box.s];
        np[u] = (a + b) / 2; ns[u] = b - a;
        np[2] = (c + e) / 2; ns[2] = e - c;
        const nid = `${p.id}.${openId.replace(/\./g, '_')}.${tag}`;
        world.add(new Element({ id: nid, kind: 'sheathing', layer: p.layer, material: p.material,
          box: box(np, ns), shear: p.shear,
          meta: { ...p.meta, role: 'skin beside an opening', from: p.id, opening: openId } }));
        changed.push(nid); made2.push(nid); made++;
      }
      // Everything that was screwed to the panel is still screwed to the wall; the
      // wall just has a hole in it now. Dropped instead of transferred, the fuse
      // block and the charge controller fell off the west wall the moment a door
      // was cut in it, forty feet away.
      const orphaned = [...world.joints.entries()].filter(([, j]) => j.a === p.id || j.b === p.id);
      for (const [key, j] of orphaned) {
        world.joints.delete(key);
        const other = world.get(j.a === p.id ? j.b : j.a);
        if (!other) continue;
        const heir = made2.map(id => world.get(id)).filter(Boolean)
          .map(n => ({ n, d: Math.hypot(...[0, 1, 2].map(i =>
            Math.max(n.lo[i] - other.hi[i], other.lo[i] - n.hi[i], 0))) }))
          .sort((a, b) => a.d - b.d)[0];
        // The spread has to come first: `{a, b, ...j}` puts the dead panel's own
        // ids straight back over the new ones and the transfer rejoins nothing.
        if (heir && heir.d < 2) OPS.join(world, { ...j, a: heir.n.id, b: other.id });
      }
      world.remove(p.id); changed.push(p.id);
      if (!made) return { ok: false, note: `cutting ${openId} would remove all of ${p.id}` };
    }

    return { changed, note: `${type} ${(to - from).toFixed(0)}x${(z1 - z0).toFixed(0)} in cut in wall ${wall}; ` +
      `${cut.length} stud${cut.length === 1 ? '' : 's'} interrupted, skin opened in ${panels.length} panel${panels.length === 1 ? '' : 's'}` };
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
    // A segment is drawn as a box around its two endpoints. A diagonal leg
    // therefore becomes a solid the size of its own bounding box: `dc.fan` ran
    // from the fuse block to the bathroom fan and was modelled as a 60 x 204 x 38
    // in block of conduit sitting in the middle of the trailer. Nobody saw it
    // because nobody had ever taken an interior photograph.
    //
    // Real conduit and real pipe run in axial legs along the framing, so a path
    // is expanded into axial legs before anything is built from it. Rise early,
    // fall late: a wire goes up the wall then across the ceiling, a drain runs
    // along and then down.
    path = axial(path, system === 'waste');
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
      // Raising a wall lifts whatever was at the top of it. A panel under a
      // windowsill or beside a door was never at the top, and stretching it up
      // grew the skin straight across the opening it had just been cut around.
      const atTheTop = e.hi[2] >= (world.walls[e.meta.wall] || { wallTop: Infinity }).wallTop - 0.5;
      if (e.kind === 'sheathing' && e.meta.opening && !atTheTop) continue;
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
          // Same rule as raising: only what was at the top of the wall follows the
          // roof. Without this, reseating the roof stretched the panel under the
          // doorway from the floor to the rafters and sealed the door shut.
          if (e.meta.opening && e.hi[2] < wall.wallTop - 0.5) continue;
          const bot = e.box.p[2] - e.box.s[2] / 2;
          // Square at the bottom, cut to the lowest point of the roof over its own
          // span. A sheared box is a parallelogram: tilting the top to follow the
          // roof tilted the bottom by the same amount, and a panel beside a door
          // dropped its low corner straight through the panel under the door.
          // A real panel is cut to a slope on one edge only, and the wedge left
          // above it is infill — which is what the gable strips are for.
          const half = e.box.s[0] / 2;
          const top = Math.min(plane(e.box.p[0] - half), plane(e.box.p[0] + half));
          e.shear = null;
          e.box.s[2] = Math.max(0.75, top - bot);
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
    const rule = scheduleForPair(A, B);
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
   * Tape every seam in the skin that is a gap rather than a joint.
   *
   * `cut` splits a panel around an opening and leaves an eighth of an inch
   * between the pieces — the expansion gap printed on every sheet of sheathing,
   * which on site you tape. Nothing taped them, and at 2048 rays per lamp they
   * were the building's largest leak: 65 of 124 escaping rays, in lines up to
   * eleven feet long and a tenth of an inch wide, at exactly the head and sill
   * of every window.
   *
   * The LEAK check has proposed `tape` as its repair the whole time and never
   * fired, because its own sweep is coarse enough to miss an eighth-inch seam —
   * it says so in its `resolution` field. A check that cannot see the thing it
   * knows how to fix is not going to fix it.
   */
  tapeSeams(world, { gap = 0.25, only = null } = {}) {
    const skin = world.all({ kind: 'sheathing' }).filter(e => !only || e.meta.wall === only);
    const changed = [];
    let made = 0, stale = 0;
    // Tape placed by `cut` was correct for the wall `cut` saw, and then `raise`
    // and `pitch` moved the panels out from under it — the seam ended up at
    // z 67.8 with its tape sitting at 68.75, sealing nothing, in a build that
    // otherwise reported one open condition. Seams get sealed against the final
    // envelope or not at all, so this throws away what it laid last time.
    for (const t of world.all({ kind: 'tape' })) {
      const seals = t.meta.seals || [];
      if (only && !seals.some(id => (world.get(id) || { meta: {} }).meta.wall === only)) continue;
      world.remove(t.id); changed.push(t.id); stale++;
    }
    for (let i = 0; i < skin.length; i++) for (let j = i + 1; j < skin.length; j++) {
      const a = skin[i], b = skin[j];
      const d = [0, 1, 2].map(k => Math.max(a.lo[k] - b.hi[k], b.lo[k] - a.hi[k], 0));
      const apart = Math.hypot(...d);
      if (apart > gap || apart === 0) continue;      // touching is a joint, far apart is a wall
      // Only a seam: they must share the plane of the skin and overlap along it.
      const shared = [0, 1, 2].filter(k => Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]) > 1);
      if (shared.length < 1) continue;
      const r = OPS.tape(world, { a: a.id, b: b.id });
      if (r.changed) { made++; changed.push(...r.changed); }
    }
    return { changed: [...new Set(changed)],
      note: `${made} seam${made === 1 ? '' : 's'} taped at up to ${gap} in${stale ? `; ${stale} stale strip${stale === 1 ? '' : 's'} lifted` : ''}` };
  },

  /**
   * Nail one new member to everything it landed on.
   *
   * The fourth instance of one bug. `mount` put a part in and left it floating;
   * `vent` put a stack in and left it floating; `strap` placed a tie and never
   * joined it; and `flash` joined its apron to the roof and to the pipe while the
   * apron also came down on two solar panels, which the schedule covers. Every
   * time, the op that added the part reported success and a blocking condition
   * appeared somewhere else, so the loop walked the whole move back and the
   * building stayed broken in the original way instead.
   *
   * An op that puts a part in fastens it. This is that sentence, once.
   */
  nailTo(world, { id }) {
    const e = world.get(id);
    if (!e) return { ok: false, note: `no element "${id}"` };
    const changed = [];
    let made = 0, noFace = 0;
    for (const c of world.contacts({ minFace: 0 })) {
      if (c.a !== id && c.b !== id) continue;
      const other = c.a === id ? c.b : c.a;
      if (world.joints.has(joinKey(id, other))) continue;
      const O = world.get(other);
      if (!O || !scheduleForPair(e, O)) continue;
      if (c.face < 1) { noFace++; continue; }      // an edge is not a face
      const r = OPS.join(world, { a: id, b: other });
      if (r.changed) { made++; changed.push(...r.changed); }
    }
    return { changed: [...new Set(changed)],
      note: `${id} nailed to ${made} thing${made === 1 ? '' : 's'} it lands on${noFace ? `; ${noFace} edge contacts left for UNLAPPED` : ''}` };
  },

  /**
   * Nail off everything the schedule covers — what a framer actually does, in one
   * pass, rather than one joint at a time.
   */
  nailOff(world, { only } = {}) {
    let made = 0, skipped = 0, noFace = 0;
    const changed = [];
    // Face contact, not the load path. Walking the support graph, this op nailed
    // what carries what and never nailed what merely touches — so the hitch
    // coupler, the roof cover to every gable, and sixteen rafters to their top
    // plates were left loose on a build that reported zero open conditions. And
    // because the UNJOINED check walked the same graph, it could not report the
    // joints this op could not make.
    for (const c of world.contacts({ minFace: 0 })) {
      const A = world.get(c.a), B = world.get(c.b);
      if (!A || !B) continue;
      if (world.joints.has(joinKey(c.a, c.b))) continue;
      const rule = scheduleForPair(A, B);
      if (!rule) { skipped++; continue; }
      if (only && ![A.kind, B.kind].includes(only)) continue;
      // An edge is not a face. Two members that meet along a line have nothing to
      // put a fastener through, and asserting a joint there would be a lie that
      // silences the condition. Those are reported by UNLAPPED, not nailed.
      if (c.face < 1) { noFace++; continue; }
      const r = OPS.join(world, { a: c.a, b: c.b });
      if (r.changed) { made++; changed.push(...r.changed); }
    }
    const notes = [`nailed off ${made} joint${made === 1 ? '' : 's'}`];
    if (skipped) notes.push(`${skipped} contacts have no schedule entry`);
    if (noFace) notes.push(`${noFace} meet edge to edge with no face to nail`);
    return { changed: [...new Set(changed)], note: notes.join('; ') };
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

  /**
   * Flash a penetration. A pipe through a roof is a hole in the only surface
   * keeping water out, and flashing is a *thing* — a collar and an apron — not an
   * attribute. If the model does not contain it, it is not on the building.
   */
  flash(world, { id, through }) {
    const e = world.get(id);
    if (!e) return { ok: false, note: `no element "${id}"` };
    const roof = through ? world.get(through) : roofUnder(world, e);
    if (!roof) return { ok: false, note: `${id} does not come through anything` };
    const fid = `flash.${id}`;
    if (world.get(fid)) return { ok: false, note: `${fid} already exists` };
    // An apron 8 in all round, clipped to the roof it sits on. A vent 2 in from the
    // edge got an apron that hung 3.5 in past it and put the trailer at 104.5 in
    // overall — the flashing broke the towing envelope.
    const pad = 8;
    const lo = [0, 1].map(i => Math.max(roof.lo[i], e.lo[i] - pad));
    const hi = [0, 1].map(i => Math.min(roof.hi[i], e.hi[i] + pad));
    const w = Math.min(hi[0] - lo[0], hi[1] - lo[1]);
    world.add(new Element({ id: fid, kind: 'flashing', layer: 'roof', material: 'steel',
      box: box([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, roof.hi[2] + 0.03],
               [hi[0] - lo[0], hi[1] - lo[1], 0.06]),      // sheet metal, drawn as sheet metal
      meta: { role: 'flashing', seals: id, through: roof.id,
              detail: 'apron on the roof, storm collar on the pipe' } }));
    OPS.join(world, { a: fid, b: roof.id });
    OPS.join(world, { a: fid, b: id });
    // An eleven inch apron lands on whatever else is up there. Joining it to the
    // roof and the pipe and stopping left it unfastened to two solar panels, which
    // is a blocking condition, so the loop walked every flashing back and shipped
    // two unflashed roof penetrations instead.
    const also = OPS.nailTo(world, { id: fid });
    return { changed: [...new Set([fid, id, roof.id, ...(also.changed || [])])],
      note: `${id} flashed where it comes through ${roof.id} — ${w.toFixed(0)} in apron and a storm collar; ${also.note}` };
  },

  /**
   * Put enough fasteners in. The shake test says what the joint has to carry; the
   * schedule says what one fastener takes; this closes the gap rather than leaving
   * a joint at 1.03 times its capacity and calling it fine.
   */
  refasten(world, { id, factor = 1.5 }) {
    const e = world.get(id);
    if (!e) return { ok: false, note: `no element "${id}"` };
    const g = world.grounded();
    const downs = (g.under.get(id) || []).filter(u => u.via !== 'touch');
    if (!downs.length) return { ok: false, note: `${id} has nothing below it to fasten to` };
    let raised = 0;
    for (const u of downs) {
      const key = joinKey(id, u.id);
      const j = world.joints.get(key);
      if (!j) { OPS.join(world, { a: id, b: u.id }); raised++; continue; }
      const before = j.count;
      j.count = Math.ceil(j.count * factor);
      if (j.count > before) raised++;
      e.trace.push({ t: world.clock + 1, kind: 'refastened',
        note: `${before} -> ${j.count} ${j.size} to ${u.id}` });
    }
    return { changed: [id, ...downs.map(u => u.id)],
      note: `${id}: ${raised} joint${raised === 1 ? '' : 's'} taken up to ${Math.round(factor * 100)}%` };
  },

  /**
   * Put enough light in. Six 3 W pucks in a 168 sq ft house average 4.3
   * foot-candles, which is a stairwell. The power budget passed the whole time,
   * because 18 W is easy on a battery — the electrical system was optimised
   * against a constraint that rewarded being dim.
   */
  relamp(world, { target = TARGET_FC, watts } = {}) {
    const lamps = world.all().filter(e => (e.meta.role === 'light' || e.kind === 'light') && e.meta.watts);
    if (!lamps.length) return { ok: false, note: 'there are no lamps to change' };
    const a = artificial(world);
    if (!a) return { ok: false, note: 'no floor to light' };
    const each = watts || Math.ceil((a.wattsNeeded / lamps.length) * (target / TARGET_FC));
    const before = a.watts;
    for (const l of lamps) {
      l.meta.watts = each;
      l.trace.push({ t: world.clock + 1, kind: 'relamped', note: `${each} W` });
    }
    const after = artificial(world);
    return { changed: lamps.map(l => l.id),
      note: `${lamps.length} lamps ${before / lamps.length} W -> ${each} W each; ` +
            `${after.average} fc average against a ${target} fc target ` +
            `(${(each * lamps.length - before)} W more on the bank)` };
  },

  /**
   * Tape a joint in the skin. Sheathing ships with an eighth of an inch of
   * expansion gap printed on it, which is a hole; the air barrier is the tape
   * over it, and in the model as on site it is a thing you install, not an
   * assumption. The ray scanner found every one of these before anybody thought
   * to look for them.
   */
  // How far a seam tape laps each panel, inches. Wide enough to be a tape and
  // not a filler.
  tape(world, { a, b, at }) {
    const A = world.get(a), B = b ? world.get(b) : null;
    if (!A) return { ok: false, note: `no element "${a}"` };
    const tid = `tape.${a}${b ? `.${b}` : ''}`;
    if (world.get(tid)) return { ok: false, note: `${tid} already exists` };
    // The seam runs the length of what the two panels share, and crosses the gap
    // between them.
    //
    // This used to read `max(min(hi), min(lo))` .. `min(max(hi), max(lo))`, which
    // describes the space between two panels laid side by side and inverts the
    // moment one panel spans the other — exactly the case `cut` produces, where a
    // full-height strip runs past a shorter one beside an opening. Both ends
    // collapsed, a floor of 0.06 in kept the box legal, and a rule that widened
    // "the thinnest remaining axis" to three inches turned an eleven foot seam
    // into a three inch patch in the middle of it. Sixteen of those sealed six of
    // sixty-five leaking rays and looked from the outside like tape.
    // SKIN matches the 0.06 in floor that `sz` puts under every dimension. At 0.05 the
    // floor inflated the box symmetrically about its own centre and put five
    // thousandths of an inch of tape outside the sheathing on both flanks — which
    // is 102.01 in overall and a trailer that is illegal to tow.
    const LAP = 1.5, SKIN = 0.06;
    const gapOf = (i) => Math.min(A.hi[i], B.hi[i]) - Math.max(A.lo[i], B.lo[i]);
    let lo, hi;
    if (B) {
      // Three axes, three different jobs. The one they are apart on is the seam to
      // bridge. Of the two they share, the thinner is the skin's own thickness and
      // the other is the length of the seam.
      const across = [0, 1, 2].reduce((m, i) => (gapOf(i) < gapOf(m) ? i : m), 0);
      const rest = [0, 1, 2].filter(i => i !== across);
      const thick = gapOf(rest[0]) < gapOf(rest[1]) ? rest[0] : rest[1];
      // Tape goes IN the outer face of the skin, not through it and not proud of it.
      //
      // Lapped an inch and a half into the full thickness of both panels it read as
      // twenty-eight interpenetrations at severity 3, which is correct: that is not
      // a tape, it is a wedge driven into the wall. Moved outboard by six
      // hundredths of an inch instead, it took the trailer to 102.1 in and broke
      // the towing envelope — the same six hundredths, and the same mistake the
      // first drip edge made at three quarters of an inch. This trailer is built to
      // the legal width, so nothing may be added to the outside of it. Flush, in
      // the outermost fiftieth of the panel, inside OVERLAP's own 0.06 in tolerance.
      const mid = worldCentre(world);
      const out = (A.lo[thick] + A.hi[thick]) / 2 > mid[thick] ? 1 : -1;
      const face = out > 0 ? Math.max(A.hi[thick], B.hi[thick]) : Math.min(A.lo[thick], B.lo[thick]);
      lo = [0, 1, 2].map(i => i === across ? Math.min(A.hi[i], B.hi[i]) - LAP
                          : i === thick  ? (out > 0 ? face - SKIN : face)
                          : Math.max(A.lo[i], B.lo[i]));
      hi = [0, 1, 2].map(i => i === across ? Math.max(A.lo[i], B.lo[i]) + LAP
                          : i === thick  ? (out > 0 ? face : face + SKIN)
                          : Math.min(A.hi[i], B.hi[i]));
    } else {
      lo = [0, 1, 2].map(i => (at ? at[i] - 2 : A.lo[i]));
      hi = [0, 1, 2].map(i => (at ? at[i] + 2 : A.hi[i]));
    }
    const p = [0, 1, 2].map(i => (lo[i] + hi[i]) / 2);
    const sz = [0, 1, 2].map(i => Math.max(0.06, hi[i] - lo[i]));
    world.add(new Element({ id: tid, kind: 'tape', layer: 'walls', material: 'paint',
      box: box(p, sz), meta: { role: 'sheathing seam tape', seals: [a, b].filter(Boolean) } }));
    const along = sz.indexOf(Math.max(...sz));
    return { changed: [tid, a, b].filter(Boolean),
      note: `${tid}: ${sz[along].toFixed(0)} in of seam taped` };
  },

  /**
   * Fill an opening: a leaf in a doorway, a pane in a window.
   *
   * Nothing in this model has ever represented a door or a piece of glass. The
   * openings were holes and stayed holes, which the ray scan was happy with —
   * light is supposed to come through a window — and which the voxel CT was not,
   * because it floods *air*, and air walked in through the front door and
   * reported that the trailer enclosed nothing at all.
   *
   * The two instruments disagreeing was the finding. Glass is transparent to one
   * and solid to the other, and until there was glass neither of them could say
   * so.
   */
  close(world, { opening, id, type, thickness }) {
    const op = world.get(opening);
    if (!op) return { ok: false, note: `no opening "${opening}"` };
    const kind = type || (op.meta.type === 'door' ? 'leaf' : 'glazing');
    const lid = id || `${kind}.${opening}`;
    if (world.get(lid)) return { ok: false, note: `${lid} already exists` };
    const w = world.walls[op.meta.wall];
    const t = thickness || (kind === 'leaf' ? 1.75 : 0.75);
    // in the plane of the wall, inset a little so it reads as sitting in a frame
    const p = [...op.box.p], sz = [...op.box.s];
    const thin = w ? (w.axis === 'y' ? 0 : 1) : sz.indexOf(Math.min(...sz));
    sz[thin] = t;
    // Filling the rough opening exactly. Inset by half an inch all round — the
    // shim gap a real window is packed and taped into — the CT's flood went
    // straight round the glass and the trailer still enclosed nothing.
    // The frame takes up that difference; the model says the opening is closed.
    world.add(new Element({ id: lid, kind, layer: 'walls',
      material: kind === 'leaf' ? 'wood' : 'glass',
      box: box(p, sz),
      meta: { role: kind === 'leaf' ? 'door leaf' : 'glazing', fills: opening,
              wall: op.meta.wall, transparent: kind !== 'leaf' } }));
    return { changed: [lid, opening],
      note: `${opening} filled with ${kind === 'leaf' ? 'a door leaf' : 'glazing'} ` +
            `${Math.max(sz[0], sz[1]).toFixed(0)} x ${sz[2].toFixed(0)} in` };
  },

  /** Fill every opening that has nothing in it. */
  closeAll(world, {} = {}) {
    const changed = [];
    let n = 0;
    for (const op of world.all({ kind: 'opening' })) {
      if (world.all().some(e => e.meta.fills === op.id)) continue;
      const r = OPS.close(world, { opening: op.id });
      if (r.ok === false) continue;
      changed.push(...r.changed); n++;
    }
    return { changed, note: `${n} opening${n === 1 ? '' : 's'} filled` };
  },

  place(world, { id, kind, layer, at, size, material, section, shear }) {
    if (world.get(id)) return { ok: false, note: `${id} already exists` };
    world.add(new Element({ id, kind, layer: layer || 'interior', box: box(at, size), material, section, shear }));
    return { changed: [id], note: `${id} placed` };
  }
};
