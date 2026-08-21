// operative/comfort.js — fitting is not the same as being able to bear it.
//
// inhabit.js answers whether a body fits and can get there. That is the floor,
// not the ceiling. A seat you fit on can still be one you cannot sit at for
// twenty minutes; a sink you can reach can still be one you have to lean over
// because there is nowhere to put your toes.
//
// Every criterion here is a published minimum or a dimension off the body, and
// every one names which. Where a thing fails, it fails by a number.
//
// Two rules from the brief, and both change the answers:
//
//   NOBODY SHOULD HAVE TO CROUCH. A fridge you kneel for is a design fault, not
//   a posture. Storage below knee height is counted against the design.
//
//   THE SERVICES ARE IN THE ROOM. `world.solids()` drops runs, and runs are the
//   hundred and thirteen wires and pipes in this trailer. Every clearance in this
//   file is measured against the building with its plumbing in it.

import { figure } from './figure.js';
import { obstacles } from './everybody.js';

const ok = (v, lo, hi) => v >= lo && (hi === undefined || v <= hi);

/** Clear distance from a face of `el`, along an axis, until something stops you. */
export function clearFrom(world, el, axis, sign, { at = null, band = null, ignore = new Set(), limit = 72 } = {}) {
  const from = sign > 0 ? el.hi[axis] : el.lo[axis];
  const other = axis === 0 ? 1 : 0;
  const lo = at ? at[0] : el.lo[other], hi = at ? at[1] : el.hi[other];
  const zlo = band ? band[0] : el.lo[2], zhi = band ? band[1] : el.hi[2];
  let best = limit;
  for (const e of obstacles(world)) {
    if (e === el || ignore.has(e.id) || e.meta.hostedBy === el.id || el.meta.hostedBy === e.id) continue;
    if (e.hi[2] <= zlo + 0.2 || e.lo[2] >= zhi - 0.2) continue;          // not at this height
    if (e.hi[other] <= lo + 0.2 || e.lo[other] >= hi - 0.2) continue;    // not in front of it
    const d = sign > 0 ? e.lo[axis] - from : from - e.hi[axis];
    if (d >= -0.2 && d < best) best = +d.toFixed(1);
  }
  return best;
}

/** The long axis of a thing you stand or sit in front of, and which way you face it. */
function approach(world, el) {
  const wide = (el.hi[0] - el.lo[0]) >= (el.hi[1] - el.lo[1]);
  const axis = wide ? 1 : 0;                       // you face across its narrow way
  const mid = [50, 120];
  const sign = (el.lo[axis] + el.hi[axis]) / 2 > mid[axis] ? -1 : 1;
  return { axis, sign };
}

const test = (id, pass, is, want, basis, note) =>
  ({ id, ok: pass, is, want, basis, note: note || null });

// ---------------------------------------------------------------- sitting
export function sitAtTable(world, { seat = 'bench.W', top = 'table', stature = 72 } = {}) {
  const f = figure(stature);
  const s = world.get(seat), t = world.get(top);
  if (!s || !t) return { task: 'sit at the table', ok: false, why: `no ${!s ? seat : top}` };
  const deck = world.all().filter(e => e.meta.role === 'floor sheathing');
  const fz = Math.max(...deck.map(e => e.hi[2]));
  const seatH = +(s.hi[2] - fz).toFixed(1);
  const seatDepth = +Math.min(s.hi[0] - s.lo[0], s.hi[1] - s.lo[1]).toFixed(1);
  const tableH = +(t.hi[2] - fz).toFixed(1);
  const rest = +(tableH - seatH).toFixed(1);
  const thigh = +(t.lo[2] - s.hi[2]).toFixed(1);
  // knee room: from the front edge of the seat, forward under the table, until
  // something stops your shins. A table leg counts.
  const a = approach(world, s);
  const front = a.sign > 0 ? s.hi[a.axis] : s.lo[a.axis];
  const kneeBand = [fz + 6, s.hi[2] + f.thighClearance];
  // What stops your shins, and what to blame for it. A table leg in the knee zone
  // is the commonest reason a table you fit at is a table you cannot sit at.
  let knee = f.buttockKnee + 6, blame = null;
  for (const e of obstacles(world)) {
    if (e === s || e === t) continue;
    if (e.hi[2] <= kneeBand[0] + 0.2 || e.lo[2] >= kneeBand[1] - 0.2) continue;
    const o = a.axis === 0 ? 1 : 0;
    if (e.hi[o] <= s.lo[o] + 0.2 || e.lo[o] >= s.hi[o] - 0.2) continue;
    const d = a.sign > 0 ? e.lo[a.axis] - front : front - e.hi[a.axis];
    if (d >= -0.2 && d < knee) { knee = +d.toFixed(1); blame = e.id; }
  }
  const seatLen = +Math.max(s.hi[0] - s.lo[0], s.hi[1] - s.lo[1]).toFixed(0);
  // How many people you would actually put on it. Rounding 60/24 to three gave each
  // of them twenty inches and failed a bench that seats two at thirty each — the
  // metric was over-seating the bench and then blaming it.
  const places = Math.max(1, Math.floor(seatLen / 24));
  const elbow = +(seatLen / places).toFixed(0);
  return { task: 'sit at the table', at: [seat, top], tests: [
    test('seat height', ok(seatH, 16, 19), seatH, '16–19 in', 'popliteal height ' + f.popliteal + ' in'),
    test('seat depth', ok(seatDepth, 15, f.buttockKnee - 2), seatDepth, `15–${f.buttockKnee - 2} in`,
      'buttock-popliteal: deeper than this and the front edge cuts behind your knee'),
    test('table above the seat', ok(rest, 8, 12), rest, '8–12 in', `seated elbow rest ${f.elbowRest} in`),
    test('thigh clearance under the top', ok(thigh, f.thighClearance + 1), thigh, `≥ ${(f.thighClearance + 1).toFixed(1)} in`,
      'thigh clearance ' + f.thighClearance + ' in plus an inch'),
    test('knee room forward', ok(knee, f.buttockKnee), knee, `≥ ${f.buttockKnee} in`,
      'buttock-knee length', blame && knee < f.buttockKnee ? `${blame} is in the way` : null),
    test('elbow room each', ok(elbow, 24), elbow, '≥ 24 in',
      `${seatLen} in of bench, ${places} place${places === 1 ? '' : 's'}`)
  ] };
}

export function sitOnTheToilet(world, { wc = 'wc', stature = 72 } = {}) {
  const f = figure(stature);
  const e = world.get(wc);
  if (!e) return { task: 'sit on the toilet', ok: false, why: 'no wc' };
  const deck = world.all().filter(x => x.meta.role === 'floor sheathing');
  const fz = Math.max(...deck.map(x => x.hi[2]));
  const seatH = +(e.hi[2] - fz).toFixed(1);
  const a = approach(world, e);
  const other = a.axis === 0 ? 1 : 0;
  const front = clearFrom(world, e, a.axis, a.sign, { band: [fz + 6, fz + f.sittingHeight] });
  const left = clearFrom(world, e, other, -1, { band: [fz + 6, fz + f.sittingHeight] });
  const right = clearFrom(world, e, other, 1, { band: [fz + 6, fz + f.sittingHeight] });
  const half = (e.hi[other] - e.lo[other]) / 2;
  return { task: 'sit on the toilet', at: [wc], tests: [
    test('seat height', ok(seatH, 17, 19), seatH, '17–19 in', 'ADA 604.4; popliteal ' + f.popliteal),
    test('clear in front', ok(front, 21), front, '≥ 21 in', 'IRC R307.1'),
    test('knee room forward', ok(front, f.buttockKnee), front, `≥ ${f.buttockKnee} in`, 'buttock-knee length'),
    test('centreline to the left', ok(left + half, 15), +(left + half).toFixed(1), '≥ 15 in', 'IRC R307.1'),
    test('centreline to the right', ok(right + half, 15), +(right + half).toFixed(1), '≥ 15 in', 'IRC R307.1'),
    test('elbow room', ok(Math.min(left, right) + half, f.shoulderBreadth / 2 + 3),
      +(Math.min(left, right) + half).toFixed(1), `≥ ${(f.shoulderBreadth / 2 + 3).toFixed(1)} in`,
      'half a shoulder plus three inches to move your arms')
  ] };
}

// ---------------------------------------------------------------- standing work
/** A toe kick: the recess at the bottom of a cabinet that lets you stand close to it. */
export function toeKick(world, id) {
  const el = world.get(id);
  if (!el) return null;
  const deck = world.all().filter(x => x.meta.role === 'floor sheathing');
  const fz = Math.max(...deck.map(x => x.hi[2]));
  const a = approach(world, el);
  const face = a.sign > 0 ? el.hi[a.axis] : el.lo[a.axis];
  // Found by geometry, not by a label. Marked with `kick: <id>` in meta, the key
  // never survived `put` and every cabinet in the building reported no toe kick
  // while standing on one.
  // The plinth is the thing under the carcass that covers most of its footprint,
  // and the toe kick is how far *that* is set back. Taking the deepest setback of
  // anything at the base reported a sixteen inch toe kick, because a pipe stub
  // under the cabinet is set back sixteen inches and is not a plinth.
  const other = a.axis === 0 ? 1 : 0;
  const span = (el.hi[other] - el.lo[other]) * (el.hi[a.axis] - el.lo[a.axis]);
  let plinth = null, bestOverlap = 0;
  for (const e of obstacles(world)) {
    if (e === el || e.kind === 'run') continue;
    if (e.lo[2] > fz + 1 || e.hi[2] > el.lo[2] + 0.5) continue;         // sits on the floor, under the carcass
    // ...and is about the size of the carcass. The deck is under everything and
    // overlaps every cabinet completely, so it won the vote and every toe kick in
    // the building measured zero against the floor.
    const own = (e.hi[other] - e.lo[other]) * (e.hi[a.axis] - e.lo[a.axis]);
    if (own > span * 2.5) continue;
    const ov = Math.max(0, Math.min(e.hi[other], el.hi[other]) - Math.max(e.lo[other], el.lo[other])) *
               Math.max(0, Math.min(e.hi[a.axis], el.hi[a.axis]) - Math.max(e.lo[a.axis], el.lo[a.axis]));
    if (ov > bestOverlap) { bestOverlap = ov; plinth = e; }
  }
  if (!plinth || bestOverlap < span * 0.4) return { id, depth: 0, height: +(el.lo[2] - fz).toFixed(1), plinth: null };
  const recess = Math.max(0, +(a.sign > 0 ? face - plinth.hi[a.axis] : plinth.lo[a.axis] - face).toFixed(1));
  return { id, depth: recess, height: +(el.lo[2] - fz).toFixed(1), plinth: plinth.id };
}

export function standingWork(world, { id, name, stature = 72, kind = 'counter' } = {}) {
  const f = figure(stature);
  const el = world.get(id);
  if (!el) return { task: name, ok: false, why: `no ${id}` };
  const deck = world.all().filter(x => x.meta.role === 'floor sheathing');
  const fz = Math.max(...deck.map(x => x.hi[2]));
  const h = +(el.hi[2] - fz).toFixed(1);
  const a = approach(world, el);
  const front = clearFrom(world, el, a.axis, a.sign, { band: [fz + 12, fz + f.shoulder] });
  const overhead = clearFrom(world, el, 2, 1, { band: [el.hi[2], el.hi[2] + 0.1] }) ;
  // anything above the worktop within head height
  let head = 999;
  for (const e of obstacles(world)) {
    if (e === el || e.meta.hostedBy === id) continue;
    // A hob standing on the worktop is what the worktop is for. Counted as an
    // obstruction above it, the galley failed for having a cooker in it.
    if (Math.abs(e.lo[2] - el.hi[2]) < 1.5) continue;
    if (e.lo[2] < el.hi[2] + 1) continue;
    if (e.hi[0] <= el.lo[0] || e.lo[0] >= el.hi[0] || e.hi[1] <= el.lo[1] || e.lo[1] >= el.hi[1]) continue;
    const d = +(e.lo[2] - el.hi[2]).toFixed(1);
    if (d < head) head = d;
  }
  // The toe kick belongs to the carcass, not to the basin dropped into it. Asked of
  // the sink, this found no plinth under the sink — which is true, and the third
  // time in this project a measurement has been taken of a fixture instead of the
  // thing you actually walk up to.
  const kick = toeKick(world, el.meta.hostedBy && world.get(el.meta.hostedBy) ? el.meta.hostedBy : id);
  const want = kind === 'sink' ? [39, 45] : [f.elbow - 6, f.elbow - 2];
  return { task: name, at: [id], tests: [
    test('working height', ok(h, want[0], want[1]), h, `${want[0].toFixed(0)}–${want[1].toFixed(0)} in`,
      kind === 'sink' ? 'Grandjean: the work is at the bottom of the bowl' : `elbow ${f.elbow} in less two to six`),
    test('room to stand in front', ok(front, 30), front, '≥ 30 in', 'a body plus room to turn to the bench'),
    test('toe kick', ok(kick ? kick.depth : 0, 2.5), kick ? kick.depth : 0, '≥ 2.5 in',
      'without one you stand back from the front and lean over the work'),
    test('clear above the worktop', ok(head, 18), head === 999 ? 'open' : head, '≥ 18 in',
      'room to get a pan in and out')
  ] };
}

/** Storage you should not have to get on the floor for. */
export function storageAt(world, { id, name, stature = 72, daily = false } = {}) {
  const f = figure(stature);
  const el = world.get(id);
  if (!el) return { task: name, ok: false, why: `no ${id}` };
  const deck = world.all().filter(x => x.meta.role === 'floor sheathing');
  const fz = Math.max(...deck.map(x => x.hi[2]));
  const bottom = +(el.lo[2] - fz).toFixed(1), top = +(el.hi[2] - fz).toFixed(1);
  const tests = [];
  // Nobody should have to crouch for the things they open every day. A base
  // cupboard with a door is not one of them — asked of every carcass, this failed
  // the galley for having a cupboard under the worktop, which is what a worktop is.
  if (daily) tests.push(
    test('opens above knee height', ok(bottom, f.knee), bottom, `≥ ${f.knee} in`,
      'below the knee you are kneeling on the floor to use it, every time'));
  return { task: name, at: [id], tests: [
    ...tests,
    test('within reach without a stretch', ok(top, 0, f.shoulder), top, `≤ ${f.shoulder} in`, 'shoulder height'),
    test('not above fingertip reach', ok(top, 0, f.overheadReach), top, `≤ ${f.overheadReach} in`, 'overhead reach')
  ] };
}

// ---------------------------------------------------------------- the sweep
/**
 * Stand a body at every square foot of floor and write down everything it hits.
 *
 * Eleven posed activities test eleven places. This tests all of them, and what it
 * is looking for is not a defect in any one spot — it is the list of members that
 * a person walking around normally would collide with, ranked by how much floor
 * each one spoils.
 */
export function sweep(world, { stature = 72, step = 4, fitMap } = {}) {
  const f = figure(stature);
  const deck = world.all().filter(x => x.meta.role === 'floor sheathing');
  const fz = Math.max(...deck.map(x => x.hi[2]));
  const obs = obstacles(world);
  const hits = new Map();
  const fm = fitMap;
  const { n, at, lo } = fm;
  const half = f.shoulderBreadth / 2, depth = f.bodyDepth / 2;
  let stood = 0;
  const cellFt = (fm.step * fm.step) / 144;
  for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    if (!fm.fits.STAND[at(i, j)]) continue;
    stood++;
    const x = lo[0] + (i + 0.5) * fm.step, y = lo[1] + (j + 0.5) * fm.step;
    const box = { lo: [x - half, y - depth, fz], hi: [x + half, y + depth, fz + f.stature] };
    for (const e of obs) {
      if ([0, 1, 2].some(k => e.lo[k] >= box.hi[k] - 0.5 || e.hi[k] <= box.lo[k] + 0.5)) continue;
      const h = hits.get(e.id) || { id: e.id, kind: e.kind, layer: e.layer, cells: 0,
        z: [+(e.lo[2] - fz).toFixed(0), +(e.hi[2] - fz).toFixed(0)] };
      h.cells++; hits.set(e.id, h);
    }
  }
  const out = [...hits.values()].map(h => ({ ...h, sqft: +(h.cells * cellFt).toFixed(1) }))
    .sort((a, b) => b.cells - a.cells);
  // A conductor clipped to a wall is where conductors go, and a body standing at
  // the wall touching it with a shoulder is not a finding. A conductor in open air
  // is. The difference is whether anything solid is within a hand's breadth of it.
  const solidsOnly = obs.filter(e => e.kind !== 'run');
  const inOpenAir = (e) => !solidsOnly.some(o =>
    [0, 1, 2].every(k => o.lo[k] <= e.hi[k] + 4 && o.hi[k] >= e.lo[k] - 4));
  const services = out.filter(h => h.kind === 'run' || h.layer === 'services');
  const strung = services.filter(h => { const e = world.get(h.id); return e && inOpenAir(e); });
  return { stood: +(stood * cellFt).toFixed(1), hit: out, services, strung };
}

/** Everything, for one body. */
export function comfort(world, { stature = 72, fitMap } = {}) {
  const tasks = [
    sitAtTable(world, { stature }),
    sitOnTheToilet(world, { stature }),
    standingWork(world, { id: 'sink', name: 'use the sink', stature, kind: 'sink' }),
    standingWork(world, { id: 'top.galley', name: 'cook', stature, kind: 'counter' }),
    storageAt(world, { id: 'fridge', name: 'use the fridge', stature, daily: true }),
    storageAt(world, { id: 'cab.galley', name: 'use the galley cupboard', stature })
  ];
  for (const t of tasks) if (t.tests) {
    t.failed = t.tests.filter(x => !x.ok);
    t.ok = t.failed.length === 0;
  }
  return { tasks, comfortable: tasks.filter(t => t.ok).length, of: tasks.length,
    sweep: fitMap ? sweep(world, { stature, fitMap }) : null };
}
