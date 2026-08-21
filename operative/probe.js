// operative/probe.js — what would happen if.
//
// A full re-lint costs ~16 ms, which is the whole frame budget; a drag that ran
// one per frame would stutter before it said anything useful. So a disturbance is
// evaluated the way the building would feel it: through the things the moved part
// actually touches, carries, and is carried by. Local by measurement as much as by
// principle.
//
// Nothing here commits. The element is put back exactly as it was found.
import { separation, aabb, bearsOn, fastenedTo } from './poly.js';
import { box as mkbox } from './geom.js';

const REACH = 0.7;
const nearby = (A, B) => {
  for (let i = 0; i < 3; i++) if (A.lo[i] > B.hi[i] + REACH || B.lo[i] > A.hi[i] + REACH) return false;
  return true;
};

/** Who bears on `id` right now — needed before a move, to know who will be let down by it. */
export function dependents(world, id) {
  const el = world.get(id);
  if (!el) return [];
  const P = el.poly(), A = aabb(P);
  const out = [];
  for (const other of world.solids()) {
    if (other.id === id) continue;
    const Q = other.poly();
    if (!nearby(A, aabb(Q))) continue;
    if (bearsOn(Q, P) > 0.5) out.push(other.id);
  }
  return out;
}

/**
 * Evaluate a hypothetical placement without committing it.
 * Returns the answer in the terms the systems actually have: does it hit anything,
 * is it still carried, and does anything it was carrying fall down.
 */
export function probeMove(world, id, nextBox, nextShear) {
  const el = world.get(id);
  if (!el) return { ok: false, note: `no member "${id}"` };

  const wasBox = mkbox(el.box.p, el.box.s);
  const wasShear = el.shear;
  const carried = dependents(world, id);          // measured before the move

  el.box = mkbox(nextBox.p, nextBox.s);
  if (nextShear !== undefined) el.shear = nextShear;

  const clashes = [], bearing = [], fastened = [], orphaned = [];
  try {
    const P = el.poly(), A = aabb(P);
    const needsGround = el.layer !== 'services';
    for (const other of world.solids()) {
      if (other.id === id) continue;
      const Q = other.poly(), B = aabb(Q);
      if (!nearby(A, B)) continue;
      const sep = separation(P, Q, 0.06);
      if (sep) { clashes.push({ id: other.id, depth: +sep.depth.toFixed(2) }); continue; }
      if (bearsOn(P, Q) > 0.5) bearing.push(other.id);
      else if (fastenedTo(P, Q) > 4) fastened.push(other.id);
    }
    // anything that was resting on this member: is it still resting on something?
    for (const depId of carried) {
      const d = world.get(depId);
      if (!d) continue;
      const D = d.poly(), DB = aabb(D);
      let held = false;
      for (const other of world.solids()) {
        if (other.id === depId) continue;
        const Q = other.poly();
        if (!nearby(DB, aabb(Q))) continue;
        if (bearsOn(D, Q) > 0.5) { held = true; break; }
      }
      if (!held) orphaned.push(depId);
    }
    const grounded = el.lo[2] <= 0.6;
    const floating = needsGround && !grounded && bearing.length === 0 && fastened.length === 0;
    return {
      ok: clashes.length === 0 && !floating && orphaned.length === 0,
      clashes, bearing, fastened, orphaned, floating,
      structure: clashes.length ? 'CLASH' : 'CLEAR',
      support: floating ? 'FLOATING' : (bearing.length ? 'BEARING' : fastened.length ? 'FASTENED' : grounded ? 'GROUNDED' : 'FLOATING'),
      dependents: carried
    };
  } finally {
    el.box = wasBox;                              // put it back, always
    el.shear = wasShear;
  }
}

/**
 * What a member can say about itself, entirely from state. No personality, no
 * invented interiority: identity, relationship, constraint, and — only when a
 * consequence gives it something worth saying — observation and request.
 */
export function speak(world, id) {
  const el = world.get(id);
  if (!el) return null;
  const g = world.grounded();
  const under = g.under.get(id) || [], over = g.over.get(id) || [];
  const lines = [];
  lines.push(['I_AM', `${el.kind}${el.section ? ' ' + el.section : ''} in ${el.layer}`]);
  lines.push(['I_AM_MADE_OF', el.material.replace(/_/g, ' ')]);
  const bears = under.filter(u => u.via === 'bear').map(u => u.id);
  const carries = over.filter(u => u.via === 'bear').map(u => u.id);
  const tied = under.filter(u => u.via === 'fasten').map(u => u.id);
  if (bears.length) lines.push(['I_AM_SUPPORTED_BY', bears.join(', ')]);
  if (carries.length) lines.push(['I_SUPPORT', carries.join(', ')]);
  if (tied.length) lines.push(['I_CONNECT_TO', tied.join(', ')]);
  for (const p of el.meta.penetrations || [])
    lines.push(['I_WAS_BORED', `${p.dia.toFixed(2)} in for ${p.run}, ${p.edge !== undefined ? p.edge.toFixed(2) + ' in of edge left' : 'through'}`]);

  const mine = (world.conditions || []).filter(c => c.elements.includes(id));
  for (const c of mine) {
    const others = c.elements.filter(x => x !== id);
    lines.push(['I_OBSERVE', c.message]);
    if (c.repair) {
      const ask = c.repair.chain ? c.repair.chain.map(s => s.op).join(' then ') : c.repair.op;
      lines.push(['I_REQUEST', ask]);
    } else if (others.length) {
      lines.push(['I_REQUEST', `clearance from ${others.join(', ')}`]);
    }
  }
  return { id, lines, quiet: mine.length === 0 };
}

/**
 * An element's geometry history, recovered from the journal snapshots that were
 * already being kept for reversibility. Ghosts need no new storage.
 */
export function geometryHistory(world, id) {
  const out = [];
  const push = (t, box, shear, note, cause, current) => {
    const last = out[out.length - 1];
    const same = last && JSON.stringify(last.box) === JSON.stringify(box) && JSON.stringify(last.shear || null) === JSON.stringify(shear || null);
    // An unchanged state is not a new encounter, but if it is the state the member
    // is standing in right now, the last dot has to say so.
    if (same) { if (current) { last.current = true; last.note = 'current'; } return; }
    out.push({ t, box, shear: shear || null, note, cause: cause || null, current: !!current });
  };
  for (const rec of world.history) {
    if (!rec.snapshot) continue;
    const e = rec.snapshot.elements.find(x => x.id === id);
    if (!e) continue;
    push(rec.t, e.box, e.shear, `before ${rec.op || rec.kind}: ${rec.note}`, rec.cause);
  }
  const now = world.get(id);
  if (now) push(world.clock, now.box, now.shear, 'current', null, true);
  return out;
}
